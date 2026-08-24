"""
bot.py — Micro-Adaptive Telegram Bot (Student Side)
====================================================
Uses raw Telegram Bot API via requests (no library dependency issues).
Compatible with Python 3.10+.

Flows:
  /start    → Onboarding (name, interests, learning style)
  /learn    → Start an adaptive learning activity
  /progress → Mastery summary per concept
  /help     → Show commands
  <text>    → AI concept explanation (mock)
"""

import json
import logging
import os
import random
import threading
import time
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

import database as db
import agent
import reflections
import revision
from langgraph.types import Command

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).resolve().parent / ".env")
db.init_db()
TOKEN = os.getenv("BOT_TOKEN", "")
if not TOKEN:
    raise SystemExit("BOT_TOKEN not set in .env")

BASE = f"https://api.telegram.org/bot{TOKEN}"
DASHBOARD_BASE_URL = os.getenv("DASHBOARD_BASE_URL", "http://localhost:3000").rstrip("/")

logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(message)s",
    level=logging.INFO,
)
log = logging.getLogger(__name__)

TELEGRAM_SESSION = requests.Session()
TELEGRAM_SESSION.mount(
    "https://",
    HTTPAdapter(max_retries=Retry(
        total=2,
        connect=2,
        read=0,
        status=0,
        backoff_factor=0.5,
        allowed_methods=frozenset({"GET", "POST"}),
    )),
)

# ── Conversation state (in-memory) ────────────────────────────────────────────
# user_id → {"state": str, "data": dict}
SESSIONS: dict = {}
# The bot currently supports direct student chats, so this maps outgoing replies
# back to the student whose raw transcript should be updated.
CHAT_USERS: dict[int, int] = {}

STATES = {
    "IDLE":        "idle",
    "WAIT_NAME":   "wait_name",
    "WAIT_STYLE":  "wait_style",
    "WAIT_ACTIVITY_SUBMISSION": "wait_activity_submission",
    "IN_SOCRATIC": "in_socratic",   # waiting for student's Socratic reply
    "WAIT_REFLECTION_RECALL": "wait_reflection_recall",
    "WAIT_REFLECTION_CONFUSION": "wait_reflection_confusion",
}

INTEREST_OPTIONS = [
    "🎬 Movies", "🎵 Music", "⚽ Sports",
    "🎮 Gaming", "🍳 Cooking", "💻 Tech",
]

STYLE_OPTIONS = {
    "🔍 Socratic":        "socratic",
    "🎭 Analogy-Based":   "analogy",
    "📖 Direct":          "direct",
}

CAPABILITY_QUESTION_KEYWORDS = [
    "what can you do",
    "what can i do",
    "how do i start",
    "how to start",
    "help me start",
    "what should i do",
    "能做什么",
    "可以做什么",
    "怎么开始",
    "如何开始",
    "怎么用",
    "有什么功能",
]


# ═══════════════════════════════════════════════════════════════════════════════
# Telegram API helpers
# ═══════════════════════════════════════════════════════════════════════════════

