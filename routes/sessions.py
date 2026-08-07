"""
Session (Lap) management endpoints.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import database as db
from services.camera_manager import camera_manager

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

class SessionStart(BaseModel):
    camera_id: int
    name: str
    target_class: int = 0

class SessionStop(BaseModel):
    camera_id: int

class SessionRename(BaseModel):
    name: str

@router.get("")
def get_all_sessions():
    return db.list_sessions()

@router.get("/activity-logs")
def get_activity_logs():
    return db.list_session_activity_logs()

@router.get("/{camera_id}")
def get_sessions(camera_id: int):
    return db.list_sessions(camera_id)

@router.post("/start")
def start_session(payload: SessionStart):
    cam = db.get_camera(payload.camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    det = camera_manager.get_detector(payload.camera_id)
    if not det:
        # Auto-start camera if it's not running
        success = camera_manager.start_camera(payload.camera_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to start the camera stream automatically.")
        det = camera_manager.get_detector(payload.camera_id)
        
    db.update_camera_target_class(payload.camera_id, payload.target_class)
    session_id = db.create_session(payload.camera_id, payload.name, payload.target_class)
    camera_manager.start_counting(payload.camera_id, session_id, payload.target_class)
    
    return {"message": "Session started", "session_id": session_id}

@router.post("/{session_id}/resume")
def resume_session(session_id: int):
    result = db.resume_session(session_id)
    if result is not None:
        camera_id, target_class = result
        
        det = camera_manager.get_detector(camera_id)
        if not det:
            success = camera_manager.start_camera(camera_id)
            if not success:
                raise HTTPException(status_code=500, detail="Failed to start the camera stream automatically.")
            det = camera_manager.get_detector(camera_id)
            
        camera_manager.start_counting(camera_id, session_id, target_class)
        return {"message": "Session resumed"}
    return {"error": "Session not found"}

@router.post("/pause")
def pause_session(payload: SessionStop):
    active = db.get_active_session(payload.camera_id)
    if active:
        db.log_session_activity(active['id'], 'pause', 'Session counting paused')
    camera_manager.stop_counting(payload.camera_id)
    return {"message": "Session paused"}

@router.post("/stop")
def stop_session(payload: SessionStop):
    db.close_active_session(payload.camera_id)
    camera_manager.stop_counting(payload.camera_id)
    return {"message": "Session stopped"}

@router.put("/{session_id}")
def rename_session(session_id: int, payload: SessionRename):
    db.rename_session(session_id, payload.name)
    return {"message": "Session renamed"}

@router.get("/{camera_id}/active")
def get_active(camera_id: int):
    session = db.get_active_session(camera_id)
    if not session:
        return {"active": False}
    return {"active": True, "session": session}
