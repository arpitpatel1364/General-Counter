"""
Camera management endpoints.
"""
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.camera_manager import camera_manager
import database as db
from config import settings

router = APIRouter(prefix="/api/cameras", tags=["cameras"])


class CameraCreate(BaseModel):
    name: str
    location: str
    rtsp_url: str


class ROIUpdate(BaseModel):
    roi_type: str       # line | rectangle | polygon
    roi_data: dict      # {"points": [[x,y], ...]}


@router.get("")
def list_cameras():
    cams = db.list_cameras()
    active_ids = camera_manager.active_camera_ids()
    for c in cams:
        c["running"] = c["id"] in active_ids
        if c["roi_data"]:
            c["roi_data"] = json.loads(c["roi_data"])
    return cams


@router.post("")
def create_camera(payload: CameraCreate):
    total = len(db.list_cameras())
    if total >= settings.MAX_CAMERAS:
        raise HTTPException(
            status_code=400,
            detail=f"Max cameras ({settings.MAX_CAMERAS}) reached. Increase MAX_CAMERAS in .env.",
        )
    cam_id = db.add_camera(payload.name, payload.location, payload.rtsp_url)
    return {"id": cam_id, "message": "Camera created"}


@router.get("/{camera_id}")
def get_camera(camera_id: int):
    cam = db.get_camera(camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    if cam["roi_data"]:
        cam["roi_data"] = json.loads(cam["roi_data"])
    cam["running"] = camera_id in camera_manager.active_camera_ids()
    return cam


@router.delete("/{camera_id}")
def delete_camera(camera_id: int):
    camera_manager.stop_camera(camera_id)
    db.delete_camera(camera_id)
    return {"message": "Camera deleted"}


@router.post("/{camera_id}/start")
def start_camera(camera_id: int):
    if not camera_manager.can_add_camera() and camera_id not in camera_manager.active_camera_ids():
        raise HTTPException(
            status_code=400,
            detail=f"Max cameras ({settings.MAX_CAMERAS}) already running.",
        )
    ok = camera_manager.start_camera(camera_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Failed to start camera")
    return {"message": "Camera started"}


@router.post("/{camera_id}/stop")
def stop_camera(camera_id: int):
    camera_manager.stop_camera(camera_id)
    return {"message": "Camera stopped"}


@router.put("/{camera_id}/roi")
def update_roi(camera_id: int, payload: ROIUpdate):
    cam = db.get_camera(camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    db.update_camera_roi(camera_id, payload.roi_type, payload.roi_data)
    camera_manager.update_roi(camera_id, payload.roi_type, payload.roi_data)
    return {"message": "ROI updated"}


@router.get("/{camera_id}/stats")
def camera_stats(camera_id: int):
    det = camera_manager.get_detector(camera_id)
    if not det:
        return {"online": False, "in_count": 0, "out_count": 0, "roi_occupancy": 0, "fps": 0}
    return {
        "online": det.online,
        "in_count": det.in_count,
        "out_count": det.out_count,
        "roi_occupancy": det.roi_occupancy,
        "fps": round(det.fps, 1),
        "roi_type": det.roi_type,
    }