def api(method: str, **kwargs) -> dict:
    try:
        response = TELEGRAM_SESSION.post(
            f"{BASE}/{method}", json=kwargs, timeout=(5, 20),
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        log.warning("Telegram %s request failed: %s", method, exc)
        return {"ok": False, "description": str(exc)}


def send(chat_id: int, text: str, reply_markup=None, parse_mode="Markdown"):
    payload = {"chat_id": chat_id, "text": text}
    if parse_mode:
        payload["parse_mode"] = parse_mode
    if reply_markup:
        payload["reply_markup"] = reply_markup
    response = api("sendMessage", **payload)
    user_id = CHAT_USERS.get(chat_id)
    message_id = response.get("result", {}).get("message_id")
    if user_id and message_id:
        db.record_conversation_message(user_id, "assistant", text, message_id)
    return response


TELEGRAM_MAX_MESSAGE_LENGTH = 4096


def send_long(chat_id: int, text: str, reply_markup=None):
    """Like send(), but splits text over Telegram's 4096-char hard cap.

    /revise's confusions and blind-spot sections are built from a whole
    semester of a student's own data and can exceed the limit; a plain send()
    would just fail silently (Telegram returns ok: false, nothing raises).
    Splits on blank-line boundaries so an entry (a week, a confusion) doesn't
    get cut mid-sentence.
    """
    if len(text) <= TELEGRAM_MAX_MESSAGE_LENGTH:
        return send(chat_id, text, reply_markup=reply_markup)

    chunks: list[str] = []
    current = ""
    for block in text.split("\n\n"):
        candidate = f"{current}\n\n{block}" if current else block
        if len(candidate) > TELEGRAM_MAX_MESSAGE_LENGTH - 100:
            if current:
                chunks.append(current)
            # A single block longer than the cap on its own: hard-truncate
            # rather than send something Telegram will reject outright.
            current = block[:TELEGRAM_MAX_MESSAGE_LENGTH - 100]
        else:
            current = candidate
    if current:
        chunks.append(current)

    result = None
    for i, chunk in enumerate(chunks):
        result = send(chat_id, chunk, reply_markup=reply_markup if i == len(chunks) - 1 else None)
    return result


def edit(chat_id: int, msg_id: int, text: str, reply_markup=None, parse_mode="Markdown"):
    payload = {"chat_id": chat_id, "message_id": msg_id, "text": text}
    if parse_mode:
        payload["parse_mode"] = parse_mode
    if reply_markup:
        payload["reply_markup"] = reply_markup
    response = api("editMessageText", **payload)
    user_id = CHAT_USERS.get(chat_id)
    if user_id and response.get("ok"):
        db.update_conversation_message(user_id, msg_id, text)
    return response


def answer_callback(callback_id: str, text: str = "", show_alert=False):
    api("answerCallbackQuery", callback_query_id=callback_id, text=text, show_alert=show_alert)


def typing(chat_id: int):
    api("sendChatAction", chat_id=chat_id, action="typing")


def inline_kb(rows: list[list[tuple]]) -> dict:
    """Build InlineKeyboardMarkup. rows = list of [(text, callback_data), ...]"""
    return {
        "inline_keyboard": [
            [{"text": t, "callback_data": d} for t, d in row]
            for row in rows
        ]
    }


def action_menu_markup() -> dict:
    return inline_kb([
        [("Start adaptive activity", "menu_learn")],
        [("Take a quiz", "menu_quiz"), ("Coding task", "menu_coding")],
        [("Diagram task", "menu_diagram"), ("View progress", "menu_progress")],
        [("Memory", "menu_memory"), ("History", "menu_history")],
    ])


def send_action_menu(chat_id: int, intro: str = ""):
    text = intro or (
        "*What you can do next*\n\n"
        "Choose an action below, or just type a course question in natural language."
    )
    send(chat_id, text, reply_markup=action_menu_markup())


def append_next_steps(text: str) -> str:
    return (
        f"{text}\n\n"
        "Next: use /learn for another adaptive activity, /progress to check mastery, "
        "or ask me any course question."
    )


def dashboard_student_url(user_id: int) -> str:
    return f"{DASHBOARD_BASE_URL}/dashboard/student/{user_id}"


def course_display_name(course_id: str | None) -> str:
    course = db.get_course(course_id) if course_id else db.get_course()
    code = course.get("code") or course.get("course_id") or "Course"
    name = course.get("name") or code
    return f"{code} — {name}" if name != code else code


def is_capability_question(text: str) -> bool:
    normalized = text.strip().lower()
    return any(keyword in normalized for keyword in CAPABILITY_QUESTION_KEYWORDS)


def message_content(message) -> str:
    if hasattr(message, "content"):
        return message.content
    if isinstance(message, dict):
        return str(message.get("content", ""))
    return str(message)


def refresh_conversation_summary(user_id: int) -> None:
    """Refresh the one summary shared by free chat and completed activities."""
    try:
        student_messages = db.get_recent_conversation_messages(user_id, limit=12, role="user")
        learning_history = db.get_recent_activity_results(user_id, limit=5)
        existing_summary = db.get_conversation_summary(user_id)
        summary = agent.summarize_conversation(
            existing_summary,
            student_messages,
            learning_history,
        )
        db.upsert_conversation_summary(user_id, summary)
    except Exception:
        log.exception("Could not refresh conversation summary for user %s", user_id)


# ═══════════════════════════════════════════════════════════════════════════════
# Handlers
# ═══════════════════════════════════════════════════════════════════════════════

def handle_start(user_id: int, chat_id: int, first_name: str, course_id: str | None = None):
    """/start: welcome returning users; start onboarding (ask name) for new ones."""
    student = db.get_student(user_id)
    if student and student.get("registered"):
        if course_id:
            if not db.course_exists(course_id):
                send(chat_id, "This course invite is no longer valid. Please ask your educator for a new link.")
                return
            if student.get("course_id") != course_id:
                db.save_student(user_id, {"course_id": course_id})
                student = db.get_student(user_id) or student

        course_name = course_display_name(student.get("course_id"))
        send(chat_id,
             f"👋 Welcome back, *{student['name']}*!\n\n"
             f"Course: *{course_name}*\n"
             f"Use /learn to start an adaptive activity, or ask me anything about the course.\n"
             f"Type /progress to see your mastery.\n\n"
             f"Educator dashboard: {dashboard_student_url(user_id)}")
        send_action_menu(chat_id)
        SESSIONS[user_id] = {"state": STATES["IDLE"], "data": {}}
        return

    if course_id and not db.course_exists(course_id):
        send(chat_id, "This course invite is no longer valid. Please ask your educator for a new link.")
        return

    selected_course_id = course_id or db.get_active_course_id()
    SESSIONS[user_id] = {
        "state": STATES["WAIT_NAME"],
        "data": {"selected_interests": [], "course_id": selected_course_id},
    }
    send(chat_id,
         "🎓 *Welcome to Micro-Adaptive Learning!*\n\n"
         "I'm your personal AI tutor. I'll send personalised quizzes, "
         "explain concepts, and track your progress.\n\n"
         "Let's get you set up! First — *what's your name?*")


def parse_forced_activity_type(text: str) -> str:
    parts = text.strip().split()
    if len(parts) < 2:
        return ""

    requested = parts[1].lower()
    aliases = {
        "quiz": "quiz",
        "coding": "coding_task",
        "code": "coding_task",
        "coding_task": "coding_task",
        "diagram": "diagram_prompt",
        "diagram_prompt": "diagram_prompt",
    }
    return aliases.get(requested, "unsupported")


def handle_learning_activity(user_id: int, chat_id: int, forced_activity_type: str = "", forced_concept: str = ""):
    """/learn: run the adaptive learning graph and send the chosen activity."""
    student = db.get_student(user_id)
    if not student or not student.get("registered"):
        send(chat_id, "Please send /start to register first 😊")
        return

    if forced_activity_type == "unsupported":
        send(chat_id, "Unsupported test activity. Use /learn quiz, /learn coding, or /learn diagram.")
        return

    # Each activity gets its own thread so state doesn't bleed between sessions
    thread_id = f"{user_id}-activity-{int(time.time())}"
    config = {"configurable": {"thread_id": thread_id}}
    SESSIONS.setdefault(user_id, {})["activity_thread_id"] = thread_id
    SESSIONS[user_id]["state"] = STATES["IDLE"]

    graph_input = {
        "learning_style": student.get("style", "analogy"),
        "interests": student.get("interests", []),
        "course_id": student.get("course_id", "default"),
        "course_concepts": db.get_course_concept_records(student.get("course_id", "default")),
        "mastery": student.get("mastery", {}),
        "conversation_summary": db.get_conversation_summary(user_id),
        "learning_history": db.get_recent_activity_results(user_id),
    }
    if forced_activity_type:
        graph_input["forced_activity_type"] = forced_activity_type
    if forced_concept:
        graph_input["forced_concept"] = forced_concept

    agent.learning_graph.invoke(graph_input, config)
    graph_state = agent.learning_graph.get_state(config)
    values = graph_state.values
    activity_type = values.get("activity_type", "quiz")

    if activity_type == "quiz":
        question = values["quiz_question"]
        rows = [
            [(f"{k}. {v}", f"ans_{k}")]
            for k, v in question["options"].items()
        ]

        send(chat_id,
             f"📝 *Adaptive Activity, {student['name']}!*\n"
             f"Type: *Quiz*\n"
             f"Concept: *{question['concept']}*\n"
             f"{'─' * 32}\n\n"
             f"*{question['question']}*",
             reply_markup=inline_kb(rows))
        return

    interrupts = graph_state.tasks[0].interrupts if graph_state.tasks else []
    activity_prompt = interrupts[0].value if interrupts else "Please submit your response to this activity."
    SESSIONS[user_id]["state"] = STATES["WAIT_ACTIVITY_SUBMISSION"]
    send(chat_id, activity_prompt, parse_mode=None)


def handle_quiz(user_id: int, chat_id: int):
    """/quiz compatibility alias for the adaptive learning activity entry."""
    handle_learning_activity(user_id, chat_id, forced_activity_type="quiz")


def handle_progress(user_id: int, chat_id: int):
    """/progress: show the student's mastery per concept as progress bars."""
    student = db.get_student(user_id)
    if not student or not student.get("registered"):
        send(chat_id, "Please send /start to register first.")
        return

    mastery = db.get_mastery_summary(user_id)
    name = student.get("name", "Student")
    quiz_count = student.get("quiz_count", 0)

    lines = [f"📊 *{name}'s Learning Progress*\n"]
    for concept, score in mastery.items():
        bar = "🟢" if score >= 75 else ("🟡" if score >= 45 else "🔴")
        status = "On Track" if score >= 75 else ("Developing" if score >= 45 else "Needs Work")
        filled = int(score / 10)
        pb = "█" * filled + "░" * (10 - filled)
        lines.append(f"{bar} *{concept}*\n`{pb}` {score}% — {status}")

    lines.append(f"\n📝 Quizzes completed: {quiz_count}")
    lines.append("Keep it up! Use /learn to practice. 🚀")
    send(chat_id, "\n\n".join(lines), reply_markup=action_menu_markup())


def handle_memory(user_id: int, chat_id: int):
    """/memory: show the summary shared by chat and learning activities."""
    student = db.get_student(user_id)
    if not student or not student.get("registered"):
        send(chat_id, "Please send /start to register first.")
        return

    summary = db.get_conversation_summary(user_id)
    if not summary:
        send(chat_id, "I have not saved a shared conversation summary yet.")
        return

    send(chat_id, f"*Shared conversation summary*\n\n{summary}")


def handle_history(user_id: int, chat_id: int):
    """/history: show a compact view of the most recent raw chat transcript."""
    student = db.get_student(user_id)
    if not student or not student.get("registered"):
        send(chat_id, "Please send /start to register first.")
        return

    messages = db.get_recent_conversation_messages(user_id, limit=10)
    if not messages:
        send(chat_id, "No conversation messages have been saved yet.")
        return

    lines = ["Recent conversation history:"]
    for message in messages:
        speaker = "You" if message["role"] == "user" else "Tutor"
        content = message["content"]
        if len(content) > 320:
            content = f"{content[:317]}..."
        lines.append(f"{speaker}: {content}")
    send(chat_id, "\n\n".join(lines), parse_mode=None)


def revise_menu_markup() -> dict:
    return inline_kb([
        [("🎯 My blind spots", "revise_blind")],
        [("❓ My confusions", "revise_confuse")],
        [("📅 Week by week", "revise_timeline")],
        [("✏️ Practice a blind spot", "revise_quiz")],
    ])


def handle_revise(user_id: int, chat_id: int):
    """/revise: the student's own semester, cross-referencing what they picked
    in reflections against what quizzes show they actually know."""
    student = db.get_student(user_id)
    if not student or not student.get("registered"):
        send(chat_id, "Please send /start to register first.")
        return

    course_id = student.get("course_id", db.get_active_course_id())
    typing(chat_id)
    send(chat_id, revision.build_overview(user_id, course_id), reply_markup=revise_menu_markup())


def handle_revise_callback(user_id: int, chat_id: int, msg_id: int, callback_id: str, data: str):
    answer_callback(callback_id)
    student = db.get_student(user_id)
    if not student:
        return
    course_id = student.get("course_id", db.get_active_course_id())

    if data == "revise_quiz":
        spots = revision.rank_blind_spots(user_id, course_id)
        if not spots:
            send(chat_id, "No blind spot to practice yet — try /revise again after a few more weeks.")
            return

        # Repeated taps would otherwise always land on spots[0] — mastery moves
        # in small increments, so one correct answer rarely bumps it out of first
        # place. Work through the ranked list instead, then start over.
        session = SESSIONS.setdefault(user_id, {})
        practiced = session.setdefault("revise_practiced", set())
        target = next((s for s in spots if s["concept"] not in practiced), None)
        if target is None:
            practiced.clear()
            target = spots[0]
        practiced.add(target["concept"])

        edit(chat_id, msg_id, f"Practicing *{target['concept']}* — here's a question:")
        handle_learning_activity(user_id, chat_id, forced_activity_type="quiz", forced_concept=target["concept"])
        return

    builders = {
        "revise_blind": revision.build_blind_spots,
        "revise_confuse": revision.build_confusions,
        "revise_timeline": revision.build_timeline,
    }
    builder = builders.get(data)
    if builder is None:
        return

    typing(chat_id)
    send_long(chat_id, builder(user_id, course_id))


def handle_help(chat_id: int):
    """/help: list all available commands."""
    send(chat_id,
         "🤖 *Micro-Adaptive Bot — Help*\n\n"
         "• /start — Register or welcome\n"
         "• /learn — Start an adaptive learning activity\n"
         "• /quiz — Start a quiz activity\n"
         "• /learn coding — Test a coding task\n"
         "• /learn diagram — Test a diagram task\n"
         "• /progress — View your mastery\n"
         "• /memory — View remembered conversation context\n"
         "• /history — View recent saved conversation messages\n"
         "• /revise — Your semester: blind spots, unresolved confusions, weekly picks\n"
         "• /help — Show this message\n\n"
         "💬 Or just *type any question* about the course!\n\n"
         "_Examples: 'What is gradient descent?' / 'Explain backpropagation'_")


def handle_menu_callback(user_id: int, chat_id: int, msg_id: int,
                         callback_id: str, data: str):
    """Main menu buttons: make common commands discoverable without typing."""
    answer_callback(callback_id)
    if data == "menu_learn":
        handle_learning_activity(user_id, chat_id)
    elif data == "menu_quiz":
        handle_quiz(user_id, chat_id)
    elif data == "menu_coding":
        handle_learning_activity(user_id, chat_id, forced_activity_type="coding_task")
    elif data == "menu_diagram":
        handle_learning_activity(user_id, chat_id, forced_activity_type="diagram_prompt")
    elif data == "menu_progress":
        handle_progress(user_id, chat_id)
    elif data == "menu_memory":
        handle_memory(user_id, chat_id)
    elif data == "menu_history":
        handle_history(user_id, chat_id)
    else:
        edit(chat_id, msg_id, "Unknown menu action. Use /help to see available options.")

def handle_answer_callback(user_id: int, chat_id: int, msg_id: int,
                           callback_id: str, data: str):
    """Quiz answer button: resume the paused graph with the student's choice.
    If the graph pauses again (Socratic), send the hint. If done, show final feedback."""
    answer_callback(callback_id)
    selected = data.replace("ans_", "")

    session = SESSIONS.get(user_id, {})
    thread_id = session.get("activity_thread_id") or session.get("quiz_thread_id")
    if not thread_id:
        edit(chat_id, msg_id, "This activity expired. Send /learn for a new one.")
        return

    config = {"configurable": {"thread_id": thread_id}}

    # Check the graph is actually waiting
    if not agent.learning_graph.get_state(config).next:
        edit(chat_id, msg_id, "This activity expired. Send /learn for a new one.")
        return

    typing(chat_id)
    # Resume graph with MCQ choice
    agent.learning_graph.invoke(Command(resume=selected), config)
    graph_state = agent.learning_graph.get_state(config)

    if graph_state.next:
        # Graph paused again → entered Socratic, get the hint from interrupt
        interrupts = graph_state.tasks[0].interrupts if graph_state.tasks else []
        hint = interrupts[0].value if interrupts else "Let me ask you something to help you think..."
        SESSIONS[user_id]["state"] = STATES["IN_SOCRATIC"]
        # Store the selected choice so we can record it later when Socratic ends
        SESSIONS[user_id]["mcq_selected"] = selected
        edit(chat_id, msg_id,
             f"❌ Not quite! Let me guide you instead.\n\n"
             f"🤔 *{hint}*\n\n"
             f"_Type your answer below ↓_")
    else:
        # Graph finished immediately (MCQ correct) → update mastery
        result = graph_state.values
        is_correct = result.get("is_correct", False)
        question = result.get("quiz_question", {})
        concept = question.get("concept", "")
        messages = result.get("messages", [])
        reply = message_content(messages[-1]) if messages else "Done!"

        mastery_delta = result.get("mastery_delta", 10 if is_correct else 0)
        if concept and mastery_delta:
            db.update_mastery(user_id, concept, mastery_delta, concept_id=result.get("target_concept_id"))
        # Wrong but no Socratic here: shouldn’t happen (wrong always goes to Socratic)
        # If it somehow lands here, don’t update mastery
        db.record_quiz_result(user_id, {
            "q_id": question.get("id"), "concept": concept,
            "selected": selected, "correct": is_correct,
            "activity_type": result.get("activity_type", "quiz"),
            "mastery_delta": mastery_delta,
            "concept_id": result.get("target_concept_id"),
        })
        mastery = db.get_mastery_summary(user_id).get(concept, 0)
        text = reply + f"\n\n📊 *{concept}* mastery: {mastery}%"
        SESSIONS[user_id]["state"] = STATES["IDLE"]
        session.pop("activity_thread_id", None)
        session.pop("quiz_thread_id", None)
        edit(chat_id, msg_id, append_next_steps(text), reply_markup=action_menu_markup())
        refresh_conversation_summary(user_id)


def handle_interest_callback(user_id: int, chat_id: int, msg_id: int,
                              callback_id: str, data: str):
    """Onboarding: toggle interest selections; on "Done", move to style selection."""
    answer_callback(callback_id)
    session = SESSIONS.setdefault(user_id, {"data": {"selected_interests": []}})
    sdata = session.setdefault("data", {"selected_interests": []})

    if data == "int_done":
        interests = sdata.get("selected_interests", [])
        if not interests:
            answer_callback(callback_id, "Please select at least one interest!", show_alert=True)
            return

        # Move to style selection
        session["state"] = STATES["WAIT_STYLE"]
        rows = [[(label, f"style_{key}")] for label, key in STYLE_OPTIONS.items()]
        edit(chat_id, msg_id,
             "Great choices! 🌟\n\n"
             "*How do you prefer to learn?*\n\n"
             "🔍 *Socratic* — I ask questions so you discover the answer\n"
             "🎭 *Analogy-Based* — I explain using stories from your interests\n"
             "📖 *Direct* — Clear, structured explanations",
             reply_markup=inline_kb(rows))
        return

    # Toggle interest
    interest = data.replace("int_", "")
    selected = sdata.setdefault("selected_interests", [])
    if interest in selected:
        selected.remove(interest)
    else:
        selected.append(interest)

    # Rebuild keyboard
    rows = []
    for opt in INTEREST_OPTIONS:
        label = f"✓ {opt}" if opt in selected else opt
        rows.append([(label, f"int_{opt}")])
    rows.append([("✅ Done", "int_done")])
    edit(chat_id, msg_id,
         f"*What are your interests?* (Select all that apply)\n"
         f"The AI uses these to personalise analogies for you.",
         reply_markup=inline_kb(rows))


def handle_style_callback(user_id: int, chat_id: int, msg_id: int,
                           callback_id: str, data: str):
    """Onboarding final step: save the student's profile and finish registration."""
    answer_callback(callback_id)
    session = SESSIONS.get(user_id, {})
    sdata = session.get("data", {})

    style_key = data.replace("style_", "")
    style_label = next((l for l, k in STYLE_OPTIONS.items() if k == style_key), style_key)
    name = sdata.get("name", "Student")
    interests = sdata.get("selected_interests", [])
    interests_str = ", ".join(i.split(" ", 1)[-1] for i in interests) or "General"

    db.save_student(user_id, {
        "name": name,
        "interests": interests,
        "style": style_key,
        "registered": True,
        "joined_at": datetime.now().isoformat(),
        "course_id": sdata.get("course_id", db.get_active_course_id()),
    })

    SESSIONS[user_id] = {"state": STATES["IDLE"], "data": {}}
    course_id = sdata.get("course_id", db.get_active_course_id())
    course_name = course_display_name(course_id)

    edit(chat_id, msg_id,
         f"🎉 *You're all set, {name}!*\n\n"
         f"📌 *Your Profile:*\n"
         f"• Course: {course_name}\n"
         f"• Interests: {interests_str}\n"
         f"• Learning Style: {style_label}\n\n"
         f"Educator dashboard: {dashboard_student_url(user_id)}\n\n"
         f"Here's what you can do:\n"
         f"• /learn — Start an adaptive learning activity\n"
         f"• /quiz — Start a quiz activity\n"
         f"• /progress — View your mastery\n"
         f"• Just *ask me anything* about the course!\n\n"
         f"Let's start learning! 🚀",
         reply_markup=action_menu_markup())


def handle_text(user_id: int, chat_id: int, text: str):
    """Plain text: capture name during onboarding, handle Socratic replies,
    or treat as a free-chat question answered via agent.answer()."""
    session = SESSIONS.get(user_id, {})
    state = session.get("state", STATES["IDLE"])

    # ── Onboarding: waiting for name ──────────────────────────────────────────
    if state == STATES["WAIT_NAME"]:
        name = text.strip()
        if len(name) < 2:
            send(chat_id, "Please enter a valid name (at least 2 characters).")
            return
        SESSIONS[user_id]["data"]["name"] = name

        # Show interest selection
        rows = [[(opt, f"int_{opt}")] for opt in INTEREST_OPTIONS]
        rows.append([("✅ Done", "int_done")])
        send(chat_id,
             f"Nice to meet you, *{name}*! 🎉\n\n"
             f"*What are your interests?* (Select all that apply)\n"
             f"The AI uses these to personalise explanations and analogies for you.",
             reply_markup=inline_kb(rows))
        return

    # ── Weekly reflection: the free-recall answer ────────────────────────────
    if state == STATES["WAIT_REFLECTION_RECALL"]:
        week = session.get("reflection_week")
        SESSIONS[user_id]["state"] = STATES["IDLE"]
        SESSIONS[user_id].pop("reflection_week", None)
        if week is None:
            send(chat_id, "That reflection expired — ask me anything about the course.")
            return
        handle_reflection_recall(user_id, chat_id, week, text)
        return

    # ── Weekly reflection: the optional "what's still unclear" answer ─────────
    if state == STATES["WAIT_REFLECTION_CONFUSION"]:
        week = session.get("reflection_week")
        SESSIONS[user_id]["state"] = STATES["IDLE"]
        SESSIONS[user_id].pop("reflection_week", None)
        if week is None:
            send(chat_id, "That reflection expired, but thanks — ask me anything about the course.")
            return

        course_id = db.get_student_course_id(user_id)
        db.set_reflection_confusion(user_id, course_id, week, text.strip())
        send(chat_id,
             "Got it ✅ This goes to your instructor with the rest of the class's "
             "answers, so they know what to revisit.",
             reply_markup=inline_kb([[("Explain it now", f"reflexplain_{week}_x")]]))
        return

    # ── Open activity submission: coding_task / diagram_prompt ────────────────
    if state == STATES["WAIT_ACTIVITY_SUBMISSION"]:
        thread_id = session.get("activity_thread_id")
        if not thread_id:
            send(chat_id, "Session expired. Use /learn to start a new activity.")
            SESSIONS[user_id]["state"] = STATES["IDLE"]
            return

        typing(chat_id)
        config = {"configurable": {"thread_id": thread_id}}
        agent.learning_graph.invoke(Command(resume=text), config)
        graph_state = agent.learning_graph.get_state(config)

        if graph_state.next:
            interrupts = graph_state.tasks[0].interrupts if graph_state.tasks else []
            prompt = interrupts[0].value if interrupts else "Please continue your response."
            send(chat_id, prompt, parse_mode=None)
            return

        result = graph_state.values
        messages = result.get("messages", [])
        reply = message_content(messages[-1]) if messages else result.get("feedback", "Thanks for your submission.")
        concept = result.get("target_concept", "")
        activity_type = result.get("activity_type", "activity")
        mastery_delta = result.get("mastery_delta", 0)
        is_correct = result.get("is_correct", False)

        if concept and mastery_delta:
            db.update_mastery(user_id, concept, mastery_delta, concept_id=result.get("target_concept_id"))
        db.record_quiz_result(user_id, {
            "q_id": None,
            "concept": concept,
            "selected": text,
            "correct": is_correct,
            "activity_type": activity_type,
            "mastery_delta": mastery_delta,
            "concept_id": result.get("target_concept_id"),
        })

        mastery = db.get_mastery_summary(user_id).get(concept, 0) if concept else 0
        if concept:
            reply += f"\n\n{concept} mastery: {mastery}%"

        send(chat_id, append_next_steps(reply), reply_markup=action_menu_markup(), parse_mode=None)
        refresh_conversation_summary(user_id)
        SESSIONS[user_id]["state"] = STATES["IDLE"]
        session.pop("activity_thread_id", None)
        return

    # ── Socratic reply: resume the paused adaptive learning graph ─────────────
    if state == STATES["IN_SOCRATIC"]:
        thread_id = session.get("activity_thread_id") or session.get("quiz_thread_id")
        if not thread_id:
            send(chat_id, "Session expired. Use /learn to start a new activity.")
            SESSIONS[user_id]["state"] = STATES["IDLE"]
            return

        typing(chat_id)
        config = {"configurable": {"thread_id": thread_id}}
        agent.learning_graph.invoke(Command(resume=text), config)
        graph_state = agent.learning_graph.get_state(config)

        if graph_state.next:
            # Still in Socratic — another interrupt, send next hint
            interrupts = graph_state.tasks[0].interrupts if graph_state.tasks else []
            hint = interrupts[0].value if interrupts else "Let's try a different angle..."
            send(chat_id, f"🤔 *{hint}*\n\n_Type your answer below ↓_")
        else:
            # Socratic ended (understood or 3 rounds exhausted)
            result = graph_state.values
            messages = result.get("messages", [])
            reply = message_content(messages[-1]) if messages else "Great effort!"
            question = result.get("quiz_question", {})
            concept = question.get("concept", "")
            is_correct = result.get("is_correct", False)

            if concept:
                # Socratic success: partial credit (+3, needed help but got there)
                # Socratic failure: small penalty (-5, didn’t understand even with hints)
                delta = +3 if is_correct else -5
                db.update_mastery(user_id, concept, delta, concept_id=result.get("target_concept_id"))
                db.record_quiz_result(user_id, {
                    "q_id": question.get("id"), "concept": concept,
                    "selected": session.get("mcq_selected", ""),
                    "correct": is_correct,
                    "concept_id": result.get("target_concept_id"),
                })
                mastery = db.get_mastery_summary(user_id).get(concept, 0)
                status = "💡 Keep practising!" if not is_correct else "🎉 You got there!"
                reply += f"\n\n{status}\n📊 *{concept}* mastery: {mastery}%"
            send(chat_id, append_next_steps(reply), reply_markup=action_menu_markup())
            refresh_conversation_summary(user_id)
            SESSIONS[user_id]["state"] = STATES["IDLE"]
            session.pop("activity_thread_id", None)
            session.pop("quiz_thread_id", None)
            session.pop("mcq_selected", None)
        return

    # ── Not registered ────────────────────────────────────────────────────────
    student = db.get_student(user_id)
    if not student or not student.get("registered"):
        send(chat_id, "👋 Hi! Please send /start to register first.")
        return

    if is_capability_question(text):
        send_action_menu(chat_id)
        return

    # ── Free chat: concept question ───────────────────────────────────────────
    typing(chat_id)
    conversation_summary = db.get_conversation_summary(user_id)
    recent_messages = db.get_recent_conversation_messages(user_id, limit=10)
    response = agent.answer(text, student, conversation_summary, recent_messages)
    send(chat_id, response)
    refresh_conversation_summary(user_id)


# ═══════════════════════════════════════════════════════════════════════════════
# Polling loop
# ═══════════════════════════════════════════════════════════════════════════════

def process_update(update: dict):
    """Dispatch one Telegram update: route button taps (callback_query) and
    text messages / commands to the matching handler."""
    # Handle callback queries (button taps)
    if "callback_query" in update:
        cq = update["callback_query"]
        user_id = cq["from"]["id"]
        chat_id = cq["message"]["chat"]["id"]
        msg_id  = cq["message"]["message_id"]
        cb_id   = cq["id"]
        data    = cq.get("data", "")
        CHAT_USERS[chat_id] = user_id
        db.record_conversation_message(user_id, "user", f"[Button selection: {data}]")

        if data.startswith("ans_"):
            handle_answer_callback(user_id, chat_id, msg_id, cb_id, data)
        elif data.startswith("int_"):
            handle_interest_callback(user_id, chat_id, msg_id, cb_id, data)
        elif data.startswith("style_"):
            handle_style_callback(user_id, chat_id, msg_id, cb_id, data)
        elif data.startswith("revise_"):
            handle_revise_callback(user_id, chat_id, msg_id, cb_id, data)
        elif data.startswith("reflskip_"):
            handle_reflection_skip(user_id, chat_id, msg_id, cb_id, data)
        elif data.startswith("reflexplain_"):
            handle_reflection_explain(user_id, chat_id, msg_id, cb_id, data)
        elif data.startswith("menu_"):
            handle_menu_callback(user_id, chat_id, msg_id, cb_id, data)
        return

    # Handle regular messages
    if "message" not in update:
        return

    msg = update["message"]
    user_id = msg["from"]["id"]
    chat_id = msg["chat"]["id"]
    first_name = msg["from"].get("first_name", "Student")
    text = msg.get("text", "")

    if not text:
        return

    log.info(f"[{first_name}] {text}")
    CHAT_USERS[chat_id] = user_id
    db.record_conversation_message(user_id, "user", text)

    if text.startswith("/start"):
        parts = text.split(maxsplit=1)
        payload = parts[1].strip() if len(parts) > 1 else ""
        course_id = payload.removeprefix("course_") if payload.startswith("course_") else None
        handle_start(user_id, chat_id, first_name, course_id)
    elif text.startswith("/learn"):
        handle_learning_activity(user_id, chat_id, parse_forced_activity_type(text))
    elif text.startswith("/quiz"):
        handle_quiz(user_id, chat_id)
    elif text.startswith("/progress"):
        handle_progress(user_id, chat_id)
    elif text.startswith("/memory"):
        handle_memory(user_id, chat_id)
    elif text.startswith("/history"):
        handle_history(user_id, chat_id)
    elif text.startswith("/revise"):
        handle_revise(user_id, chat_id)
    elif text.startswith("/help"):
        handle_help(chat_id)
    else:
        handle_text(user_id, chat_id, text)


MAX_REFLECTION_PICKS = reflections.MAX_PICKS


def weekly_reflection_text(course_id: str, week: int) -> str:
    """The prompt students see, as worded by the educator.

    Read per send rather than held in a constant so an edit in the dashboard
    takes effect on the next push without restarting the bot.
    """
    template = db.get_reflection_prompt(course_id)
    try:
        return template.format(week=week, max_picks=MAX_REFLECTION_PICKS)
    except (KeyError, IndexError, ValueError):
        log.warning("Reflection prompt for %s has a bad placeholder; using the default.", course_id)
        return db.DEFAULT_REFLECTION_PROMPT.format(week=week, max_picks=MAX_REFLECTION_PICKS)


def handle_reflection_recall(user_id: int, chat_id: int, week: int, text: str):
    """A student's free-written recall: save it, then show them what they missed.

    The raw text is saved before classification runs, so a slow or failing LLM
    can never cost a student the answer they just typed.
    """
    course_id = db.get_student_course_id(user_id)
    recall = text.strip()

    db.save_reflection_recall(user_id, course_id, week, recall)

    typing(chat_id)
    try:
        matched, unmatched, shaky = reflections.classify_recall(course_id, week, recall)
        db.save_reflection_recall(user_id, course_id, week, recall, matched, unmatched, shaky)
    except Exception:
        # The answer is already saved; losing the analysis is a far smaller cost
        # than leaving the student staring at silence after writing.
        log.exception("Could not classify recall for user %s week %s", user_id, week)
        matched = []

    lines = [f"✅ Saved for week {week}."]
    if matched:
        lines.append(f"You covered: *{', '.join(matched)}*")

    # No "you also missed X" line: it only means something when the week's concept
    # list is trustworthy, and today a syllabus PDF can yield a whole semester's
    # topics. The classification still runs — the educator's coverage view needs
    # it — but the student isn't shown a gap derived from it.
    send(chat_id, "\n\n".join(lines))

    SESSIONS.setdefault(user_id, {"data": {}})
    SESSIONS[user_id]["state"] = STATES["WAIT_REFLECTION_CONFUSION"]
    SESSIONS[user_id]["reflection_week"] = week
    try:
        question = reflections.followup_question(recall, matched)
    except Exception:
        log.exception("Follow-up generation failed for user %s", user_id)
        question = reflections.DEFAULT_FOLLOWUP

    send(chat_id, question, reply_markup=inline_kb([[("Skip", f"reflskip_{week}_x")]]))


def handle_reflection_skip(user_id: int, chat_id: int, msg_id: int, callback_id: str, data: str):
    answer_callback(callback_id)
    SESSIONS.setdefault(user_id, {})["state"] = STATES["IDLE"]
    SESSIONS[user_id].pop("reflection_week", None)
    edit(chat_id, msg_id, "No problem — thanks for reflecting this week! 🙌")


def handle_reflection_explain(user_id: int, chat_id: int, msg_id: int, callback_id: str, data: str):
    """Optional on-demand explanation, kept behind a tap so the bot doesn't
    pre-empt the instructor addressing the confusion in class."""
    answer_callback(callback_id)
    week = int(data.split("_")[1])
    course_id = db.get_student_course_id(user_id)
    confusion = (db.get_reflection(user_id, course_id, week) or {}).get("confusion")
    if not confusion:
        edit(chat_id, msg_id, "Nothing to explain yet.")
        return

    typing(chat_id)
    student = db.get_student(user_id) or {}
    response = agent.answer(confusion, student, db.get_conversation_summary(user_id), [])
    send(chat_id, response)


# Telegram throttles bulk sends at roughly 30 messages/second; stay under it.
PUSH_RATE_PER_SECOND = 20
_push_thread: threading.Thread | None = None


def _broadcast_weekly_push(week: int, scheduled):
    """Fan the weekly prompt out to every student. Runs off the polling thread."""
    course_id = db.get_active_course_id()
    concepts = reflections.week_concepts(course_id, week)
    if not concepts:
        # Recorded rather than just logged so the educator sees why nothing went
        # out — a silently skipped week is indistinguishable from a broken bot.
        db.set_skipped_push_week(course_id, week)
        log.warning("Week %s push skipped: no materials tagged for that week.", week)
        return
    db.clear_skipped_push_week(course_id)

    text = weekly_reflection_text(course_id, week)
    students = db.list_students()
    sent = 0

    for user_id, _student in students:
        try:
            # In private chats chat_id == user_id. Seed CHAT_USERS so send() can
            # log the message — on a cold start nothing has populated it yet.
            CHAT_USERS.setdefault(user_id, user_id)
            response = send(user_id, text)
            # The next thing they type is their recall, not a free-chat question.
            SESSIONS.setdefault(user_id, {"data": {}})
            SESSIONS[user_id]["state"] = STATES["WAIT_REFLECTION_RECALL"]
            SESSIONS[user_id]["reflection_week"] = week
            if response.get("ok"):
                sent += 1
            else:
                log.warning("Weekly push to %s failed: %s", user_id, response.get("description"))
        except Exception as e:
            log.error(f"Weekly push to {user_id} failed: {e}", exc_info=True)
        time.sleep(1 / PUSH_RATE_PER_SECOND)

    log.info("📤 Week %s reflection (%s) sent to %s/%s student(s).",
             week, scheduled, sent, len(students))


def _broadcast_weekly_digest(week: int, slot):
    course_id = db.get_active_course_id()
    text = reflections.build_digest_text(course_id, week)
    if text is None:
        # Give the slot back — nothing was sent, so a later reply should still
        # be able to produce this week's digest.
        db.clear_last_digest_slot(course_id)
        log.info("Week %s digest skipped: no reflections came in yet.", week)
        return

    sent = 0
    for user_id, _student in db.list_students():
        try:
            CHAT_USERS.setdefault(user_id, user_id)
            if send(user_id, text).get("ok"):
                sent += 1
        except Exception as e:
            log.error(f"Digest to {user_id} failed: {e}", exc_info=True)
        time.sleep(1 / PUSH_RATE_PER_SECOND)

    log.info("📊 Week %s digest sent to %s student(s).", week, sent)


def maybe_run_weekly_digest():
    """Send the class digest a fixed delay after the weekly push."""
    global _push_thread

    if _push_thread and _push_thread.is_alive():
        return

    course_id = db.get_active_course_id()
    due = db.due_digest(course_id)
    if due is None:
        return

    week, slot = due
    # Claim before sending, same as the push: the next tick arrives mid-broadcast.
    db.set_last_digest_slot(course_id, slot)

    _push_thread = threading.Thread(
        target=_broadcast_weekly_digest, args=(week, slot), name="weekly-digest", daemon=True,
    )
    _push_thread.start()


def maybe_run_weekly_push():
    """Start this week's reflection push once, if it's due.

    Called on every polling tick (~30s). db.due_push() keeps a slot from being
    sent twice; the send itself runs on a worker thread so a large class doesn't
    stall message handling for everyone else.
    """
    global _push_thread

    if _push_thread and _push_thread.is_alive():
        return

    course_id = db.get_active_course_id()
    due = db.due_push(course_id)
    if due is None:
        return

    week, scheduled = due
    # Claim the slot before sending: the next tick may arrive while the
    # broadcast is still running, and must not start a second one.
    db.set_last_pushed_slot(course_id, scheduled, week)

    _push_thread = threading.Thread(
        target=_broadcast_weekly_push,
        args=(week, scheduled),
        name="weekly-push",
        daemon=True,
    )
    _push_thread.start()


SCHEDULER_INTERVAL_SECONDS = 10


def run_scheduler():
    """Watch for due pushes on their own clock.

    Kept off the polling loop because getUpdates blocks for up to 30s: a manual
    "send now" would otherwise wait for that long poll to return.
    """
    while True:
        try:
            maybe_run_weekly_push()
            maybe_run_weekly_digest()
        except Exception as e:
            # A scheduling bug must never take down message handling.
            log.error(f"Scheduled push check failed: {e}", exc_info=True)
        time.sleep(SCHEDULER_INTERVAL_SECONDS)


def main():
    """Long-polling loop: repeatedly ask Telegram for new updates and process them."""
    log.info("🤖 Micro-Adaptive Bot starting (long polling)...")
    offset = 0

    threading.Thread(target=run_scheduler, name="scheduler", daemon=True).start()
    log.info("⏰ Scheduler running (checks every %ss).", SCHEDULER_INTERVAL_SECONDS)

    while True:
        #TODO: consider switching to webhook mode for production (faster, more reliable)
        try:
            resp = TELEGRAM_SESSION.get(
                f"{BASE}/getUpdates",
                params={"offset": offset, "timeout": 30, "allowed_updates": ["message", "callback_query"]},
                timeout=35,
            )
            updates = resp.json().get("result", [])

            for update in updates:
                try:
                    process_update(update)
                except Exception as e:
                    log.error(f"Error processing update: {e}", exc_info=True)
                offset = update["update_id"] + 1

        except requests.exceptions.Timeout:
            continue
        except KeyboardInterrupt:
            log.info("Bot stopped.")
            break
        except Exception as e:
            log.error(f"Polling error: {e}", exc_info=True)
            time.sleep(3)


if __name__ == "__main__":
    main()
