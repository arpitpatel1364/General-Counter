"""
Core detection and tracking engine.

Runs YOLO11n + ByteTrack on an RTSP stream.
Handles all three ROI modes:
  - line:      IN / OUT counting via line-crossing
  - rectangle: real-time occupancy inside a box
  - polygon:   real-time occupancy inside a polygon
"""
import cv2
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

    def __init__(self, camera_id: int, rtsp_url: str, roi_type: str, roi_data: dict):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.roi_type = roi_type        # line | rectangle | polygon | None
        self.roi_data = roi_data or {}

        self.model = YOLO(settings.MODEL)

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

            while not self._stop.is_set():
                ret, frame = cap.read()
                if not ret:
                    logger.warning("Camera %d: lost frame — reconnecting", self.camera_id)
                    break
                    
                # Drop oldest buffered frame to prevent lag accumulation
                cap.grab()

                annotated = self._process(frame)

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
        imgsz = min(settings.IMGSZ, 416)
        results = self.model.track(
            frame,
            classes=[0],                   # person only
            conf=settings.CONFIDENCE,
            iou=settings.IOU,
            tracker=settings.TRACKER,
            imgsz=imgsz,
            persist=True,
            verbose=False,
        )

        result = results[0] if results else None

        if result is not None and result.boxes is not None:
            boxes = result.boxes
            ids = boxes.id  # track IDs (may be None if no tracks yet)

            occupants = 0  # for rectangle / polygon
            
            # Prune stale tracks to prevent ghost crossings
            current_ids = set(int(x.item()) for x in ids) if ids is not None else set()
            with self._lock:
                self._prev_side = {k: v for k, v in self._prev_side.items() if k in current_ids}
                self._last_cross_time = {k: v for k, v in self._last_cross_time.items() if k in current_ids}

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
                elif self.roi_type == "polygon":
                    poly = self._get_scaled_pts(frame.shape)
                    if poly and _inside_polygon(cx, cy, poly):
                        occupants += 1

            if self.roi_type in ("rectangle", "polygon"):
                self.roi_occupancy = occupants

        return frame

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
        
        with self._lock:
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
                        
                    db.log_event(self.camera_id, track_id, cross_type)
                    self._last_cross_time[track_id] = now

            self._prev_side[track_id] = side

    def _inside_rect(self, cx: int, cy: int, frame_shape: tuple) -> bool:
        pts = self._get_scaled_pts(frame_shape)
        if len(pts) < 2:
            return False
        rx1, ry1 = pts[0]
        rx2, ry2 = pts[1]
        return min(rx1, rx2) <= cx <= max(rx1, rx2) and min(ry1, ry2) <= cy <= max(ry1, ry2)


