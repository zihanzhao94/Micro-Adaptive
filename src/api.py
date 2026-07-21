from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from . import course_rag
    from . import database as db
except ImportError:
    import course_rag
    import database as db


app = FastAPI(title="Micro-Adaptive API")
db.init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MATERIALS_DIR = Path(__file__).resolve().parent.parent / "course_materials"
ALLOWED_EXTENSIONS = {".txt", ".pdf"}

COURSE_PROFILE = {
    "name": "Course Workspace",
    "code": "Course",
    "year": "Current",
    "educatorName": "Educator",
    "educatorEmail": "",
}

TEACHING_INTENTION = {
    "week": "Current Week",
    "text": "",
    "difficulty": "medium",
    "concepts": [],
    "history": [],
}


class TeachingIntentionUpdate(BaseModel):
    text: str
    difficulty: str = "medium"


def _safe_material_path(filename: str) -> Path:
    safe_name = Path(filename).name
    suffix = Path(safe_name).suffix.lower()

    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only .txt and .pdf course materials are supported.",
        )

    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    return MATERIALS_DIR / safe_name


def _list_materials() -> list[dict]:
    MATERIALS_DIR.mkdir(exist_ok=True)
    materials = []

    for path in sorted(MATERIALS_DIR.iterdir()):
        if path.is_file() and path.suffix.lower() in ALLOWED_EXTENSIONS:
            materials.append({
                "filename": path.name,
                "type": path.suffix.lower().lstrip("."),
                "size_bytes": path.stat().st_size,
            })

    return materials


def _average_mastery(mastery: dict) -> int:
    scores = list(mastery.values())
    if not scores:
        return 0
    return round(sum(scores) / len(scores))


def _student_payload(user_id: int, student: dict) -> dict:
    mastery = student.get("mastery", {})
    results = db.get_quiz_results(user_id)
    avg_mastery = _average_mastery(mastery)

    return {
        "id": str(user_id),
        "name": student.get("name", f"Student {user_id}"),
        "telegramId": f"@{user_id}",
        "email": "",
        "learningStyle": student.get("style", "unknown"),
        "interests": student.get("interests", []),
        "avgMastery": avg_mastery,
        "quizzesDone": student.get("quiz_count", len(results)),
        "weeklyActive": min(7, len(results)),
        "trend": "flat",
        "mastery": [
            {"concept": concept, "score": score}
            for concept, score in mastery.items()
        ],
        "history": [
            {
                "type": "quiz",
                "text": f"Answered quiz on {result.get('concept', 'Unknown concept')}",
                "time": "Saved",
            }
            for result in reversed(results[-5:])
        ],
    }


def _all_students() -> list[dict]:
    return [
        _student_payload(user_id, student)
        for user_id, student in db.list_students()
        if student
    ]


def _concept_mastery(students: list[dict]) -> list[dict]:
    totals: dict[str, list[int]] = {}
    for student in students:
        for item in student["mastery"]:
            totals.setdefault(item["concept"], []).append(item["score"])

    return [
        {"concept": concept, "avg": round(sum(scores) / len(scores))}
        for concept, scores in totals.items()
    ]


def _extract_intention_concepts(text: str) -> list[str]:
    known_concepts = [item["concept"] for item in _concept_mastery(_all_students())]
    return [
        concept for concept in known_concepts
        if concept.lower() in text.lower()
    ]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/materials")
def list_materials():
    return {"materials": _list_materials()}


@app.get("/course")
def get_course():
    return {"course": COURSE_PROFILE}


@app.get("/students")
def list_students():
    return {"students": _all_students()}


@app.get("/students/{student_id}")
def get_student(student_id: int):
    student = db.get_student(student_id)
    if not student or not student.get("registered"):
        raise HTTPException(status_code=404, detail="Student not found.")
    return {"student": _student_payload(student_id, student)}


@app.get("/dashboard/summary")
def dashboard_summary():
    students = _all_students()
    concept_mastery = _concept_mastery(students)
    weakest = min(concept_mastery, key=lambda item: item["avg"], default=None)

    return {
        "totalStudents": len(students),
        "classAvgMastery": _average_mastery({
            student["id"]: student["avgMastery"]
            for student in students
        }),
        "activeThisWeek": sum(1 for student in students if student["weeklyActive"] > 0),
        "weakestConcept": weakest,
        "conceptMastery": concept_mastery,
    }


@app.get("/teaching-intention")
def get_teaching_intention():
    return {"intention": TEACHING_INTENTION}


@app.put("/teaching-intention")
def update_teaching_intention(payload: TeachingIntentionUpdate):
    concepts = _extract_intention_concepts(payload.text)

    if TEACHING_INTENTION["text"]:
        TEACHING_INTENTION["history"].insert(0, {
            "week": TEACHING_INTENTION["week"],
            "focus": TEACHING_INTENTION["text"],
            "concepts": TEACHING_INTENTION["concepts"],
        })
        TEACHING_INTENTION["history"] = TEACHING_INTENTION["history"][:5]

    TEACHING_INTENTION.update({
        "text": payload.text,
        "difficulty": payload.difficulty,
        "concepts": concepts,
    })

    return {"intention": TEACHING_INTENTION}


@app.post("/materials/reindex")
def reindex_materials():
    raise HTTPException(
        status_code=400,
        detail="Full local re-indexing is disabled. Upload a material file to index it.",
    )


@app.post("/materials/upload")
async def upload_material(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename.")

    # save the uploaded file to the course_materials directory
    save_path = _safe_material_path(file.filename)
    MATERIALS_DIR.mkdir(exist_ok=True)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    save_path.write_bytes(content)

    # Index the uploaded material for retrieval
    try:
        course_rag.index_uploaded_material(save_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Upload saved but indexing failed: {exc}") from exc

    return {
        "status": "uploaded",
        "filename": save_path.name,
        "materials": _list_materials(),
    }
