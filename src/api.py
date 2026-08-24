import os
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from dotenv import load_dotenv

try:
    from . import course_rag
    from . import database as db
    from . import reflections
except ImportError:
    import course_rag
    import database as db
    import reflections


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

# Ceiling for one week's extraction. The course-wide range (up to 12) makes the
# model pad a single lecture's list with slide headings to reach it.
MAX_WEEK_CONCEPTS = 10

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
    startDate: str | None = None
    totalWeeks: int | None = None
    pushWeekday: int | None = None
    pushTime: str | None = None
    pushEnabled: bool | None = None


class MaterialWeekUpdate(BaseModel):
    week: int | None = None


class WeekNoteUpdate(BaseModel):
    note: str = ""


class ReflectionPromptUpdate(BaseModel):
    prompt: str = ""


class ConceptWeeksUpdate(BaseModel):
    weeks: list[int] = []


class LinkWeekConcepts(BaseModel):
    week: int
    concepts: list[str] = []


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


def _concept_mastery_by_week(students: list[dict], course_id: str) -> list[dict]:
    """Class mastery grouped by the week each concept is taught in.

    A flat concept list gives no sense of when something was covered — week 2's
    material sitting next to week 11's makes a low score look equally urgent
    either way. Concepts taught in several weeks appear under each of them.
    """
    by_concept = {item["concept"]: item["avg"] for item in _concept_mastery(students)}
    course = db.get_course(course_id)
    total_weeks = course.get("totalWeeks") or 0
    current_week = db.current_week_no(course_id)

    groups = []
    for week in range(1, total_weeks + 1):
        concepts = db.get_concepts_for_week(course_id, week)
        if not concepts:
            continue
        scored = [{"concept": name, "avg": by_concept.get(name, 0)} for name in concepts]
        groups.append({
            "week": week,
            "isCurrent": week == current_week,
            "avg": round(sum(item["avg"] for item in scored) / len(scored)),
            "concepts": scored,
        })
    return groups


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
    data = {
        "name": payload.name,
        "code": payload.code,
        "description": payload.description,
        "semester": payload.semester,
        "class_size": payload.classSize,
        "objectives": payload.objectives,
    }
    # Only forward schedule fields the client actually sent, so the setup wizard
    # (which knows nothing about pushes) can't clear them on save.
    sent = payload.model_fields_set
    for field, column in (
        ("startDate", "start_date"),
        ("totalWeeks", "total_weeks"),
        ("pushWeekday", "push_weekday"),
        ("pushTime", "push_time"),
        ("pushEnabled", "push_enabled"),
    ):
        if field in sent:
            data[column] = getattr(payload, field)

    return {"course": db.save_course(data)}


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
def suggest_course_concepts(
    course_id: str | None = Query(default=None),
    week: int | None = Query(default=None),
):
    """Suggest concepts, optionally scoped to one week's materials.

    With `week`, only that week's uploads are read — so the concepts that come
    back are the ones to link to that week, rather than a re-derivation of the
    whole course.
    """
    active_course_id = course_id or db.get_active_course_id()
    course = db.get_course(active_course_id)
    materials = db.list_materials(active_course_id, week_no=week)
    paths = [MATERIALS_DIR / active_course_id / item["filename"] for item in materials]
    if not paths:
        detail = (
            f"No materials tagged for week {week}." if week is not None
            else "Upload course materials before generating suggestions."
        )
        raise HTTPException(status_code=400, detail=detail)

    try:
        concepts = course_rag.suggest_course_concepts(
            paths,
            course["name"],
            course.get("objectives", []),
            max_concepts=MAX_WEEK_CONCEPTS if week is not None else 12,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not generate concept suggestions: {exc}") from exc
    return {"course_id": active_course_id, "concepts": concepts}


@app.get("/course/concepts/weeks")
def get_concept_weeks(course_id: str | None = Query(default=None)):
    """Concepts grouped by teaching week, plus whatever isn't assigned yet.

    Grouped this way rather than concept-by-concept because that's the shape the
    educator thinks in ("what does week 3 cover?") and it matches how materials
    are already listed.
    """
    active_course_id = course_id or db.get_active_course_id()
    course = db.get_course(active_course_id)
    total_weeks = course.get("totalWeeks")
    records = db.get_course_concept_records(active_course_id)
    weeks_by_concept = db.get_weeks_by_concept(active_course_id)

    materials = db.list_materials(active_course_id)
    material_counts: dict[int, int] = {}
    for item in materials:
        if item.get("week_no"):
            material_counts[item["week_no"]] = material_counts.get(item["week_no"], 0) + 1

    weeks = []
    for week in range(1, (total_weeks or 0) + 1):
        weeks.append({
            "week": week,
            "materialCount": material_counts.get(week, 0),
            "concepts": [
                {"id": record["id"], "name": record["name"]}
                for record in records
                if week in weeks_by_concept.get(record["id"], [])
            ],
        })

    return {
        "totalWeeks": total_weeks,
        "weeks": weeks,
        "unassigned": [
            {"id": record["id"], "name": record["name"]}
            for record in records if not weeks_by_concept.get(record["id"])
        ],
        "allConcepts": records,
    }


@app.post("/course/concepts/{concept_id}/weeks/{week}")
def add_concept_to_week(concept_id: str, week: int, course_id: str | None = Query(default=None)):
    active_course_id = course_id or db.get_active_course_id()
    weeks = set(db.get_weeks_by_concept(active_course_id).get(concept_id, []))
    weeks.add(week)
    db.set_concept_weeks(active_course_id, concept_id, sorted(weeks))
    return {"concept_id": concept_id, "weeks": sorted(weeks)}


@app.delete("/course/concepts/{concept_id}/weeks/{week}")
def remove_concept_from_week(concept_id: str, week: int, course_id: str | None = Query(default=None)):
    """Unlink a concept from a week. The concept itself is kept — it may still
    be taught in other weeks, and its mastery history stays valid either way."""
    active_course_id = course_id or db.get_active_course_id()
    weeks = set(db.get_weeks_by_concept(active_course_id).get(concept_id, []))
    weeks.discard(week)
    db.set_concept_weeks(active_course_id, concept_id, sorted(weeks))
    return {"concept_id": concept_id, "weeks": sorted(weeks)}


@app.put("/course/concepts/{concept_id}/weeks")
def update_concept_weeks(
    concept_id: str,
    payload: ConceptWeeksUpdate,
    course_id: str | None = Query(default=None),
):
    active_course_id = course_id or db.get_active_course_id()
    db.set_concept_weeks(active_course_id, concept_id, payload.weeks)
    return {"concept_id": concept_id, "weeks": sorted(set(payload.weeks))}


@app.post("/course/concepts/link-week")
def link_concepts_to_week(payload: LinkWeekConcepts, course_id: str | None = Query(default=None)):
    """Attach concepts to a week, creating any that are new."""
    active_course_id = course_id or db.get_active_course_id()
    created = db.link_concepts_to_week(active_course_id, payload.week, payload.concepts)
    return {
        "week": payload.week,
        "linked": db.get_concepts_for_week(active_course_id, payload.week),
        "created": created,
    }


@app.post("/course/concepts/extract-week")
def extract_week_concepts(week: int = Query(...), course_id: str | None = Query(default=None)):
    """Read a week's materials, then add and link the concepts they cover.

    One call so an upload immediately produces usable reflection buttons: the
    extraction reuses existing concept names where they fit, new ones are added
    to the course list, and everything found is linked to the week. The educator
    prunes on the concepts page afterwards.
    """
    active_course_id = course_id or db.get_active_course_id()
    course = db.get_course(active_course_id)
    materials = db.list_materials(active_course_id, week_no=week)
    paths = [MATERIALS_DIR / active_course_id / item["filename"] for item in materials]
    if not paths:
        raise HTTPException(status_code=400, detail=f"No materials tagged for week {week}.")

    try:
        concepts = course_rag.suggest_course_concepts(
            paths,
            course["name"],
            course.get("objectives", []),
            existing_concepts=db.get_course_concepts(active_course_id),
            max_concepts=MAX_WEEK_CONCEPTS,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not derive concepts: {exc}") from exc

    created = db.link_concepts_to_week(active_course_id, week, concepts)
    return {
        "week": week,
        "linked": db.get_concepts_for_week(active_course_id, week),
        "created": created,
    }


@app.get("/schedule/prompt")
def get_reflection_prompt(course_id: str | None = Query(default=None)):
    """The weekly prompt as students will actually receive it.

    Returns both the raw template and a rendered preview, so the educator sees
    the real message rather than having to imagine what {week} expands to.
    """
    active_course_id = course_id or db.get_active_course_id()
    template = db.get_reflection_prompt(active_course_id)
    week = db.current_week_no(active_course_id) or 1
    # Same call the push uses, so the preview reflects the button cap rather
    # than every concept linked to the week.
    concepts = reflections.week_concepts(active_course_id, week)

    try:
        preview = template.format(week=week, max_picks=reflections.MAX_PICKS)
    except (KeyError, IndexError, ValueError) as exc:
        # A stray brace in the educator's wording shouldn't 500 the page.
        preview = f"[This wording can't be rendered: {exc}]"

    return {
        "template": template,
        "preview": preview,
        "week": week,
        "concepts": concepts,
        "isDefault": template == db.DEFAULT_REFLECTION_PROMPT,
        "default": db.DEFAULT_REFLECTION_PROMPT,
    }


@app.put("/schedule/prompt")
def update_reflection_prompt(
    payload: ReflectionPromptUpdate,
    course_id: str | None = Query(default=None),
):
    """Save the educator's wording. An empty string restores the default."""
    active_course_id = course_id or db.get_active_course_id()
    prompt = payload.prompt.strip()

    if prompt:
        try:
            prompt.format(week=1, max_picks=reflections.MAX_PICKS)
        except (KeyError, IndexError, ValueError) as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Only {{week}} and {{max_picks}} can be used as placeholders ({exc}).",
            )

    db.set_reflection_prompt(active_course_id, prompt)
    return get_reflection_prompt(course_id=active_course_id)


@app.get("/schedule/status")
def schedule_status(course_id: str | None = Query(default=None)):
    """Whether this week is actually ready to send.

    A week with no tagged materials is skipped rather than asked about with
    other weeks' concepts, so the educator needs to see that before the
    scheduled time rather than discover the silence afterwards.
    """
    active_course_id = course_id or db.get_active_course_id()
    week = db.current_week_no(active_course_id)
    if week is None:
        return {"week": None, "materialCount": 0, "ready": False, "skippedWeek": None}

    materials = db.list_materials(active_course_id, week_no=week)
    return {
        "week": week,
        "materialCount": len(materials),
        "ready": bool(materials),
        "skippedWeek": db.get_skipped_push_week(active_course_id),
    }


@app.post("/schedule/send-now")
def send_now(kind: str = Query(...), course_id: str | None = Query(default=None)):
    """Queue a manual send. The bot picks it up on its next poll (~30s)."""
    if kind not in {"push", "digest"}:
        raise HTTPException(status_code=400, detail="kind must be 'push' or 'digest'.")

    active_course_id = course_id or db.get_active_course_id()
    course = db.get_course(active_course_id)
    if not course.get("pushEnabled"):
        raise HTTPException(status_code=400, detail="Enable weekly push before sending.")
    if kind == "push":
        week = db.current_week_no(active_course_id)
        if week is not None and not db.list_materials(active_course_id, week_no=week):
            raise HTTPException(
                status_code=400,
                detail=f"Week {week} has no materials tagged yet — upload this week's "
                       "slides first, or students would be asked about other weeks' concepts.",
            )

    if kind == "digest":
        if not db.get_last_pushed_slot(active_course_id):
            raise HTTPException(status_code=400, detail="Send the weekly push first — a digest summarises its replies.")
        # There is nothing to summarise until someone answers, and sending an
        # empty digest would just be noise.
        week = db.get_last_pushed_week(active_course_id)
        if not db.list_reflections(active_course_id, week_no=week):
            raise HTTPException(
                status_code=400,
                detail=f"No one has answered week {week} yet — there is nothing to summarise.",
            )

    db.request_send_now(active_course_id, kind)
    return {"status": "queued", "kind": kind, "students": len(db.list_students())}


@app.get("/reflections")
def get_reflections(
    week: int | None = Query(default=None),
    course_id: str | None = Query(default=None),
):
    """One week's reflections, aggregated for the educator.

    Concepts the week offered but nobody picked are included with a count of 0 —
    those are exactly the ones that did not land.
    """
    active_course_id = course_id or db.get_active_course_id()
    all_reflections = db.list_reflections(active_course_id)
    available_weeks = sorted({item["week"] for item in all_reflections}, reverse=True)

    current_week = week if week is not None else (available_weeks[0] if available_weeks else None)
    if current_week is None:
        return {
            "week": None,
            "availableWeeks": [],
            "respondedCount": 0,
            "totalStudents": len(db.list_students()),
            "concepts": [],
            "confusions": [],
            "unmatched": [],
            "misconceptions": [],
            "note": "",
            "analysis": {"summary": "", "highlights": [], "responded": 0},
        }

    # Named week_entries, not reflections: a local called `reflections` shadows
    # the module imported at the top of this file, and the class_analysis call
    # below then runs against a list and 500s.
    week_entries = [item for item in all_reflections if item["week"] == current_week]

    # Seed with the week's linked concepts so ones nobody recalled still show as
    # 0 — "taught but nobody brought it up" is the signal this page exists for.
    counts: dict[str, int] = {name: 0 for name in db.get_concepts_for_week(active_course_id, current_week)}
    for item in week_entries:
        for concept in item["concepts"]:
            counts[concept] = counts.get(concept, 0) + 1

    # Grouped so a phrase several students raised stands out from a one-off: a
    # repeated unmatched phrase usually means the concept map is missing
    # something the lecture actually covered.
    unmatched_counts: dict[str, int] = {}
    for item in week_entries:
        for phrase in item.get("unmatched", []):
            key = phrase.strip()
            if key:
                unmatched_counts[key] = unmatched_counts.get(key, 0) + 1

    return {
        "week": current_week,
        "availableWeeks": available_weeks,
        "respondedCount": len(week_entries),
        "totalStudents": len(db.list_students()),
        "unmatched": [
            {"text": text, "count": count}
            for text, count in sorted(unmatched_counts.items(), key=lambda kv: (-kv[1], kv[0]))
        ],
        # Attributed, because the lecturer's next move is to look at what that
        # student actually wrote rather than to act on a count.
        "misconceptions": [
            {"studentName": item["studentName"], "text": phrase}
            for item in week_entries for phrase in item.get("shaky", [])
        ],
        "concepts": [
            {"name": name, "count": count}
            for name, count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        ],
        "confusions": [
            {
                "studentName": item["studentName"],
                "text": item["confusion"],
                "updatedAt": item["updatedAt"],
            }
            for item in week_entries if (item["confusion"] or "").strip()
        ],
        "note": db.get_week_note(active_course_id, current_week),
        "analysis": reflections.class_analysis(active_course_id, current_week),
    }


@app.put("/reflections/{week}/note")
def update_week_note(
    week: int,
    payload: WeekNoteUpdate,
    course_id: str | None = Query(default=None),
):
    active_course_id = course_id or db.get_active_course_id()
    db.set_week_note(active_course_id, week, payload.note)
    return {"week": week, "note": db.get_week_note(active_course_id, week)}


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
    course_id = db.get_active_course_id()

    return {
        "totalStudents": len(students),
        "classAvgMastery": _average_mastery({
            student["id"]: student["avgMastery"]
            for student in students
        }),
        "activeThisWeek": sum(1 for student in students if student["weeklyActive"] > 0),
        "weakestConcept": weakest,
        "conceptMastery": concept_mastery,
        "conceptMasteryByWeek": _concept_mastery_by_week(students, course_id),
        "currentWeek": db.current_week_no(course_id),
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
    week: int | None = Form(default=None),
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
    db.record_material(
        active_course_id, save_path.name, suffix, save_path.stat().st_size, "indexed", week_no=week
    )

    return {
        "status": "uploaded",
        "filename": save_path.name,
        "course_id": active_course_id,
        "materials": _list_materials(active_course_id),
    }


@app.patch("/materials/{filename}/week")
def update_material_week(
    filename: str,
    payload: MaterialWeekUpdate,
    course_id: str | None = Query(default=None),
):
    active_course_id = course_id or db.get_active_course_id()
    safe_path = _safe_material_path(filename, active_course_id)
    if db.get_material(active_course_id, safe_path.name) is None:
        raise HTTPException(status_code=404, detail="Course material not found.")

    db.set_material_week(active_course_id, safe_path.name, payload.week)
    return {
        "status": "updated",
        "filename": safe_path.name,
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
