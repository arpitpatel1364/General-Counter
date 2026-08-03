"""
Core detection and tracking engine.

Runs YOLO11n + ByteTrack on an RTSP stream.
Handles all three ROI modes:
  - line:      IN / OUT counting via line-crossing
  - rectangle: real-time occupancy inside a box
  - polygon:   real-time occupancy inside a polygon
"""
import os
# Suppress noisy FFmpeg/HEVC decoding warnings in console
os.environ["FFMPEG_LOG_LEVEL"] = "quiet"
os.environ["OPENCV_FFMPEG_LOGLEVEL"] = "-8"
os.environ["OPENCV_LOG_LEVEL"] = "quiet"

import cv2
cv2.setLogLevel(0)
import numpy as np
import time
import logging
import threading
from typing import Optional
from ultralytics import YOLO
import torch
from config import settings
import database as db

# PyTorch 2.6+ fix for ultralytics weights_only load
_original_load = torch.load
def _unsafe_load(*args, **kwargs):
    kwargs["weights_only"] = False
    return _original_load(*args, **kwargs)
torch.load = _unsafe_load

logger = logging.getLogger(__name__)


def _point_side(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
    """Signed cross-product — positive = one side, negative = other."""
    return (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)


def _inside_polygon(px: float, py: float, poly: list) -> bool:
    """Ray-casting algorithm for point-in-polygon."""
    n = len(poly)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi):
            inside = not inside
        j = i
    return inside


