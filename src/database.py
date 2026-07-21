"""
database.py — SQLite persistence layer.

Keeps the same public interface as mock_db.py so bot.py and api.py can share
student state across separate processes.
"""

import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path


DB_PATH = Path(os.getenv(
    "MICRO_ADAPTIVE_DB",
    Path(__file__).resolve().parent.parent / "micro_adaptive.db",
))

DEFAULT_MASTERY = {
    "Linear Regression": 0,
    "Gradient Descent": 0,
    "Backpropagation": 0,
    "Loss Functions": 0,
    "Overfitting": 0,
    "Neural Networks": 0,
    "Regularization": 0,
    "Evaluation Metrics": 0,
}


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    with _connect() as conn:
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


def _ensure_student(user_id: int):
    now = datetime.now().isoformat()
    with _connect() as conn:
        conn.execute("""
            INSERT OR IGNORE INTO students (
                user_id, name, interests_json, style, registered, joined_at, quiz_count, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, None, "[]", None, 0, None, 0, now))

        for concept, score in DEFAULT_MASTERY.items():
            conn.execute("""
                INSERT OR IGNORE INTO mastery (user_id, concept, score, updated_at)
                VALUES (?, ?, ?, ?)
            """, (user_id, concept, score, now))


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
                updated_at = ?
            WHERE user_id = ?
        """, (
            name,
            json.dumps(interests),
            style,
            registered,
            joined_at,
            quiz_count,
            now,
            user_id,
        ))


def update_mastery(user_id: int, concept: str, delta: int) -> None:
    init_db()
    if not concept:
        return

    _ensure_student(user_id)
    now = datetime.now().isoformat()

    with _connect() as conn:
        current_row = conn.execute("""
            SELECT score FROM mastery WHERE user_id = ? AND concept = ?
        """, (user_id, concept)).fetchone()
        current = current_row["score"] if current_row else 0
        score = max(0, min(100, current + delta))

        conn.execute("""
            INSERT INTO mastery (user_id, concept, score, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, concept) DO UPDATE SET
                score = excluded.score,
                updated_at = excluded.updated_at
        """, (user_id, concept, score, now))


def get_mastery_summary(user_id: int) -> dict:
    init_db()
    with _connect() as conn:
        rows = conn.execute("""
            SELECT concept, score
            FROM mastery
            WHERE user_id = ?
            ORDER BY concept
        """, (user_id,)).fetchall()

    return {row["concept"]: row["score"] for row in rows}


def record_quiz_result(user_id: int, result: dict) -> None:
    init_db()
    _ensure_student(user_id)

    now = datetime.now().isoformat()
    with _connect() as conn:
        conn.execute("""
            INSERT INTO quiz_results (
                user_id, q_id, concept, selected, correct, created_at, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            result.get("q_id"),
            result.get("concept"),
            result.get("selected"),
            int(bool(result.get("correct"))),
            now,
            json.dumps(result),
        ))

        conn.execute("""
            UPDATE students
            SET quiz_count = quiz_count + 1,
                updated_at = ?
            WHERE user_id = ?
        """, (now, user_id))


def list_students() -> list[tuple[int, dict]]:
    init_db()
    with _connect() as conn:
        rows = conn.execute("""
            SELECT user_id
            FROM students
            WHERE registered = 1
            ORDER BY updated_at DESC
        """).fetchall()

    return [
        (row["user_id"], get_student(row["user_id"]))
        for row in rows
    ]


def get_quiz_results(user_id: int) -> list[dict]:
    init_db()
    with _connect() as conn:
        rows = conn.execute("""
            SELECT q_id, concept, selected, correct, created_at, raw_json
            FROM quiz_results
            WHERE user_id = ?
            ORDER BY created_at ASC
        """, (user_id,)).fetchall()

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


def clear_all():
    """
    Test helper. Do not call from application code.
    """
    init_db()
    with _connect() as conn:
        conn.execute("DELETE FROM quiz_results")
        conn.execute("DELETE FROM mastery")
        conn.execute("DELETE FROM students")
