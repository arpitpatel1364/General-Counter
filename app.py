"""
People Counter — FastAPI application entry point.

Run with:
    uvicorn app:app --host 0.0.0.0 --port 8000
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

import database as db
from routes.cameras import router as cameras_router
from routes.stream import router as stream_router
from routes.analytics import router as analytics_router
from config import settings

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
    logger.info("People Counter starting — MAX_CAMERAS=%d", settings.MAX_CAMERAS)
    
    # Resume active cameras
    from services.camera_manager import camera_manager
    for cam in db.list_cameras():
        if cam.get("active") == 1:
            camera_manager.start_camera(cam["id"])
            
    yield
    # Shutdown
    from services.camera_manager import camera_manager
    camera_manager.stop_all()
    logger.info("People Counter stopped")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="People Counter",
    version="1.0.0",
    lifespan=lifespan,
)

# Static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# API routers
app.include_router(cameras_router)
app.include_router(stream_router)
app.include_router(analytics_router)


# ---------------------------------------------------------------------------
# Page routes — serve HTML templates
# ---------------------------------------------------------------------------
TEMPLATES = "templates"


def _html(name: str):
    return FileResponse(os.path.join(TEMPLATES, name))


@app.get("/")
def dashboard():
    return _html("dashboard.html")


@app.get("/cameras")
def cameras_page():
    return _html("cameras.html")


@app.get("/add-camera")
def add_camera_page():
    return _html("add_camera.html")


@app.get("/roi/{camera_id}")
def roi_page(camera_id: int):
    return _html("roi.html")


@app.get("/settings")
def settings_page():
    return _html("settings.html")


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        reload=settings.DEBUG,
    )
