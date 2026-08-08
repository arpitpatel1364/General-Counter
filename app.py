"""
Sack Counter — FastAPI application entry point.

Run with:
    uvicorn app:app --host 0.0.0.0 --port 8000
"""
import logging
import os

# Suppress noisy FFmpeg/HEVC decoding warnings globally before cv2 is imported anywhere
os.environ["FFMPEG_LOG_LEVEL"] = "quiet"
os.environ["OPENCV_FFMPEG_LOGLEVEL"] = "-8"
os.environ["OPENCV_LOG_LEVEL"] = "quiet"

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.templating import Jinja2Templates

import database as db
from routes.cameras import router as cameras_router
from routes.stream import router as stream_router
from routes.analytics import router as analytics_router
from routes.sessions import router as sessions_router
from config import settings
from services.camera_manager import camera_manager
from ultralytics import YOLO

# PyTorch 2.6+ fix for ultralytics weights_only load
import torch
_original_load = torch.load
def _unsafe_load(*args, **kwargs):
    kwargs["weights_only"] = False
    return _original_load(*args, **kwargs)
torch.load = _unsafe_load

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
os.makedirs("logs", exist_ok=True)
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s  %(levelname)-8s  %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(settings.LOG_FILE),
    ],
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    db.init_db()
    logger.info("Sack Counter starting — MAX_CAMERAS=%d", settings.MAX_CAMERAS)
    
    # Resume active cameras
    for cam in db.list_cameras():
        if cam.get("active") == 1:
            camera_manager.start_camera(cam["id"])
            
    yield
    # Shutdown
    camera_manager.stop_all()
    logger.info("Sack Counter stopped")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Sack Counter",
    version="1.0.0",
    lifespan=lifespan,
)

# Static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# API routers
app.include_router(cameras_router)
app.include_router(stream_router)
app.include_router(analytics_router)
app.include_router(sessions_router)

_cached_model_classes = None

@app.get("/api/system/classes")
def get_model_classes():
    global _cached_model_classes
    if _cached_model_classes is not None:
        return _cached_model_classes
    try:
        model = YOLO(settings.MODEL)
        _cached_model_classes = model.names
        return _cached_model_classes
    except Exception as e:
        return {0: "Unknown (Error loading model)"}


@app.get("/api/system/settings")
def get_system_settings():
    return {
        "max_cameras": settings.MAX_CAMERAS,
        "model": settings.MODEL,
        "confidence": settings.CONFIDENCE,
        "iou": settings.IOU,
        "tracker": settings.TRACKER,
        "frame_rate": settings.FRAME_RATE,
        "jpeg_quality": settings.JPEG_QUALITY,
        "reconnect_delay": settings.RECONNECT_DELAY,
        "log_level": settings.LOG_LEVEL,
    }


# ---------------------------------------------------------------------------
# Page routes — serve HTML templates
# ---------------------------------------------------------------------------
templates = Jinja2Templates(directory="templates")


@app.get("/")
def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})


@app.get("/cameras")
def cameras_page(request: Request):
    return templates.TemplateResponse("cameras.html", {"request": request})


@app.get("/add-camera")
def add_camera_page(request: Request):
    return templates.TemplateResponse("add_camera.html", {"request": request})


@app.get("/edit-camera/{camera_id}")
def edit_camera_page(request: Request, camera_id: int):
    return templates.TemplateResponse("edit_camera.html", {"request": request})


@app.get("/roi/{camera_id}")
def roi_page(request: Request, camera_id: int):
    return templates.TemplateResponse("roi.html", {"request": request})


@app.get("/settings")
def settings_page(request: Request):
    return templates.TemplateResponse("settings.html", {"request": request})

@app.get("/sessions")
def sessions_page(request: Request):
    return templates.TemplateResponse("sessions.html", {"request": request})

@app.get("/session-logs")
def session_logs_page(request: Request):
    return templates.TemplateResponse("session_logs.html", {"request": request})


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        reload=settings.DEBUG,
    )
