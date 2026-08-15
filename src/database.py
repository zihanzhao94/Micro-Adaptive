"""
database.py — SQLite persistence layer.

Keeps the same public interface as mock_db.py so bot.py and api.py can share
student state across separate processes.
"""

import json
import os
import hashlib
import secrets
import sqlite3
import uuid
from datetime import date, datetime, time, timedelta
from pathlib import Path


DB_PATH = Path(os.getenv(
    "MICRO_ADAPTIVE_DB",
    Path(__file__).resolve().parent.parent / "micro_adaptive.db",
))

DEFAULT_COURSE_ID = "default"
LEGACY_DEFAULT_MASTERY = {
    "Linear Regression",
    "Gradient Descent",
    "Backpropagation",
    "Loss Functions",
    "Overfitting",
    "Neural Networks",
    "Regularization",
    "Evaluation Metrics",
}


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    # The bot and the API are separate processes on one file: WAL lets the
    # dashboard read while the bot writes, and busy_timeout makes a concurrent
    # write wait its turn instead of raising "database is locked".
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {
        row["name"]
        for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }


def _add_column_if_missing(
    conn: sqlite3.Connection,
    table: str,
    column: str,
    definition: str,
) -> None:
    if column not in _columns(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS courses (
                course_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                semester TEXT NOT NULL DEFAULT '',
                class_size INTEGER,
                objectives_json TEXT NOT NULL DEFAULT '[]',
                educator_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS educators (
                educator_id TEXT PRIMARY KEY,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                institution TEXT NOT NULL DEFAULT '',
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS course_materials (
                course_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'indexed',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (course_id, filename),
                FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS course_concepts (
                course_id TEXT NOT NULL,
                concept_id TEXT NOT NULL,
                name TEXT NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (course_id, name),
                FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS students (
                user_id INTEGER PRIMARY KEY,
                name TEXT,
                interests_json TEXT NOT NULL DEFAULT '[]',
                style TEXT,
                registered INTEGER NOT NULL DEFAULT 0,
                joined_at TEXT,
                quiz_count INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS mastery (
                user_id INTEGER NOT NULL,
                concept TEXT NOT NULL,
                score INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, concept),
                FOREIGN KEY (user_id) REFERENCES students(user_id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS quiz_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                q_id TEXT,
                concept TEXT,
                selected TEXT,
                correct INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                raw_json TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES students(user_id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS conversation_memories (
                user_id INTEGER NOT NULL,
                memory_key TEXT NOT NULL,
                category TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, memory_key),
                FOREIGN KEY (user_id) REFERENCES students(user_id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS conversation_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                telegram_message_id INTEGER,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES students(user_id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_conversation_messages_user_created
            ON conversation_messages (user_id, created_at)
        """)

        _add_column_if_missing(conn, "students", "course_id", f"TEXT NOT NULL DEFAULT '{DEFAULT_COURSE_ID}'")
        _add_column_if_missing(conn, "mastery", "course_id", f"TEXT NOT NULL DEFAULT '{DEFAULT_COURSE_ID}'")
        _add_column_if_missing(conn, "quiz_results", "course_id", f"TEXT NOT NULL DEFAULT '{DEFAULT_COURSE_ID}'")
        _add_column_if_missing(conn, "course_concepts", "concept_id", "TEXT")
        _add_column_if_missing(conn, "mastery", "concept_id", "TEXT")
        _add_column_if_missing(conn, "quiz_results", "concept_id", "TEXT")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS reflections (
                user_id INTEGER NOT NULL,
                course_id TEXT NOT NULL,
                week_no INTEGER NOT NULL,
                concepts_json TEXT NOT NULL DEFAULT '[]',
                confusion TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, course_id, week_no),
                FOREIGN KEY (user_id) REFERENCES students(user_id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_reflections_course_week
            ON reflections (course_id, week_no)
        """)

        _add_column_if_missing(conn, "courses", "educator_id", "TEXT")
        _add_column_if_missing(conn, "courses", "start_date", "TEXT")
        _add_column_if_missing(conn, "courses", "total_weeks", "INTEGER")
        _add_column_if_missing(conn, "courses", "push_weekday", "INTEGER")
        _add_column_if_missing(conn, "courses", "push_time", "TEXT")
        _add_column_if_missing(conn, "courses", "push_enabled", "INTEGER NOT NULL DEFAULT 0")
        _add_column_if_missing(conn, "course_materials", "week_no", "INTEGER")
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_course_concepts_course_concept_id
            ON course_concepts (course_id, concept_id)
        """)

        now = datetime.now().isoformat()
        conn.execute("""
            INSERT OR IGNORE INTO courses (
                course_id, name, code, description, semester, class_size,
                objectives_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            DEFAULT_COURSE_ID,
            "Course Workspace",
            "Course",
            "",
            "Current",
            None,
            "[]",
            now,
            now,
        ))
        conn.execute("""
            INSERT OR IGNORE INTO app_state (key, value)
            VALUES ('active_course_id', ?)
        """, (DEFAULT_COURSE_ID,))
        for row in conn.execute("""
            SELECT course_id, name FROM course_concepts
            WHERE concept_id IS NULL OR concept_id = ''
        """).fetchall():
            conn.execute("""
                UPDATE course_concepts
                SET concept_id = ?
                WHERE course_id = ? AND name = ?
            """, (str(uuid.uuid4()), row["course_id"], row["name"]))
        conn.execute("""
            UPDATE mastery
            SET concept_id = (
                SELECT concept_id FROM course_concepts
                WHERE course_concepts.course_id = mastery.course_id
                  AND lower(course_concepts.name) = lower(mastery.concept)
            )
            WHERE concept_id IS NULL OR concept_id = ''
        """)
        conn.execute("""
            UPDATE quiz_results
            SET concept_id = (
                SELECT concept_id FROM course_concepts
                WHERE course_concepts.course_id = quiz_results.course_id
                  AND lower(course_concepts.name) = lower(quiz_results.concept)
            )
            WHERE concept_id IS NULL OR concept_id = ''
        """)
        conn.execute("""
            DELETE FROM mastery
            WHERE score = 0
              AND concept IN ({})
              AND NOT EXISTS (
                  SELECT 1
                  FROM quiz_results
                  WHERE quiz_results.user_id = mastery.user_id
                    AND quiz_results.concept = mastery.concept
              )
        """.format(",".join("?" for _ in LEGACY_DEFAULT_MASTERY)), tuple(LEGACY_DEFAULT_MASTERY))


def get_active_course_id() -> str:
    init_db()
    with _connect() as conn:
        row = conn.execute("""
            SELECT value FROM app_state WHERE key = 'active_course_id'
        """).fetchone()
    return row["value"] if row else DEFAULT_COURSE_ID


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"{salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
    except (ValueError, TypeError):
        return False
    return secrets.compare_digest(actual, expected)


def _educator_payload(row: sqlite3.Row) -> dict:
    return {
        "id": row["educator_id"],
        "name": row["full_name"],
        "email": row["email"],
        "institution": row["institution"],
    }


def get_active_educator() -> dict | None:
    init_db()
    with _connect() as conn:
        active_row = conn.execute("""
            SELECT value FROM app_state WHERE key = 'active_educator_id'
        """).fetchone()
        if active_row is None:
            return None
        row = conn.execute("""
            SELECT * FROM educators WHERE educator_id = ?
        """, (active_row["value"],)).fetchone()
    return _educator_payload(row) if row else None


def register_educator(full_name: str, email: str, institution: str, password: str) -> dict:
    init_db()
    normalized_email = email.strip().lower()
    if not full_name.strip() or not normalized_email or not password:
        raise ValueError("Name, email, and password are required.")
    if len(password) < 8:
        raise ValueError("Password must contain at least 8 characters.")

    now = datetime.now().isoformat()
    educator_id = str(uuid.uuid4())
    try:
        with _connect() as conn:
            conn.execute("""
                INSERT INTO educators (
                    educator_id, full_name, email, institution, password_hash, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                educator_id, full_name.strip(), normalized_email, institution.strip(),
                _hash_password(password), now, now,
            ))
            conn.execute("""
                INSERT INTO app_state (key, value)
                VALUES ('active_educator_id', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """, (educator_id,))
    except sqlite3.IntegrityError as exc:
        raise ValueError("An educator account with this email already exists.") from exc
    return get_active_educator() or {}


def authenticate_educator(email: str, password: str) -> dict | None:
    init_db()
    with _connect() as conn:
        row = conn.execute("""
            SELECT * FROM educators WHERE email = ?
        """, (email.strip().lower(),)).fetchone()
        if row is None or not _verify_password(password, row["password_hash"]):
            return None
        conn.execute("""
            INSERT INTO app_state (key, value)
            VALUES ('active_educator_id', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """, (row["educator_id"],))
    return _educator_payload(row)


def _course_id_from_name(name: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in name.strip())
    cleaned = "-".join(part for part in cleaned.split("-") if part)
    return cleaned[:48] or DEFAULT_COURSE_ID


def _clean_or_keep(data: dict, key: str, fallback):
    if key not in data:
        return fallback
    value = (data.get(key) or "").strip()
    return value or None


def _int_or_keep(data: dict, key: str, fallback):
    if key not in data:
        return fallback
    value = data.get(key)
    if value is None or str(value).strip() == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def save_course(data: dict) -> dict:
    init_db()
    now = datetime.now().isoformat()
    name = (data.get("name") or "").strip() or "Course Workspace"
    code = (data.get("code") or "").strip() or name.split()[0]
    course_id = data.get("course_id") or _course_id_from_name(code or name)
    description = (data.get("description") or "").strip()
    semester = (data.get("semester") or "").strip() or "Current"
    class_size = data.get("class_size")
    objectives = [item.strip() for item in data.get("objectives", []) if item.strip()]
    active_educator = get_active_educator()
    educator_id = data.get("educator_id") or (active_educator or {}).get("id")

    existing = get_course(course_id) if course_exists(course_id) else {}
    # Schedule fields are optional on every save — a caller that omits them
    # (e.g. the setup wizard) must not wipe what the educator already configured.
    start_date = _clean_or_keep(data, "start_date", existing.get("startDate"))
    total_weeks = _int_or_keep(data, "total_weeks", existing.get("totalWeeks"))
    push_weekday = _int_or_keep(data, "push_weekday", existing.get("pushWeekday"))
    push_time = _clean_or_keep(data, "push_time", existing.get("pushTime"))
    push_enabled = data.get("push_enabled")
    if push_enabled is None:
        push_enabled = existing.get("pushEnabled", False)

    with _connect() as conn:
        conn.execute("""
            INSERT INTO courses (
                course_id, name, code, description, semester, class_size,
                objectives_json, educator_id, start_date, total_weeks,
                push_weekday, push_time, push_enabled, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(course_id) DO UPDATE SET
                name = excluded.name,
                code = excluded.code,
                description = excluded.description,
                semester = excluded.semester,
                class_size = excluded.class_size,
                objectives_json = excluded.objectives_json,
                educator_id = excluded.educator_id,
                start_date = excluded.start_date,
                total_weeks = excluded.total_weeks,
                push_weekday = excluded.push_weekday,
                push_time = excluded.push_time,
                push_enabled = excluded.push_enabled,
                updated_at = excluded.updated_at
        """, (
            course_id,
            name,
            code,
            description,
            semester,
            int(class_size) if str(class_size or "").strip().isdigit() else None,
            json.dumps(objectives),
            educator_id,
            start_date,
            total_weeks,
            push_weekday,
            push_time,
            1 if push_enabled else 0,
            now,
            now,
        ))
        conn.execute("""
            INSERT INTO app_state (key, value)
            VALUES ('active_course_id', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """, (course_id,))

    return get_course(course_id)


def get_course(course_id: str | None = None) -> dict:
    init_db()
    course_id = course_id or get_active_course_id()
    with _connect() as conn:
        row = conn.execute("""
            SELECT courses.*, educators.full_name AS educator_name, educators.email AS educator_email
            FROM courses
            LEFT JOIN educators ON educators.educator_id = courses.educator_id
            WHERE courses.course_id = ?
        """, (course_id,)).fetchone()

    if row is None:
        return get_course(DEFAULT_COURSE_ID)

    try:
        objectives = json.loads(row["objectives_json"] or "[]")
    except json.JSONDecodeError:
        objectives = []

    return {
        "id": row["course_id"],
        "course_id": row["course_id"],
        "name": row["name"],
        "code": row["code"],
        "year": row["semester"],
        "description": row["description"],
        "classSize": row["class_size"],
        "objectives": objectives,
        "educatorName": row["educator_name"] or (get_active_educator() or {}).get("name", "Educator"),
        "educatorEmail": row["educator_email"] or (get_active_educator() or {}).get("email", ""),
        "startDate": row["start_date"],
        "totalWeeks": row["total_weeks"],
        "pushWeekday": row["push_weekday"],
        "pushTime": row["push_time"],
        "pushEnabled": bool(row["push_enabled"]),
    }


def course_exists(course_id: str) -> bool:
    init_db()
    with _connect() as conn:
        row = conn.execute("SELECT 1 FROM courses WHERE course_id = ?", (course_id,)).fetchone()
    return row is not None


DEFAULT_PUSH_TIME = "13:00"


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _parse_time(value: str | None) -> time:
    try:
        hour, minute = str(value or DEFAULT_PUSH_TIME).split(":")[:2]
        return time(int(hour), int(minute))
    except (TypeError, ValueError):
        return time(13, 0)


def current_week_no(course_id: str | None = None, today: date | None = None) -> int | None:
    """Which teaching week we are in, or None if the course isn't running.

    None covers three cases the caller must not push in: no start date set,
    the course hasn't started yet, and the semester is already over.
    """
    course = get_course(course_id)
    start = _parse_date(course.get("startDate"))
    if start is None:
        return None

    days = ((today or date.today()) - start).days
    if days < 0:
        return None

    week = days // 7 + 1
    total_weeks = course.get("totalWeeks")
    if total_weeks and week > int(total_weeks):
        return None
    return week


def week_push_datetime(course_id: str | None = None, week_no: int | None = None) -> datetime | None:
    """The moment week `week_no`'s push is scheduled for."""
    course = get_course(course_id)
    start = _parse_date(course.get("startDate"))
    if start is None or not week_no:
        return None

    week_start = start + timedelta(days=(week_no - 1) * 7)
    weekday = course.get("pushWeekday")
    weekday = week_start.weekday() if weekday is None else int(weekday) % 7
    push_day = week_start + timedelta(days=(weekday - week_start.weekday()) % 7)
    return datetime.combine(push_day, _parse_time(course.get("pushTime")))


def get_last_pushed_slot(course_id: str | None = None) -> str | None:
    init_db()
    course_id = course_id or get_active_course_id()
    with _connect() as conn:
        row = conn.execute(
            "SELECT value FROM app_state WHERE key = ?",
            (f"last_pushed_slot:{course_id}",),
        ).fetchone()
    return row["value"] if row else None


def set_last_pushed_slot(course_id: str, scheduled: datetime, week_no: int) -> None:
    """Record the slot just sent, plus its week.

    The week is stored rather than recomputed later: a digest that fires after
    the final teaching week would otherwise fail to resolve one.
    """
    init_db()
    with _connect() as conn:
        conn.executemany("""
            INSERT INTO app_state (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """, [
            (f"last_pushed_slot:{course_id}", scheduled.isoformat()),
            (f"last_pushed_week:{course_id}", str(week_no)),
        ])
        _clear_send_now(conn, course_id, "push")


def request_send_now(course_id: str, kind: str) -> None:
    """Arm a manual send ('push' or 'digest'), picked up on the bot's next tick.

    A flag rather than a direct send: the bot is a separate process, so the API
    can only leave something for it to find.
    """
    init_db()
    with _connect() as conn:
        conn.execute("""
            INSERT INTO app_state (key, value) VALUES (?, '1')
            ON CONFLICT(key) DO UPDATE SET value = '1'
        """, (f"send_now_{kind}:{course_id}",))


def _clear_send_now(conn: sqlite3.Connection, course_id: str, kind: str) -> None:
    conn.execute("DELETE FROM app_state WHERE key = ?", (f"send_now_{kind}:{course_id}",))


def due_push(course_id: str | None = None, now: datetime | None = None) -> tuple[int, datetime] | None:
    """The (week, scheduled time) to push right now, or None if nothing is due.

    Idempotency is keyed on the scheduled moment rather than the week number, so
    the bot's ~30s loop never re-sends the same slot, but moving the push time
    within a week arms a new one.
    """
    course_id = course_id or get_active_course_id()
    course = get_course(course_id)
    if not course.get("pushEnabled"):
        return None

    now = now or datetime.now()

    # A manual "send now" bypasses the schedule but still goes through the same
    # claim, so it can't double-send either.
    if _get_state(f"send_now_push:{course_id}") == "1":
        return current_week_no(course_id, today=now.date()) or 1, now.replace(microsecond=0)

    week = current_week_no(course_id, today=now.date())
    if week is None:
        return None

    scheduled = week_push_datetime(course_id, week)
    if scheduled is None or now < scheduled:
        return None
    if get_last_pushed_slot(course_id) == scheduled.isoformat():
        return None
    return week, scheduled


# ── Weekly reflections ────────────────────────────────────────────────────────

def get_reflection(user_id: int, course_id: str, week_no: int) -> dict | None:
    init_db()
    with _connect() as conn:
        row = conn.execute("""
            SELECT * FROM reflections
            WHERE user_id = ? AND course_id = ? AND week_no = ?
        """, (user_id, course_id, week_no)).fetchone()
    if row is None:
        return None
    return {
        "user_id": row["user_id"],
        "week_no": row["week_no"],
        "concepts": json.loads(row["concepts_json"] or "[]"),
        "confusion": row["confusion"],
        "updated_at": row["updated_at"],
    }


def toggle_reflection_concept(user_id: int, course_id: str, week_no: int, concept: str) -> list[str]:
    """Add or remove one concept from a student's weekly pick. Returns the new list.

    Selections live in the database rather than in memory so a bot restart in the
    middle of a reflection doesn't lose what the student already tapped.
    """
    init_db()
    now = datetime.now().isoformat()
    existing = get_reflection(user_id, course_id, week_no)
    concepts = list(existing["concepts"]) if existing else []

    if concept in concepts:
        concepts.remove(concept)
    else:
        concepts.append(concept)

    with _connect() as conn:
        conn.execute("""
            INSERT INTO reflections (user_id, course_id, week_no, concepts_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, course_id, week_no) DO UPDATE SET
                concepts_json = excluded.concepts_json,
                updated_at = excluded.updated_at
        """, (user_id, course_id, week_no, json.dumps(concepts), now, now))
    return concepts


def set_reflection_confusion(user_id: int, course_id: str, week_no: int, confusion: str | None) -> None:
    init_db()
    now = datetime.now().isoformat()
    with _connect() as conn:
        conn.execute("""
            INSERT INTO reflections (user_id, course_id, week_no, confusion, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, course_id, week_no) DO UPDATE SET
                confusion = excluded.confusion,
                updated_at = excluded.updated_at
        """, (user_id, course_id, week_no, confusion, now, now))


def list_reflections(course_id: str | None = None, week_no: int | None = None) -> list[dict]:
    """Every student's reflection, newest first — the educator-facing view."""
    init_db()
    course_id = course_id or get_active_course_id()
    query = """
        SELECT r.*, students.name AS student_name
        FROM reflections r
        LEFT JOIN students ON students.user_id = r.user_id
        WHERE r.course_id = ?
    """
    params: list = [course_id]
    if week_no is not None:
        query += " AND r.week_no = ?"
        params.append(week_no)
    query += " ORDER BY r.week_no DESC, r.updated_at DESC"

    with _connect() as conn:
        rows = conn.execute(query, params).fetchall()

    return [{
        "user_id": row["user_id"],
        "studentName": row["student_name"] or f"Student {row['user_id']}",
        "week": row["week_no"],
        "concepts": json.loads(row["concepts_json"] or "[]"),
        "confusion": row["confusion"],
        "updatedAt": row["updated_at"],
    } for row in rows]


def get_week_concepts(course_id: str, week_no: int) -> list[str] | None:
    """Cached concept list for one teaching week (None when not computed yet)."""
    init_db()
    with _connect() as conn:
        row = conn.execute(
            "SELECT value FROM app_state WHERE key = ?",
            (f"week_concepts:{course_id}:{week_no}",),
        ).fetchone()
    if row is None:
        return None
    try:
        return json.loads(row["value"])
    except json.JSONDecodeError:
        return None


def set_week_concepts(course_id: str, week_no: int, concepts: list[str]) -> None:
    init_db()
    with _connect() as conn:
        conn.execute("""
            INSERT INTO app_state (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """, (f"week_concepts:{course_id}:{week_no}", json.dumps(concepts)))


DIGEST_DELAY_HOURS = 24


def get_week_note(course_id: str, week_no: int) -> str:
    """The educator's optional one-liner appended to the class digest."""
    init_db()
    with _connect() as conn:
        row = conn.execute(
            "SELECT value FROM app_state WHERE key = ?",
            (f"week_note:{course_id}:{week_no}",),
        ).fetchone()
    return row["value"] if row else ""


def set_week_note(course_id: str, week_no: int, note: str) -> None:
    init_db()
    with _connect() as conn:
        conn.execute("""
            INSERT INTO app_state (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """, (f"week_note:{course_id}:{week_no}", note.strip()))


def _get_state(key: str) -> str | None:
    init_db()
    with _connect() as conn:
        row = conn.execute("SELECT value FROM app_state WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_last_digest_slot(course_id: str, scheduled: datetime) -> None:
    init_db()
    with _connect() as conn:
        conn.execute("""
            INSERT INTO app_state (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """, (f"last_digest_slot:{course_id}", scheduled.isoformat()))
        _clear_send_now(conn, course_id, "digest")


def get_last_pushed_week(course_id: str | None = None) -> int | None:
    course_id = course_id or get_active_course_id()
    try:
        return int(_get_state(f"last_pushed_week:{course_id}"))
    except (TypeError, ValueError):
        return None


def clear_last_digest_slot(course_id: str) -> None:
    """Release a claimed digest slot so it can be retried.

    Used when there was nothing to summarise: the slot is claimed before sending
    to stop double-sends, and without this an empty week would burn it forever.
    """
    init_db()
    with _connect() as conn:
        conn.execute("DELETE FROM app_state WHERE key = ?", (f"last_digest_slot:{course_id}",))


def due_digest(course_id: str | None = None, now: datetime | None = None) -> tuple[int, datetime] | None:
    """The (week, original push slot) whose class digest is now due.

    Fires a fixed delay after the weekly push rather than waiting for everyone to
    answer — response rates never reach 100%, so a "wait for all" trigger would
    never fire at all.
    """
    course_id = course_id or get_active_course_id()
    if not get_course(course_id).get("pushEnabled"):
        return None

    pushed = get_last_pushed_slot(course_id)
    if not pushed:
        return None

    # Checked before the already-sent guard so the dashboard's "send digest now"
    # can re-send one for a push whose digest already went out.
    forced = _get_state(f"send_now_digest:{course_id}") == "1"
    if not forced and _get_state(f"last_digest_slot:{course_id}") == pushed:
        return None

    try:
        slot = datetime.fromisoformat(pushed)
    except ValueError:
        return None

    now = now or datetime.now()
    if not forced and now < slot + timedelta(hours=DIGEST_DELAY_HOURS):
        return None

    stored_week = _get_state(f"last_pushed_week:{course_id}")
    try:
        return int(stored_week), slot
    except (TypeError, ValueError):
        return None


def record_material(
    course_id: str,
    filename: str,
    file_type: str,
    size_bytes: int,
    status: str = "indexed",
    week_no: int | None = None,
) -> None:
    init_db()
    now = datetime.now().isoformat()
    with _connect() as conn:
        conn.execute("""
            INSERT INTO course_materials (
                course_id, filename, type, size_bytes, status, week_no, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(course_id, filename) DO UPDATE SET
                type = excluded.type,
                size_bytes = excluded.size_bytes,
                status = excluded.status,
                week_no = COALESCE(excluded.week_no, course_materials.week_no),
                updated_at = excluded.updated_at
        """, (course_id, filename, file_type, size_bytes, status, week_no, now, now))


def set_material_week(course_id: str, filename: str, week_no: int | None) -> None:
    init_db()
    with _connect() as conn:
        conn.execute("""
            UPDATE course_materials
            SET week_no = ?, updated_at = ?
            WHERE course_id = ? AND filename = ?
        """, (week_no, datetime.now().isoformat(), course_id, filename))


def list_materials(course_id: str | None = None, week_no: int | None = None) -> list[dict]:
    init_db()
    course_id = course_id or get_active_course_id()
    query = """
        SELECT filename, type, size_bytes, status, week_no, created_at, updated_at
        FROM course_materials
        WHERE course_id = ?
    """
    params: list = [course_id]
    if week_no is not None:
        query += " AND week_no = ?"
        params.append(week_no)
    query += " ORDER BY updated_at DESC, filename"

    with _connect() as conn:
        rows = conn.execute(query, params).fetchall()

    return [dict(row) for row in rows]


def get_material(course_id: str, filename: str) -> dict | None:
    init_db()
    with _connect() as conn:
        row = conn.execute("""
            SELECT filename, type, size_bytes, status, week_no, created_at, updated_at
            FROM course_materials
            WHERE course_id = ? AND filename = ?
        """, (course_id, filename)).fetchone()
    return dict(row) if row else None


def delete_material(course_id: str, filename: str) -> None:
    init_db()
    with _connect() as conn:
        conn.execute("""
            DELETE FROM course_materials
            WHERE course_id = ? AND filename = ?
        """, (course_id, filename))


def get_course_concept_records(course_id: str | None = None) -> list[dict]:
    """Return educator-confirmed concepts with stable IDs in display order."""
    init_db()
    course_id = course_id or get_active_course_id()
    with _connect() as conn:
        rows = conn.execute("""
            SELECT concept_id, name
            FROM course_concepts
            WHERE course_id = ?
            ORDER BY display_order, name COLLATE NOCASE
        """, (course_id,)).fetchall()
    return [{"id": row["concept_id"], "name": row["name"]} for row in rows]


def get_course_concepts(course_id: str | None = None) -> list[str]:
    """Return confirmed concept names for display and prompt construction."""
    return [concept["name"] for concept in get_course_concept_records(course_id)]


def replace_course_concepts(course_id: str, concepts: list[dict]) -> list[dict]:
    """Save course concepts while retaining IDs supplied by the editor."""
    init_db()
    existing_ids = {
        item["id"] for item in get_course_concept_records(course_id)
    }
    normalized: list[dict] = []
    seen: set[str] = set()
    for concept in concepts:
        cleaned = str(concept.get("name", "")).strip()
        key = cleaned.casefold()
        if cleaned and key not in seen:
            requested_id = str(concept.get("id", "")).strip()
            concept_id = requested_id if requested_id in existing_ids else str(uuid.uuid4())
            normalized.append({"id": concept_id, "name": cleaned[:120]})
            seen.add(key)

    now = datetime.now().isoformat()
    with _connect() as conn:
        conn.execute("DELETE FROM course_concepts WHERE course_id = ?", (course_id,))
        conn.executemany("""
            INSERT INTO course_concepts (
                course_id, concept_id, name, display_order, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
        """, [
            (course_id, concept["id"], concept["name"], position, now, now)
            for position, concept in enumerate(normalized)
        ])
    return normalized


def get_student_course_id(user_id: int) -> str:
    init_db()
    with _connect() as conn:
        row = conn.execute("""
            SELECT course_id FROM students WHERE user_id = ?
        """, (user_id,)).fetchone()
    return row["course_id"] if row and row["course_id"] else get_active_course_id()


def _ensure_student(user_id: int):
    now = datetime.now().isoformat()
    course_id = get_active_course_id()
    with _connect() as conn:
        conn.execute("""
            INSERT OR IGNORE INTO students (
                user_id, name, interests_json, style, registered, joined_at, quiz_count, updated_at, course_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, None, "[]", None, 0, None, 0, now, course_id))


def _row_to_student(row: sqlite3.Row, mastery: dict) -> dict:
    interests_raw = row["interests_json"] or "[]"
    try:
        interests = json.loads(interests_raw)
    except json.JSONDecodeError:
        interests = []

    return {
        "name": row["name"],
        "interests": interests,
        "style": row["style"],
        "registered": bool(row["registered"]),
        "joined_at": row["joined_at"],
        "quiz_count": row["quiz_count"],
        "course_id": row["course_id"],
        "mastery": mastery,
    }


def get_student(user_id: int) -> dict | None:
    init_db()
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM students WHERE user_id = ?",
            (user_id,),
        ).fetchone()

    if row is None:
        return None

    return _row_to_student(row, get_mastery_summary(user_id))


def save_student(user_id: int, data: dict) -> None:
    init_db()
    _ensure_student(user_id)

    existing = get_student(user_id) or {}
    name = data.get("name", existing.get("name"))
    interests = data.get("interests", existing.get("interests", []))
    style = data.get("style", existing.get("style"))
    registered = int(data.get("registered", existing.get("registered", False)))
    joined_at = data.get("joined_at", existing.get("joined_at"))
    quiz_count = data.get("quiz_count", existing.get("quiz_count", 0))
    course_id = data.get("course_id", existing.get("course_id") or get_active_course_id())
    now = datetime.now().isoformat()

    with _connect() as conn:
        conn.execute("""
            UPDATE students
            SET name = ?,
                interests_json = ?,
                style = ?,
                registered = ?,
                joined_at = ?,
                quiz_count = ?,
                course_id = ?,
                updated_at = ?
            WHERE user_id = ?
        """, (
            name,
            json.dumps(interests),
            style,
            registered,
            joined_at,
            quiz_count,
            course_id,
            now,
            user_id,
        ))


def update_mastery(
    user_id: int,
    concept: str,
    delta: int,
    course_id: str | None = None,
    concept_id: str | None = None,
) -> None:
    init_db()
    if not concept:
        return

    _ensure_student(user_id)
    now = datetime.now().isoformat()
    course_id = course_id or get_student_course_id(user_id)

    with _connect() as conn:
        if concept_id:
            current_row = conn.execute("""
                SELECT score FROM mastery WHERE user_id = ? AND concept_id = ? AND course_id = ?
            """, (user_id, concept_id, course_id)).fetchone()
        else:
            current_row = conn.execute("""
                SELECT score FROM mastery WHERE user_id = ? AND concept = ? AND course_id = ?
            """, (user_id, concept, course_id)).fetchone()
        current = current_row["score"] if current_row else 0
        score = max(0, min(100, current + delta))

        if concept_id and current_row:
            conn.execute("""
                UPDATE mastery
                SET concept = ?, score = ?, updated_at = ?
                WHERE user_id = ? AND course_id = ? AND concept_id = ?
            """, (concept, score, now, user_id, course_id, concept_id))
        else:
            conn.execute("""
                INSERT INTO mastery (user_id, concept, score, updated_at, course_id, concept_id)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, concept) DO UPDATE SET
                    score = excluded.score,
                    updated_at = excluded.updated_at,
                    course_id = excluded.course_id,
                    concept_id = excluded.concept_id
            """, (user_id, concept, score, now, course_id, concept_id))


def get_mastery_summary(user_id: int, course_id: str | None = None) -> dict:
    init_db()
    course_id = course_id or get_student_course_id(user_id)
    with _connect() as conn:
        rows = conn.execute("""
            SELECT COALESCE(course_concepts.name, mastery.concept) AS concept, mastery.score
            FROM mastery
            LEFT JOIN course_concepts
              ON course_concepts.course_id = mastery.course_id
             AND course_concepts.concept_id = mastery.concept_id
            WHERE mastery.user_id = ? AND mastery.course_id = ?
            ORDER BY concept
        """, (user_id, course_id)).fetchall()

    return {row["concept"]: row["score"] for row in rows}


def record_quiz_result(user_id: int, result: dict, course_id: str | None = None) -> None:
    init_db()
    _ensure_student(user_id)

    now = datetime.now().isoformat()
    course_id = course_id or get_student_course_id(user_id)
    with _connect() as conn:
        conn.execute("""
            INSERT INTO quiz_results (
                user_id, q_id, concept, selected, correct, created_at, raw_json, course_id, concept_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            result.get("q_id"),
            result.get("concept"),
            result.get("selected"),
            int(bool(result.get("correct"))),
            now,
            json.dumps(result),
            course_id,
            result.get("concept_id"),
        ))

        conn.execute("""
            UPDATE students
            SET quiz_count = quiz_count + 1,
                updated_at = ?
            WHERE user_id = ?
        """, (now, user_id))


def list_students() -> list[tuple[int, dict]]:
    init_db()
    course_id = get_active_course_id()
    with _connect() as conn:
        rows = conn.execute("""
            SELECT user_id
            FROM students
            WHERE registered = 1 AND course_id = ?
            ORDER BY updated_at DESC
        """, (course_id,)).fetchall()

    return [
        (row["user_id"], get_student(row["user_id"]))
        for row in rows
    ]


def get_quiz_results(user_id: int, course_id: str | None = None) -> list[dict]:
    init_db()
    course_id = course_id or get_student_course_id(user_id)
    with _connect() as conn:
        rows = conn.execute("""
            SELECT quiz_results.q_id,
                   COALESCE(course_concepts.name, quiz_results.concept) AS concept,
                   quiz_results.selected, quiz_results.correct, quiz_results.created_at,
                   quiz_results.raw_json
            FROM quiz_results
            LEFT JOIN course_concepts
              ON course_concepts.course_id = quiz_results.course_id
             AND course_concepts.concept_id = quiz_results.concept_id
            WHERE quiz_results.user_id = ? AND quiz_results.course_id = ?
            ORDER BY quiz_results.created_at ASC
        """, (user_id, course_id)).fetchall()

    results = []
    for row in rows:
        try:
            raw = json.loads(row["raw_json"])
        except json.JSONDecodeError:
            raw = {}
        raw.update({
            "q_id": row["q_id"],
            "concept": row["concept"],
            "selected": row["selected"],
            "correct": bool(row["correct"]),
            "created_at": row["created_at"],
        })
        results.append(raw)

    return results


def get_recent_activity_results(
    user_id: int,
    limit: int = 5,
    course_id: str | None = None,
) -> list[dict]:
    """Return a compact, recent learning history for activity selection."""
    init_db()
    course_id = course_id or get_student_course_id(user_id)
    with _connect() as conn:
        rows = conn.execute("""
            SELECT COALESCE(course_concepts.name, quiz_results.concept) AS concept,
                   quiz_results.correct, quiz_results.created_at, quiz_results.raw_json
            FROM quiz_results
            LEFT JOIN course_concepts
              ON course_concepts.course_id = quiz_results.course_id
             AND course_concepts.concept_id = quiz_results.concept_id
            WHERE quiz_results.user_id = ? AND quiz_results.course_id = ?
            ORDER BY quiz_results.id DESC
            LIMIT ?
        """, (user_id, course_id, limit)).fetchall()

    results = []
    for row in reversed(rows):
        try:
            raw = json.loads(row["raw_json"])
        except json.JSONDecodeError:
            raw = {}
        results.append({
            "activity_type": raw.get("activity_type", "quiz"),
            "concept": row["concept"],
            "understood": bool(row["correct"]),
            "mastery_delta": raw.get("mastery_delta", 0),
            "created_at": row["created_at"],
        })

    return results


def get_conversation_summary(user_id: int) -> str:
    """Return the single shared summary used by chat and learning activities."""
    init_db()
    with _connect() as conn:
        row = conn.execute("""
            SELECT content
            FROM conversation_memories
            WHERE user_id = ? AND memory_key = 'conversation_summary'
        """, (user_id,)).fetchone()

    return row["content"] if row else ""


def upsert_conversation_summary(user_id: int, summary: str) -> None:
    """Save one shared, durable conversation summary for a student."""
    summary = summary.strip()
    if not summary or len(summary) > 2_000:
        return

    init_db()
    _ensure_student(user_id)
    now = datetime.now().isoformat()

    with _connect() as conn:
        conn.execute("""
            INSERT INTO conversation_memories (
                user_id, memory_key, category, content, created_at, updated_at
            )
            VALUES (?, 'conversation_summary', 'ongoing_context', ?, ?, ?)
            ON CONFLICT(user_id, memory_key) DO UPDATE SET
                content = excluded.content,
                updated_at = excluded.updated_at
        """, (user_id, summary, now, now))


def record_conversation_message(
    user_id: int,
    role: str,
    content: str,
    telegram_message_id: int | None = None,
) -> None:
    """Persist one raw student or tutor message for short-term conversational context."""
    if role not in {"user", "assistant"} or not content.strip():
        return

    init_db()
    _ensure_student(user_id)
    with _connect() as conn:
        conn.execute("""
            INSERT INTO conversation_messages (
                user_id, role, content, telegram_message_id, created_at
            )
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, role, content.strip(), telegram_message_id, datetime.now().isoformat()))


def update_conversation_message(
    user_id: int,
    telegram_message_id: int,
    content: str,
) -> None:
    """Keep an edited Telegram bot message as one transcript entry."""
    if not content.strip():
        return

    init_db()
    with _connect() as conn:
        cursor = conn.execute("""
            UPDATE conversation_messages
            SET content = ?
            WHERE user_id = ?
              AND role = 'assistant'
              AND telegram_message_id = ?
        """, (content.strip(), user_id, telegram_message_id))

    if cursor.rowcount == 0:
        record_conversation_message(user_id, "assistant", content, telegram_message_id)


def get_recent_conversation_messages(
    user_id: int,
    limit: int = 10,
    role: str | None = None,
) -> list[dict]:
    """Return the latest raw conversation turns in chronological order."""
    init_db()
    with _connect() as conn:
        if role:
            rows = conn.execute("""
                SELECT role, content, created_at
                FROM conversation_messages
                WHERE user_id = ? AND role = ?
                ORDER BY id DESC
                LIMIT ?
            """, (user_id, role, limit)).fetchall()
        else:
            rows = conn.execute("""
                SELECT role, content, created_at
                FROM conversation_messages
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT ?
            """, (user_id, limit)).fetchall()

    return [dict(row) for row in reversed(rows)]


def clear_all():
    """
    Test helper. Do not call from application code.
    """
    init_db()
    with _connect() as conn:
        conn.execute("DELETE FROM conversation_messages")
        conn.execute("DELETE FROM conversation_memories")
        conn.execute("DELETE FROM quiz_results")
        conn.execute("DELETE FROM mastery")
        conn.execute("DELETE FROM students")
        conn.execute("DELETE FROM course_materials")
