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
import time
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

import database as db
import agent
from langgraph.types import Command

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).resolve().parent / ".env")
db.init_db()
TOKEN = os.getenv("BOT_TOKEN", "")
if not TOKEN:
    raise SystemExit("BOT_TOKEN not set in .env")

BASE = f"https://api.telegram.org/bot{TOKEN}"

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
        [("Take a quiz", "menu_quiz"), ("View progress", "menu_progress")],
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
        send(chat_id,
             f"👋 Welcome back, *{student['name']}*!\n\n"
             f"Use /learn to start an adaptive activity, or ask me anything about the course.\n"
             f"Type /progress to see your mastery.")
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


def handle_learning_activity(user_id: int, chat_id: int, forced_activity_type: str = ""):
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


def handle_help(chat_id: int):
    """/help: list all available commands."""
    send(chat_id,
         "🤖 *Micro-Adaptive Bot — Help*\n\n"
         "• /start — Register or welcome\n"
         "• /learn — Start an adaptive learning activity\n"
         "• /quiz — Start a quiz activity\n"
         "• /progress — View your mastery\n"
         "• /memory — View remembered conversation context\n"
         "• /history — View recent saved conversation messages\n"
         "• /help — Show this message\n\n"
         "💬 Or just *type any question* about the course!\n\n"
         "_Examples: 'What is gradient descent?' / 'Explain backpropagation'_",
         reply_markup=action_menu_markup())


def handle_menu_callback(user_id: int, chat_id: int, msg_id: int,
                         callback_id: str, data: str):
    """Main menu buttons: make common commands discoverable without typing."""
    answer_callback(callback_id)
    if data == "menu_learn":
        handle_learning_activity(user_id, chat_id)
    elif data == "menu_quiz":
        handle_quiz(user_id, chat_id)
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

    edit(chat_id, msg_id,
         f"🎉 *You're all set, {name}!*\n\n"
         f"📌 *Your Profile:*\n"
         f"• Interests: {interests_str}\n"
         f"• Learning Style: {style_label}\n\n"
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
    elif text.startswith("/help"):
        handle_help(chat_id)
    else:
        handle_text(user_id, chat_id, text)


def main():
    """Long-polling loop: repeatedly ask Telegram for new updates and process them."""
    log.info("🤖 Micro-Adaptive Bot starting (long polling)...")
    offset = 0

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