class Detector:
    """
    One Detector instance per camera.
    Runs in its own thread; exposes the latest annotated frame + stats.
    """

    def __init__(self, camera_id: int, rtsp_url: str, roi_type: str, roi_data: dict, target_class: int = 0):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.roi_type = roi_type        # line | rectangle | polygon | None
        self.roi_data = roi_data or {}
        self.target_class = target_class

        self.model = None
        self.status = "stopped" # stopped | loading | running
        self.session_id = None

        self._frame: Optional[np.ndarray] = None
        self._lock = threading.Lock()
        self._stop = threading.Event()

        # Stats
        self.fps = 0.0
        self.in_count = 0
        self.out_count = 0
        self.roi_occupancy = 0          # for rectangle / polygon modes
        self.online = False
        self.frame_id = 0

        # Line-crossing state: track_id -> last signed side
        self._prev_side: dict[int, float] = {}
        self._last_cross_time: dict[int, float] = {}
        self._prev_inside_ids: set[int] = set()

        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_frame(self) -> Optional[np.ndarray]:
        with self._lock:
            return self._frame.copy() if self._frame is not None else None

    def stop(self):
        self._stop.set()
        self._thread.join(timeout=5)

    def update_roi(self, roi_type: str, roi_data: dict):
        self.roi_type = roi_type
        self.roi_data = roi_data or {}
        with self._lock:
            self._prev_side.clear()
            self._last_cross_time.clear()

    def start_counting(self, session_id: int, target_class: int):
        with self._lock:
            self.status = "loading"
            self.session_id = session_id
            self.target_class = target_class
            
        # Load model in a separate thread so it doesn't block the API response
        def _loader():
            try:
                logger.info("Camera %d: Loading model...", self.camera_id)
                model = YOLO(settings.MODEL)
                with self._lock:
                    if self.status == "loading": # in case stop was called during load
                        self.model = model
                        self.status = "running"
                        logger.info("Camera %d: Model loaded and running.", self.camera_id)
            except Exception as e:
                logger.error("Camera %d: Failed to load model: %s", self.camera_id, e)
                with self._lock:
                    self.status = "stopped"
                    self.session_id = None
        
        threading.Thread(target=_loader, daemon=True).start()

    def stop_counting(self):
        with self._lock:
            self.status = "stopped"
            self.model = None
            self.session_id = None
        
        # Free RAM/VRAM
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.info("Camera %d: Model unloaded.", self.camera_id)

    # ------------------------------------------------------------------
    # Internal loop
    # ------------------------------------------------------------------

    def _run(self):
        while not self._stop.is_set():
            cap = self._open_stream()
            if cap is None:
                time.sleep(settings.RECONNECT_DELAY)
                continue

            self.online = True
            db.set_camera_active(self.camera_id, True)
            t_prev = time.time()
            frame_count = 0

            retry_count = 0

            while not self._stop.is_set():
                ret, frame = cap.read()
                if not ret:
                    retry_count += 1
                    if retry_count > 30:
                        logger.warning("Camera %d: lost frame — reconnecting", self.camera_id)
                        break
                    time.sleep(0.1)
                    continue
                else:
                    retry_count = 0
                    
                # Drop oldest buffered frame to prevent lag accumulation
                # cap.grab()

                try:
                    annotated = self._process(frame)
                except Exception as e:
                    logger.error("Camera %d: Error processing frame: %s", self.camera_id, e)
                    annotated = frame.copy()

                frame_count += 1
                now = time.time()
                elapsed = now - t_prev
                if elapsed >= 1.0:
                    self.fps = frame_count / elapsed
                    frame_count = 0
                    t_prev = now

                # Throttle to configured FPS
                with self._lock:
                    self._frame = annotated
                    self.frame_id += 1

                target_delay = 1.0 / settings.FRAME_RATE
                time.sleep(max(0, target_delay - (time.time() - now)))

            cap.release()
            self.online = False
            db.set_camera_active(self.camera_id, False)
            if not self._stop.is_set():
                logger.info("Camera %d: reconnecting in %ds", self.camera_id, settings.RECONNECT_DELAY)
                time.sleep(settings.RECONNECT_DELAY)

    def _open_stream(self) -> Optional[cv2.VideoCapture]:
        logger.info("Camera %d: connecting to %s", self.camera_id, self.rtsp_url)
        import os
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
        cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not cap.isOpened():
            logger.error("Camera %d: failed to open stream", self.camera_id)
            return None
        return cap

    def _process(self, frame: np.ndarray) -> np.ndarray:
        """Run YOLO tracking and apply ROI logic, return annotated frame."""
        
        if self.model is None or self.status != "running":
            return frame
            
        imgsz = settings.IMGSZ
        target_classes = None if self.target_class == -1 else [self.target_class]
        
        results = self.model.track(
            frame,
            classes=target_classes,
            conf=settings.CONFIDENCE,
            iou=settings.IOU,
            tracker=settings.TRACKER,
            imgsz=imgsz,
            persist=True,
            verbose=False,
        )

        result = results[0] if results else None
        
        annotated = result.plot() if result else frame.copy()

        # Overlay ROI geometry
        if self.roi_type == "line":
            pts = self._get_scaled_pts(frame.shape)
            if len(pts) >= 2:
                x1, y1 = pts[0]
                x2, y2 = pts[1]
                cv2.line(annotated, (int(x1), int(y1)), (int(x2), int(y2)), (255, 128, 0), 2)
                
                # Draw direction arrow if applicable
                direction = self.roi_data.get('direction', 'both')
                dx = x2 - x1
                dy = y2 - y1
                length = np.hypot(dx, dy)
                if length > 0:
                    nx = -dy / length
                    ny = dx / length
                    mx = (x1 + x2) / 2
                    my = (y1 + y2) / 2
                    offset = 15
                    if direction in ('both', 'in'):
                        cv2.arrowedLine(annotated, (int(mx + nx * offset), int(my + ny * offset)), (int(mx + nx * (offset+20)), int(my + ny * (offset+20))), (0, 255, 0), 2, tipLength=0.3)
                    if direction in ('both', 'out'):
                        cv2.arrowedLine(annotated, (int(mx - nx * offset), int(my - ny * offset)), (int(mx - nx * (offset+20)), int(my - ny * (offset+20))), (0, 0, 255), 2, tipLength=0.3)
                    if direction == 'reversed':
                        cv2.arrowedLine(annotated, (int(mx + nx * offset), int(my + ny * offset)), (int(mx + nx * (offset+20)), int(my + ny * (offset+20))), (0, 0, 255), 2, tipLength=0.3)
                        cv2.arrowedLine(annotated, (int(mx - nx * offset), int(my - ny * offset)), (int(mx - nx * (offset+20)), int(my - ny * (offset+20))), (0, 255, 0), 2, tipLength=0.3)

        elif self.roi_type == "rectangle":
            pts = self._get_scaled_pts(frame.shape)
            if len(pts) >= 2:
                rx1, ry1 = pts[0]
                rx2, ry2 = pts[1]
                cv2.rectangle(annotated, (int(rx1), int(ry1)), (int(rx2), int(ry2)), (0, 255, 0), 2)
                
        elif self.roi_type == "polygon":
            pts = self._get_scaled_pts(frame.shape)
            if len(pts) >= 3:
                poly_pts = np.array(pts, np.int32).reshape((-1, 1, 2))
                cv2.polylines(annotated, [poly_pts], isClosed=True, color=(0, 255, 0), thickness=2)

        if result is not None and result.boxes is not None:
            boxes = result.boxes
            ids = boxes.id  # track IDs (may be None if no tracks yet)

            with self._lock:
                current_inside_ids = set()
                occupants = 0
                
                # Prune stale tracks periodically to prevent memory leaks while keeping history
                if len(self._prev_side) > 2000:
                    now = time.time()
                    self._prev_side = {k: v for k, v in self._prev_side.items() if now - self._last_cross_time.get(k, 0) < 300}
                    self._last_cross_time = {k: v for k, v in self._last_cross_time.items() if now - v < 300}

                for i, box in enumerate(boxes.xyxy):
                    x1, y1, x2, y2 = map(int, box.tolist())
                    
                    # Use foot point (bottom-center) for crossing logic
                    cx, cy = (x1 + x2) // 2, y2
                    track_id = int(ids[i].item()) if ids is not None else -1

                    # ROI logic
                    if self.roi_type == "line" and track_id >= 0:
                        self._check_line_crossing(track_id, cx, cy, frame.shape)
                    elif self.roi_type == "rectangle":
                        if self._inside_rect(cx, cy, frame.shape):
                            occupants += 1
                            if track_id >= 0:
                                current_inside_ids.add(track_id)
                    elif self.roi_type == "polygon":
                        poly = self._get_scaled_pts(frame.shape)
                        if poly and _inside_polygon(cx, cy, poly):
                            occupants += 1
                            if track_id >= 0:
                                current_inside_ids.add(track_id)

                if self.roi_type in ("rectangle", "polygon"):
                    self.roi_occupancy = occupants
                    self._check_region_crossing(current_inside_ids)

        return annotated

    # ------------------------------------------------------------------
    # ROI helpers
    # ------------------------------------------------------------------

    def _get_scaled_pts(self, frame_shape) -> list:
        h, w = frame_shape[:2]
        pts = self.roi_data.get("points", [])
        return [[p[0] * w, p[1] * h] for p in pts]

    def _crossing_direction(self, prev: float, side: float, direction: str) -> Optional[str]:
        if prev < 0 and side > 0:
            if direction in ('both', 'in'): return "IN"
            if direction == 'reversed': return "OUT"
        elif prev > 0 and side < 0:
            if direction in ('both', 'out'): return "OUT"
            if direction == 'reversed': return "IN"
        return None

    def _check_line_crossing(self, track_id: int, cx: int, cy: int, frame_shape: tuple):
        pts = self._get_scaled_pts(frame_shape)
        if len(pts) < 2:
            return
        x1, y1 = pts[0]
        x2, y2 = pts[1]

        side = _point_side(cx, cy, x1, y1, x2, y2)
        
        # Lock is already held by caller (_process)
        prev = self._prev_side.get(track_id)
        last_time = self._last_cross_time.get(track_id, 0.0)
        now = time.time()

        if prev is not None and abs(prev) > 1e-5 and abs(side) > 1e-5:
            direction = self.roi_data.get('direction', 'both')
            cross_type = self._crossing_direction(prev, side, direction)
            
            # Cooldown of 1.0 seconds per track ID
            if cross_type and (now - last_time > 1.0):
                if cross_type == "IN":
                    self.in_count += 1
                else:
                    self.out_count += 1
                    
                db.log_event(self.camera_id, self.session_id, track_id, cross_type)
                self._last_cross_time[track_id] = now

        self._prev_side[track_id] = side

    def _inside_rect(self, cx: int, cy: int, frame_shape: tuple) -> bool:
        pts = self._get_scaled_pts(frame_shape)
        if len(pts) < 2:
            return False
        rx1, ry1 = pts[0]
        rx2, ry2 = pts[1]
        return min(rx1, rx2) <= cx <= max(rx1, rx2) and min(ry1, ry2) <= cy <= max(ry1, ry2)

    def _check_region_crossing(self, current_inside_ids: set):
        new_ins = current_inside_ids - self._prev_inside_ids
        new_outs = self._prev_inside_ids - current_inside_ids
        
        now = time.time()
        for tid in new_ins:
            # Check cooldown to prevent flickering
            if now - self._last_cross_time.get(tid, 0) > 1.0:
                self.in_count += 1
                db.log_event(self.camera_id, self.session_id, tid, "IN")
                self._last_cross_time[tid] = now
                
        for tid in new_outs:
            if now - self._last_cross_time.get(tid, 0) > 1.0:
                self.out_count += 1
                db.log_event(self.camera_id, self.session_id, tid, "OUT")
                self._last_cross_time[tid] = now
                
        self._prev_inside_ids = current_inside_ids


