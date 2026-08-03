"""
SQLite database layer.
All queries go through this module to keep DB access centralised.
"""
import sqlite3
import json
import logging
import threading
import queue
import time
from contextlib import contextmanager
from datetime import date
from config import settings

logger = logging.getLogger(__name__)

DB_PATH = settings.DATABASE

# ---------------------------------------------------------------------------
# Background Event Writer
# ---------------------------------------------------------------------------
_event_queue = queue.Queue()
_writer_stop = threading.Event()

def _db_writer_thread():
    while not _writer_stop.is_set():
        batch = []
        try:
            # Block for up to 2 seconds waiting for events
            event = _event_queue.get(timeout=2.0)
            batch.append(event)
            # Drain the rest of the queue quickly
            while not _event_queue.empty():
                try:
                    batch.append(_event_queue.get_nowait())
                except queue.Empty:
                    break
        except queue.Empty:
            pass
            
        if batch:
            try:
                log_events_batch(batch)
            except Exception as e:
                logger.error("Failed to write event batch: %s", e)

_writer_thread = threading.Thread(target=_db_writer_thread, daemon=True)
_writer_thread.start()


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")   # better concurrency on Pi
    conn.execute("PRAGMA synchronous=NORMAL")  # safe but faster
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Create tables if they don't exist."""
    with db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS cameras (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            location    TEXT    NOT NULL,
            rtsp_url    TEXT    NOT NULL,
            roi_type    TEXT,           -- line | rectangle | polygon | NULL
            roi_data    TEXT,           -- JSON blob
            active      INTEGER DEFAULT 1,
            created_at  TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS detection_logs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            camera_id       INTEGER NOT NULL REFERENCES cameras(id),
            timestamp       TEXT    DEFAULT (datetime('now')),
            person_track_id INTEGER,
            event_type      TEXT    NOT NULL,  -- IN | OUT | ROI
            roi_name        TEXT,
            created_at      TEXT    DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_logs_camera_ts
            ON detection_logs (camera_id, timestamp);

        CREATE INDEX IF NOT EXISTS idx_logs_event
            ON detection_logs (event_type, timestamp);
        """)
    logger.info("Database initialised at %s", DB_PATH)


# ---------------------------------------------------------------------------
# Camera helpers
# ---------------------------------------------------------------------------

def list_cameras():
    with db() as conn:
        rows = conn.execute("SELECT * FROM cameras ORDER BY id").fetchall()
    return [dict(r) for r in rows]


def get_camera(camera_id: int):
    with db() as conn:
        row = conn.execute("SELECT * FROM cameras WHERE id=?", (camera_id,)).fetchone()
    return dict(row) if row else None


def add_camera(name: str, location: str, rtsp_url: str) -> int:
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO cameras (name, location, rtsp_url) VALUES (?,?,?)",
            (name, location, rtsp_url),
        )
    return cur.lastrowid


def update_camera_roi(camera_id: int, roi_type: str, roi_data: dict):
    with db() as conn:
        conn.execute(
            "UPDATE cameras SET roi_type=?, roi_data=? WHERE id=?",
            (roi_type, json.dumps(roi_data), camera_id),
        )


def delete_camera(camera_id: int):
    with db() as conn:
        conn.execute("DELETE FROM cameras WHERE id=?", (camera_id,))


def set_camera_active(camera_id: int, active: bool):
    with db() as conn:
        conn.execute("UPDATE cameras SET active=? WHERE id=?", (int(active), camera_id))


# ---------------------------------------------------------------------------
# Detection log helpers
# ---------------------------------------------------------------------------

def log_event(camera_id: int, person_track_id: int, event_type: str, roi_name: str = None):
    _event_queue.put((camera_id, person_track_id, event_type, roi_name))

def log_events_batch(events: list):
    """Batch insert multiple events for performance."""
    if not events:
        return
    with db() as conn:
        conn.executemany(
            """INSERT INTO detection_logs
               (camera_id, person_track_id, event_type, roi_name)
               VALUES (?,?,?,?)""",
            events,
        )


# ---------------------------------------------------------------------------
# Analytics helpers
# ---------------------------------------------------------------------------

def _fetch_counts(camera_id: int, start: str, end: str):
    with db() as conn:
        row = conn.execute(
            """SELECT
                 SUM(CASE WHEN event_type='IN'  THEN 1 ELSE 0 END) AS total_in,
                 SUM(CASE WHEN event_type='OUT' THEN 1 ELSE 0 END) AS total_out
               FROM detection_logs
               WHERE camera_id=? AND timestamp BETWEEN ? AND ?""",
            (camera_id, start, end),
        ).fetchone()
    return {"total_in": row["total_in"] or 0, "total_out": row["total_out"] or 0}


def analytics_today(camera_id: int):
    today = date.today().isoformat()
    return _fetch_counts(
        camera_id,
        f"{today} 00:00:00",
        f"{today} 23:59:59",
    )


def analytics_hourly(camera_id: int, date: str):
    """Returns list of {hour, in_count, out_count}."""
    with db() as conn:
        rows = conn.execute(
            """SELECT
                 strftime('%H', timestamp) AS hour,
                 SUM(CASE WHEN event_type='IN'  THEN 1 ELSE 0 END) AS in_count,
                 SUM(CASE WHEN event_type='OUT' THEN 1 ELSE 0 END) AS out_count
               FROM detection_logs
               WHERE camera_id=? AND date(timestamp)=?
               GROUP BY hour ORDER BY hour""",
            (camera_id, date),
        ).fetchall()
    return [dict(r) for r in rows]


def analytics_daily(camera_id: int, year: int, month: int):
    with db() as conn:
        rows = conn.execute(
            """SELECT
                 date(timestamp) AS day,
                 SUM(CASE WHEN event_type='IN'  THEN 1 ELSE 0 END) AS in_count,
                 SUM(CASE WHEN event_type='OUT' THEN 1 ELSE 0 END) AS out_count
               FROM detection_logs
               WHERE camera_id=? AND strftime('%Y-%m', timestamp)=?
               GROUP BY day ORDER BY day""",
            (camera_id, f"{year:04d}-{month:02d}"),
        ).fetchall()
    return [dict(r) for r in rows]


def analytics_weekly(camera_id: int, year: int):
    with db() as conn:
        rows = conn.execute(
            """SELECT
                 strftime('%W', timestamp) AS week,
                 SUM(CASE WHEN event_type='IN'  THEN 1 ELSE 0 END) AS in_count,
                 SUM(CASE WHEN event_type='OUT' THEN 1 ELSE 0 END) AS out_count
               FROM detection_logs
               WHERE camera_id=? AND strftime('%Y', timestamp)=?
               GROUP BY week ORDER BY week""",
            (camera_id, str(year)),
        ).fetchall()
    return [dict(r) for r in rows]


def analytics_monthly(camera_id: int, year: int):
    with db() as conn:
        rows = conn.execute(
            """SELECT
                 strftime('%m', timestamp) AS month,
                 SUM(CASE WHEN event_type='IN'  THEN 1 ELSE 0 END) AS in_count,
                 SUM(CASE WHEN event_type='OUT' THEN 1 ELSE 0 END) AS out_count
               FROM detection_logs
               WHERE camera_id=? AND strftime('%Y', timestamp)=?
               GROUP BY month ORDER BY month""",
            (camera_id, str(year)),
        ).fetchall()
    return [dict(r) for r in rows]


def analytics_custom(camera_id: int, start: str, end: str):
    with db() as conn:
        rows = conn.execute(
            """SELECT
                 date(timestamp) AS day,
                 SUM(CASE WHEN event_type='IN'  THEN 1 ELSE 0 END) AS in_count,
                 SUM(CASE WHEN event_type='OUT' THEN 1 ELSE 0 END) AS out_count
               FROM detection_logs
               WHERE camera_id=? AND timestamp BETWEEN ? AND ?
               GROUP BY day ORDER BY day""",
            (camera_id, start, end),
        ).fetchall()
    return [dict(r) for r in rows]

def get_recent_logs(camera_id: int, limit: int = 20):
    with db() as conn:
        rows = conn.execute(
            """SELECT timestamp, person_track_id, event_type, roi_name
               FROM detection_logs
               WHERE camera_id=?
               ORDER BY timestamp DESC
               LIMIT ?""",
            (camera_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]
