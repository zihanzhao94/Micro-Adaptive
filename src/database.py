"""
database.py — SQLite persistence layer
Replaces mock_db.py, same public interface.
"""

import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "micro_adaptive.db")


def init_db():
    # TODO: 创建 students, mastery, quiz_log 三张表
    pass


def get_student(user_id: int) -> dict | None:
    # TODO: 从 DB 查学生信息
    pass


def save_student(user_id: int, data: dict) -> None:
    # TODO: 插入或更新学生信息
    pass


def update_mastery(user_id: int, concept: str, delta: int) -> None:
    # TODO: 更新掌握度分数（0-100 范围内）
    pass


def get_mastery_summary(user_id: int) -> dict:
    # TODO: 返回 {concept: score} 的 dict
    pass


def record_quiz_result(user_id: int, result: dict) -> None:
    # TODO: 记录答题结果，更新 quiz_count
    pass
