# ============================================================
# mock_db.py — In-memory mock database
# Replace with real PostgreSQL calls when backend is ready
# ============================================================

# student_id (telegram user id) → student data
STUDENTS: dict = {}

# student_id → list of quiz results
QUIZ_RESULTS: dict = {}

# Mock mastery data structure
DEFAULT_MASTERY = {
    "Linear Regression":    0,
    "Gradient Descent":     0,
    "Backpropagation":      0,
    "Loss Functions":       0,
    "Overfitting":          0,
    "Neural Networks":      0,
    "Regularization":       0,
    "Evaluation Metrics":   0,
}


def get_student(user_id: int) -> dict | None:
    return STUDENTS.get(user_id)


def save_student(user_id: int, data: dict):
    if user_id not in STUDENTS:
        STUDENTS[user_id] = {
            "mastery": DEFAULT_MASTERY.copy(),
            "quiz_count": 0,
        }
    STUDENTS[user_id].update(data)


def update_mastery(user_id: int, concept: str, delta: int):
    """Update mastery score for a concept (+/- delta, clamped 0-100)."""
    if user_id not in STUDENTS:
        return
    current = STUDENTS[user_id]["mastery"].get(concept, 0)
    STUDENTS[user_id]["mastery"][concept] = max(0, min(100, current + delta))


def record_quiz_result(user_id: int, result: dict):
    if user_id not in QUIZ_RESULTS:
        QUIZ_RESULTS[user_id] = []
    QUIZ_RESULTS[user_id].append(result)
    if user_id in STUDENTS:
        STUDENTS[user_id]["quiz_count"] = STUDENTS[user_id].get("quiz_count", 0) + 1


def get_mastery_summary(user_id: int) -> dict:
    if user_id not in STUDENTS:
        return {}
    return STUDENTS[user_id].get("mastery", {})
