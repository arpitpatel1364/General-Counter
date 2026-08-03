"""
CameraManager — singleton that owns Detector instances.
Enforces MAX_CAMERAS from settings.
"""
import json
import logging
from typing import Dict, Optional
from detection.detector import Detector
import database as db
from config import settings

logger = logging.getLogger(__name__)


class CameraManager:
    def __init__(self):
        self._detectors: Dict[int, Detector] = {}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start_camera(self, camera_id: int) -> bool:
        """Start detection for an existing camera record."""
        if camera_id in self._detectors:
            logger.info("Camera %d already running", camera_id)
            return True

        if len(self._detectors) >= settings.MAX_CAMERAS:
            logger.warning("Max cameras (%d) reached", settings.MAX_CAMERAS)
            return False

        cam = db.get_camera(camera_id)
        if not cam:
            logger.error("Camera %d not found in DB", camera_id)
            return False

        roi_data = json.loads(cam["roi_data"]) if cam["roi_data"] else {}
        target_class = cam.get("target_class", 0)
        detector = Detector(
            camera_id=camera_id,
            rtsp_url=cam["rtsp_url"],
            roi_type=cam["roi_type"],
            roi_data=roi_data,
            target_class=target_class
        )
        self._detectors[camera_id] = detector
        
        # If there's an active session, start counting automatically
        active_session = db.get_active_session(camera_id)
        if active_session:
            detector.start_counting(active_session['id'], target_class)
            
        logger.info("Camera %d started", camera_id)
        return True

    def stop_camera(self, camera_id: int):
        det = self._detectors.pop(camera_id, None)
        if det:
            det.stop()
            db.set_camera_active(camera_id, False)
            logger.info("Camera %d stopped", camera_id)

    def stop_all(self):
        for cid in list(self._detectors.keys()):
            self.stop_camera(cid)

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_detector(self, camera_id: int) -> Optional[Detector]:
        return self._detectors.get(camera_id)

    def active_camera_ids(self) -> list:
        return list(self._detectors.keys())

    def can_add_camera(self) -> bool:
        return len(self._detectors) < settings.MAX_CAMERAS

    def update_roi(self, camera_id: int, roi_type: str, roi_data: dict):
        det = self._detectors.get(camera_id)
        if det:
            det.update_roi(roi_type, roi_data)

    def start_counting(self, camera_id: int, session_id: int, target_class: int):
        det = self._detectors.get(camera_id)
        if det:
            det.start_counting(session_id, target_class)

    def stop_counting(self, camera_id: int):
        det = self._detectors.get(camera_id)
        if det:
            det.stop_counting()

    # ------------------------------------------------------------------
    # Global stats aggregation
    # ------------------------------------------------------------------

    def global_stats(self) -> dict:
        total_in = sum(d.in_count for d in self._detectors.values())
        total_out = sum(d.out_count for d in self._detectors.values())
        
        # Calculate current inside based on roi type
        occupancy = 0
        for d in self._detectors.values():
            if d.roi_type in ("rectangle", "polygon"):
                occupancy += d.roi_occupancy
            else:
                occupancy += max(0, d.in_count - d.out_count)
                
        # To get the real "Total In/Out (Today)", we should fetch from DB
        # But for live dashboard, we can just aggregate DB stats for all cameras
        # Actually, for speed, we can use the DB for totals, and memory for occupancy
        today_in = 0
        today_out = 0
        for cid in db.list_cameras():
            stats = db.analytics_today(cid["id"])
            today_in += stats.get("total_in", 0)
            today_out += stats.get("total_out", 0)
            
        return {
            "total_in": today_in,
            "total_out": today_out,
            "current_inside": occupancy,
            "active_cameras": len(self._detectors),
        }


# Singleton
camera_manager = CameraManager()
