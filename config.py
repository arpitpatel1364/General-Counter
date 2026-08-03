"""
Configuration loader — reads .env and exposes typed settings.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    APP_HOST: str = os.getenv("APP_HOST", "0.0.0.0")
    APP_PORT: int = int(os.getenv("APP_PORT", 8000))
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key")

    MAX_CAMERAS: int = int(os.getenv("MAX_CAMERAS", 1))
    SHOW_LIVE_PREVIEW: bool = os.getenv("SHOW_LIVE_PREVIEW", "true").lower() == "true"

    MODEL: str = os.getenv("MODEL", "yolo11n.pt")
    IMGSZ: int = int(os.getenv("IMGSZ", 320))
    CONFIDENCE: float = float(os.getenv("CONFIDENCE", 0.35))
    IOU: float = float(os.getenv("IOU", 0.5))
    TRACKER: str = os.getenv("TRACKER", "bytetrack.yaml")

    DATABASE: str = os.getenv("DATABASE", "people_counter.db")

    FRAME_RATE: int = int(os.getenv("FRAME_RATE", 10))
    JPEG_QUALITY: int = int(os.getenv("JPEG_QUALITY", 70))
    RECONNECT_DELAY: int = int(os.getenv("RECONNECT_DELAY", 5))

    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE: str = os.getenv("LOG_FILE", "logs/app.log")


settings = Settings()
