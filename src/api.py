import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from dotenv import load_dotenv

try:
    from . import course_rag
    from . import database as db
except ImportError:
    import course_rag
    import database as db


app = FastAPI(title="Micro-Adaptive API")
load_dotenv(Path(__file__).resolve().parent / ".env")
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


class CourseUpdate(BaseModel):
    name: str
    code: str | None = None
    description: str = ""
    semester: str = "Current"
    classSize: int | None = None
    objectives: list[str] = []


class CourseConceptInput(BaseModel):
    id: str | None = None
    name: str


class CourseConceptsUpdate(BaseModel):
    concepts: list[CourseConceptInput]


class EducatorRegistration(BaseModel):
    fullName: str
    email: str
    institution: str
    password: str


class EducatorLogin(BaseModel):
    email: str
    password: str


def _safe_material_path(filename: str, course_id: str) -> Path:
    safe_name = Path(filename).name
    suffix = Path(safe_name).suffix.lower()

    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only .txt and .pdf course materials are supported.",
        )

    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    return MATERIALS_DIR / course_id / safe_name


def _list_materials(course_id: str | None = None) -> list[dict]:
    return db.list_materials(course_id)


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
    confirmed_concepts = db.get_course_concepts()
    totals: dict[str, list[int]] = {concept: [] for concept in confirmed_concepts}
    for student in students:
        for item in student["mastery"]:
            concept = item["concept"]
            # Once an educator has confirmed the course map, the dashboard must
            # not surface old fallback concepts such as "course overview".
            if confirmed_concepts and concept not in totals:
                continue
            totals.setdefault(concept, []).append(item["score"])

    return [
        {"concept": concept, "avg": round(sum(scores) / len(scores)) if scores else 0}
        for concept, scores in totals.items()
    ]


def _extract_intention_concepts(text: str) -> list[str]:
    known_concepts = db.get_course_concepts()
    return [
        concept for concept in known_concepts
        if concept.lower() in text.lower()
    ]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/materials")
def list_materials(course_id: str | None = Query(default=None)):
    return {"materials": _list_materials(course_id)}


@app.get("/course")
def get_course():
    return {"course": db.get_course()}


@app.get("/auth/me")
def get_current_educator():
    return {"educator": db.get_active_educator()}


@app.post("/auth/register")
def register_educator(payload: EducatorRegistration):
    try:
        educator = db.register_educator(
            payload.fullName, payload.email, payload.institution, payload.password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"educator": educator}


@app.post("/auth/login")
def login_educator(payload: EducatorLogin):
    educator = db.authenticate_educator(payload.email, payload.password)
    if educator is None:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {"educator": educator}


@app.post("/course")
def save_course(payload: CourseUpdate):
    course = db.save_course({
        "name": payload.name,
        "code": payload.code,
        "description": payload.description,
        "semester": payload.semester,
        "class_size": payload.classSize,
        "objectives": payload.objectives,
    })
    return {"course": course}


@app.get("/course/invite")
def get_course_invite():
    token = os.getenv("BOT_TOKEN", "")
    if not token:
        raise HTTPException(status_code=500, detail="BOT_TOKEN is not configured.")

    try:
        response = requests.get(f"https://api.telegram.org/bot{token}/getMe", timeout=10)
        bot_data = response.json()
        username = bot_data.get("result", {}).get("username") if bot_data.get("ok") else None
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Could not reach Telegram to create the invite.") from exc

    if not username:
        raise HTTPException(status_code=502, detail="Telegram did not return a bot username.")

    course = db.get_course()
    payload = f"course_{course['course_id']}"
    return {
        "course_id": course["course_id"],
        "course_name": course["name"],
        "bot_username": username,
        "link": f"https://t.me/{username}?start={payload}",
    }


@app.get("/course/concepts")
def get_course_concepts(course_id: str | None = Query(default=None)):
    active_course_id = course_id or db.get_active_course_id()
    return {"course_id": active_course_id, "concepts": db.get_course_concept_records(active_course_id)}


@app.post("/course/concepts")
def save_course_concepts(
    payload: CourseConceptsUpdate,
    course_id: str | None = Query(default=None),
):
    active_course_id = course_id or db.get_active_course_id()
    concepts = db.replace_course_concepts(
        active_course_id,
        [concept.model_dump() for concept in payload.concepts],
    )
    return {"course_id": active_course_id, "concepts": concepts}


@app.post("/course/concepts/suggestions")
def suggest_course_concepts(course_id: str | None = Query(default=None)):
    active_course_id = course_id or db.get_active_course_id()
    course = db.get_course(active_course_id)
    materials = db.list_materials(active_course_id)
    paths = [MATERIALS_DIR / active_course_id / item["filename"] for item in materials]
    if not paths:
        raise HTTPException(status_code=400, detail="Upload course materials before generating suggestions.")

    try:
        concepts = course_rag.suggest_course_concepts(
            paths,
            course["name"],
            course.get("objectives", []),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not generate concept suggestions: {exc}") from exc
    return {"course_id": active_course_id, "concepts": concepts}


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
async def upload_material(
    file: UploadFile = File(...),
    course_id: str | None = Query(default=None),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename.")

    active_course_id = course_id or db.get_active_course_id()

    # save the uploaded file to this course's material directory
    save_path = _safe_material_path(file.filename, active_course_id)
    save_path.parent.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    save_path.write_bytes(content)

    # Index the uploaded material for retrieval
    try:
        course_rag.index_uploaded_material(save_path, course_id=active_course_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Upload saved but indexing failed: {exc}") from exc

    suffix = save_path.suffix.lower().lstrip(".")
    db.record_material(active_course_id, save_path.name, suffix, save_path.stat().st_size, "indexed")

    return {
        "status": "uploaded",
        "filename": save_path.name,
        "course_id": active_course_id,
        "materials": _list_materials(active_course_id),
    }


@app.delete("/materials/{filename}")
def delete_material(filename: str, course_id: str | None = Query(default=None)):
    active_course_id = course_id or db.get_active_course_id()
    safe_path = _safe_material_path(filename, active_course_id)
    material = db.get_material(active_course_id, safe_path.name)
    if material is None:
        raise HTTPException(status_code=404, detail="Course material not found.")

    try:
        course_rag.remove_material_from_index(safe_path.name, active_course_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        if safe_path.exists():
            safe_path.unlink()
        db.delete_material(active_course_id, safe_path.name)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not delete material file: {exc}") from exc

    return {
        "status": "deleted",
        "filename": safe_path.name,
        "course_id": active_course_id,
        "materials": _list_materials(active_course_id),
    }
