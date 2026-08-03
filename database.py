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
            target_class INTEGER DEFAULT 0,
            active      INTEGER DEFAULT 1,
            created_at  TEXT    DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            camera_id INTEGER REFERENCES cameras(id),
            name TEXT NOT NULL,
            target_class INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            closed_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS detection_logs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            camera_id       INTEGER NOT NULL REFERENCES cameras(id),
            session_id      INTEGER REFERENCES sessions(id),
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
        
        # Safe schema upgrades for existing DBs
        try:
            conn.execute("ALTER TABLE cameras ADD COLUMN target_class INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass # Column exists
            
        try:
            conn.execute("ALTER TABLE detection_logs ADD COLUMN session_id INTEGER REFERENCES sessions(id)")
        except sqlite3.OperationalError:
            pass # Column exists
            
        try:
            conn.execute("ALTER TABLE sessions ADD COLUMN target_class INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass # Column exists
            
        # Create index after column is guaranteed to exist
        conn.execute("CREATE INDEX IF NOT EXISTS idx_logs_session ON detection_logs (session_id)")
        
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


def update_camera_target_class(camera_id: int, target_class: int):
    with db() as conn:
        conn.execute(
            "UPDATE cameras SET target_class=? WHERE id=?",
            (target_class, camera_id),
        )


def delete_camera(camera_id: int):
    with db() as conn:
        conn.execute("DELETE FROM detection_logs WHERE camera_id=?", (camera_id,))
        conn.execute("DELETE FROM sessions WHERE camera_id=?", (camera_id,))
        conn.execute("DELETE FROM cameras WHERE id=?", (camera_id,))


def set_camera_active(camera_id: int, active: bool):
    with db() as conn:
        conn.execute("UPDATE cameras SET active=? WHERE id=?", (int(active), camera_id))


# ---------------------------------------------------------------------------
# Detection log helpers
# ---------------------------------------------------------------------------

def log_event(camera_id: int, session_id: int, person_track_id: int, event_type: str, roi_name: str = None):
    _event_queue.put((camera_id, session_id, person_track_id, event_type, roi_name))

def log_events_batch(events: list):
    """Batch insert multiple events for performance."""
    if not events:
        return
    with db() as conn:
        conn.executemany(
            """INSERT INTO detection_logs
               (camera_id, session_id, person_track_id, event_type, roi_name)
               VALUES (?,?,?,?,?)""",
            events,
        )


# ---------------------------------------------------------------------------
# Sessions helpers
# ---------------------------------------------------------------------------

def create_session(camera_id: int, name: str, target_class: int = 0) -> int:
    with db() as conn:
        # Close any active session for this camera
        conn.execute("UPDATE sessions SET status='closed', closed_at=datetime('now') WHERE camera_id=? AND status='active'", (camera_id,))
        cur = conn.execute(
            "INSERT INTO sessions (camera_id, name, target_class, status) VALUES (?,?,?,?)",
            (camera_id, name, target_class, 'active')
        )
    return cur.lastrowid

def resume_session(session_id: int):
    with db() as conn:
        # Get the camera_id and target_class for this session
        row = conn.execute("SELECT camera_id, target_class FROM sessions WHERE id=?", (session_id,)).fetchone()
        if not row:
            return
        
        camera_id = row['camera_id']
        target_class = row['target_class']
        
        # Close any active session for this camera
        conn.execute("UPDATE sessions SET status='closed', closed_at=datetime('now') WHERE camera_id=? AND status='active'", (camera_id,))
        
        # Resume this session
        conn.execute("UPDATE sessions SET status='active', closed_at=NULL WHERE id=?", (session_id,))
        
        # Update the camera's target class to match
        conn.execute("UPDATE cameras SET target_class=? WHERE id=?", (target_class, camera_id))
        
    return camera_id, target_class

def close_active_session(camera_id: int):
    with db() as conn:
        conn.execute("UPDATE sessions SET status='closed', closed_at=datetime('now') WHERE camera_id=? AND status='active'", (camera_id,))

def get_active_session(camera_id: int):
    with db() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE camera_id=? AND status='active'", (camera_id,)).fetchone()
    return dict(row) if row else None

def list_sessions(camera_id: int = None):
    with db() as conn:
        if camera_id is not None:
            rows = conn.execute("SELECT * FROM sessions WHERE camera_id=? ORDER BY created_at DESC", (camera_id,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM sessions ORDER BY created_at DESC").fetchall()
            
    sessions = [dict(r) for r in rows]
    # Augment with counts
    with db() as conn:
        for s in sessions:
            counts = conn.execute(
                """SELECT
                     SUM(CASE WHEN event_type='IN' THEN 1 ELSE 0 END) AS total_in,
                     SUM(CASE WHEN event_type='OUT' THEN 1 ELSE 0 END) AS total_out
                   FROM detection_logs WHERE session_id=?""", (s['id'],)
            ).fetchone()
            s['total_in'] = counts['total_in'] or 0
            s['total_out'] = counts['total_out'] or 0
            
    return sessions

def rename_session(session_id: int, new_name: str):
    with db() as conn:
        conn.execute("UPDATE sessions SET name=? WHERE id=?", (new_name, session_id))

def analytics_for_session(session_id: int):
    """Returns list of {time_slice, in_count, out_count} for a specific session."""
    with db() as conn:
        rows = conn.execute(
            """SELECT
                 strftime('%Y-%m-%d %H:%M', timestamp) AS time_slice,
                 SUM(CASE WHEN event_type='IN'  THEN 1 ELSE 0 END) AS in_count,
                 SUM(CASE WHEN event_type='OUT' THEN 1 ELSE 0 END) AS out_count
               FROM detection_logs
               WHERE session_id=?
               GROUP BY time_slice ORDER BY time_slice""",
            (session_id,)
        ).fetchall()
    return [dict(r) for r in rows]

# ---------------------------------------------------------------------------
# Legacy Analytics helpers
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

def analytics_averages(camera_id: int):
    """Returns the total IN+OUT events over the last 3, 7, and 30 days."""
    with db() as conn:
        res = conn.execute(
            """SELECT
                 SUM(CASE WHEN timestamp >= datetime('now', '-3 days') THEN 1 ELSE 0 END) as sum_3,
                 SUM(CASE WHEN timestamp >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as sum_7,
                 SUM(CASE WHEN timestamp >= datetime('now', '-30 days') THEN 1 ELSE 0 END) as sum_30
               FROM detection_logs
               WHERE camera_id=? AND event_type IN ('IN', 'OUT')""",
            (camera_id,)
        ).fetchone()
        
    return {
        "last_3_days": res["sum_3"] or 0,
        "last_7_days": res["sum_7"] or 0,
        "last_30_days": res["sum_30"] or 0
    }
