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

@router.get("/{camera_id}")
def get_sessions(camera_id: int):
    return db.list_sessions(camera_id)

@router.get("")
def get_all_sessions():
    return db.list_sessions()

@router.post("/start")
def start_session(payload: SessionStart):
    cam = db.get_camera(payload.camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    db.update_camera_target_class(payload.camera_id, payload.target_class)
    session_id = db.create_session(payload.camera_id, payload.name, payload.target_class)
    camera_manager.start_counting(payload.camera_id, session_id, payload.target_class)
    
    return {"message": "Session started", "session_id": session_id}

@router.post("/{session_id}/resume")
def resume_session(session_id: int):
    camera_id = db.resume_session(session_id)
    if camera_id is not None:
        camera_manager.start_counting(camera_id)
        return {"message": "Session resumed"}
    return {"error": "Session not found"}

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
