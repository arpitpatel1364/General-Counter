"""
MJPEG live stream endpoint.
"""
import cv2
import time
import logging
from fastapi import APIRouter, Query, Response
from fastapi.responses import StreamingResponse
from services.camera_manager import camera_manager
from config import settings
import database as db

router = APIRouter(prefix="/api/stream", tags=["stream"])
logger = logging.getLogger(__name__)


import asyncio

async def _mjpeg_generator(camera_id: int):
    det = camera_manager.get_detector(camera_id)
    if det is None:
        yield b""
        return

    last_frame_id = -1
    while True:
        if det.frame_id == last_frame_id:
            await asyncio.sleep(0.05)
            continue
            
        last_frame_id = det.frame_id
        
        # Retrieve pre-compressed JPEG frame from background thread to avoid CPU encoding inside async loop
        jpeg_data = None
        with det._lock:
            if hasattr(det, "_jpeg_frame"):
                jpeg_data = det._jpeg_frame

        if jpeg_data is None:
            # Fallback if pre-compressed frame is not available yet
            frame = det.get_frame()
            if frame is None:
                await asyncio.sleep(0.05)
                continue
            ret, buf = cv2.imencode(
                ".jpg", frame,
                [cv2.IMWRITE_JPEG_QUALITY, settings.JPEG_QUALITY],
            )
            if not ret:
                await asyncio.sleep(0.05)
                continue
            jpeg_data = buf.tobytes()

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + jpeg_data
            + b"\r\n"
        )


@router.get("/{camera_id}")
def live_stream(camera_id: int, snapshot: int = Query(0)):
    if snapshot == 1:
        # Try getting frame from running detector first
        det = camera_manager.get_detector(camera_id)
        if det:
            frame = det.get_frame()
            if frame is not None:
                ret, buf = cv2.imencode(".jpg", frame)
                if ret:
                    return Response(content=buf.tobytes(), media_type="image/jpeg")
        
        # Fallback: connect to RTSP directly for a single frame
        cam = db.get_camera(camera_id)
        if not cam:
            return Response(status_code=404)
            
        import os
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
        cap = cv2.VideoCapture(cam["rtsp_url"])
        if not cap.isOpened():
            return Response(status_code=500, content="Cannot open RTSP stream")
            
        ret = False
        frame = None
        # Try reading up to 10 times because the first few frames might be empty or corrupt
        for _ in range(10):
            ret, frame = cap.read()
            if ret and frame is not None:
                break
            time.sleep(0.1)
            
        cap.release()
        
        if ret and frame is not None:
            success, buf = cv2.imencode(".jpg", frame)
            if success:
                return Response(content=buf.tobytes(), media_type="image/jpeg")
        
        return Response(status_code=500, content="Failed to fetch snapshot")
        
    return StreamingResponse(
        _mjpeg_generator(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
