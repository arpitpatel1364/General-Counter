"""
Analytics endpoints — pull data from SQLite for charts.
"""
from datetime import datetime
from fastapi import APIRouter, Query
from services.camera_manager import camera_manager
import database as db
from config import settings

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/summary")
def summary():
    """Global real-time summary across all running cameras."""
    stats = camera_manager.global_stats()
    stats["show_live_preview"] = settings.SHOW_LIVE_PREVIEW
    return stats


@router.get("/{camera_id}/hourly")
def hourly(camera_id: int, date: str = Query(default=None)):
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")
    return db.analytics_hourly(camera_id, date)


@router.get("/{camera_id}/daily")
def daily(
    camera_id: int,
    year: int = Query(default=None),
    month: int = Query(default=None),
):
    now = datetime.now()
    return db.analytics_daily(camera_id, year or now.year, month or now.month)


@router.get("/{camera_id}/weekly")
def weekly(camera_id: int, year: int = Query(default=None)):
    return db.analytics_weekly(camera_id, year or datetime.now().year)


@router.get("/{camera_id}/monthly")
def monthly(camera_id: int, year: int = Query(default=None)):
    return db.analytics_monthly(camera_id, year or datetime.now().year)


@router.get("/{camera_id}/custom")
def custom(
    camera_id: int,
    start: str = Query(...),
    end: str = Query(...),
):
    return db.analytics_custom(camera_id, start, end)

@router.get("/{camera_id}/logs")
def logs(camera_id: int, limit: int = Query(default=20, le=100)):
    return db.get_recent_logs(camera_id, limit=limit)

@router.get("/session/{session_id}")
def session_analytics(session_id: int):
    return db.analytics_for_session(session_id)
