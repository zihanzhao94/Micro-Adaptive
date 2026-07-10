"""
bot.py — Micro-Adaptive Telegram Bot (Student Side)
====================================================
Uses raw Telegram Bot API via requests (no library dependency issues).
Compatible with Python 3.10+.

Flows:
  /start    → Onboarding (name, interests, learning style)
  /quiz     → Send a quiz question with inline buttons
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

import requests
from dotenv import load_dotenv

# import database as db        # SQLite layer (same interface as the old mock_db)
import mock_db as db  # In-memory mock database (for testing)      
import quiz_data
import agent
from langgraph.types import Command

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv()
# db.init_db()
TOKEN = os.getenv("BOT_TOKEN", "")
if not TOKEN:
    raise SystemExit("BOT_TOKEN not set in .env")

BASE = f"https://api.telegram.org/bot{TOKEN}"

logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(message)s",
    level=logging.INFO,
)
log = logging.getLogger(__name__)

# ── Conversation state (in-memory) ────────────────────────────────────────────
# user_id → {"state": str, "data": dict}
SESSIONS: dict = {}

STATES = {
    "IDLE":        "idle",
    "WAIT_NAME":   "wait_name",
    "WAIT_STYLE":  "wait_style",
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


# ═══════════════════════════════════════════════════════════════════════════════
# Telegram API helpers
# ═══════════════════════════════════════════════════════════════════════════════

def api(method: str, **kwargs) -> dict:
    r = requests.post(f"{BASE}/{method}", json=kwargs, timeout=10)
    return r.json()


def send(chat_id: int, text: str, reply_markup=None, parse_mode="Markdown"):
    payload = {"chat_id": chat_id, "text": text, "parse_mode": parse_mode}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    return api("sendMessage", **payload)


def edit(chat_id: int, msg_id: int, text: str, reply_markup=None, parse_mode="Markdown"):
    payload = {"chat_id": chat_id, "message_id": msg_id, "text": text, "parse_mode": parse_mode}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    return api("editMessageText", **payload)


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


# ═══════════════════════════════════════════════════════════════════════════════
# Handlers
# ═══════════════════════════════════════════════════════════════════════════════

def handle_start(user_id: int, chat_id: int, first_name: str):
    """/start: welcome returning users; start onboarding (ask name) for new ones."""
    student = db.get_student(user_id)
    if student and student.get("registered"):
        send(chat_id,
             f"👋 Welcome back, *{student['name']}*!\n\n"
             f"Use /quiz to practice, or ask me anything about the course.\n"
             f"Type /progress to see your mastery.")
        SESSIONS[user_id] = {"state": STATES["IDLE"], "data": {}}
        return

    SESSIONS[user_id] = {"state": STATES["WAIT_NAME"], "data": {"selected_interests": []}}
    send(chat_id,
         "🎓 *Welcome to Micro-Adaptive Learning!*\n\n"
         "I'm your personal AI tutor. I'll send personalised quizzes, "
         "explain concepts, and track your progress.\n\n"
         "Let's get you set up! First — *what's your name?*")


def handle_quiz(user_id: int, chat_id: int):
    """/quiz: run the quiz graph (it picks a question and pauses at interrupt),
    then send the question with answer buttons to the student."""
    student = db.get_student(user_id)
    if not student or not student.get("registered"):
        send(chat_id, "Please send /start to register first 😊")
        return

    # Each quiz gets its own thread so state doesn't bleed between sessions
    thread_id = f"{user_id}-quiz-{int(time.time())}"
    config = {"configurable": {"thread_id": thread_id}}
    SESSIONS.setdefault(user_id, {})["quiz_thread_id"] = thread_id
    SESSIONS[user_id]["state"] = STATES["IDLE"]

    agent.quiz_graph.invoke({"learning_style": student.get("style", "analogy")}, config)
    question = agent.quiz_graph.get_state(config).values["quiz_question"]

    rows = [
        [(f"{k}. {v}", f"ans_{k}")]
        for k, v in question["options"].items()
    ]

    send(chat_id,
         f"📝 *Quiz Time, {student['name']}!*\n"
         f"Concept: *{question['concept']}*\n"
         f"{'─' * 32}\n\n"
         f"*{question['question']}*",
         reply_markup=inline_kb(rows))


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
    lines.append("Keep it up! Use /quiz to practice. 🚀")
    send(chat_id, "\n\n".join(lines))


def handle_help(chat_id: int):
    """/help: list all available commands."""
    send(chat_id,
         "🤖 *Micro-Adaptive Bot — Help*\n\n"
         "• /start — Register or welcome\n"
         "• /quiz — Take a quiz question\n"
         "• /progress — View your mastery\n"
         "• /help — Show this message\n\n"
         "💬 Or just *type any question* about the course!\n\n"
         "_Examples: 'What is gradient descent?' / 'Explain backpropagation'_")

def handle_answer_callback(user_id: int, chat_id: int, msg_id: int,
                           callback_id: str, data: str):
    """Quiz answer button: resume the paused graph with the student's choice.
    If the graph pauses again (Socratic), send the hint. If done, show final feedback."""
    answer_callback(callback_id)
    selected = data.replace("ans_", "")

    session = SESSIONS.get(user_id, {})
    thread_id = session.get("quiz_thread_id")
    if not thread_id:
        edit(chat_id, msg_id, "This quiz expired. Send /quiz for a new one.")
        return

    config = {"configurable": {"thread_id": thread_id}}

    # Check the graph is actually waiting
    if not agent.quiz_graph.get_state(config).next:
        edit(chat_id, msg_id, "This quiz expired. Send /quiz for a new one.")
        return

    typing(chat_id)
    # Resume graph with MCQ choice
    agent.quiz_graph.invoke(Command(resume=selected), config)
    graph_state = agent.quiz_graph.get_state(config)

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
        reply = messages[-1].content if messages else "Done!"

        if is_correct:
            db.update_mastery(user_id, concept, +10)   # answered correctly first try
        # Wrong but no Socratic here: shouldn’t happen (wrong always goes to Socratic)
        # If it somehow lands here, don’t update mastery
        db.record_quiz_result(user_id, {
            "q_id": question.get("id"), "concept": concept,
            "selected": selected, "correct": is_correct,
        })
        mastery = db.get_mastery_summary(user_id).get(concept, 0)
        text = reply + f"\n\n📊 *{concept}* mastery: {mastery}%"
        SESSIONS[user_id]["state"] = STATES["IDLE"]
        edit(chat_id, msg_id, text)


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
    })

    SESSIONS[user_id] = {"state": STATES["IDLE"], "data": {}}

    edit(chat_id, msg_id,
         f"🎉 *You're all set, {name}!*\n\n"
         f"📌 *Your Profile:*\n"
         f"• Interests: {interests_str}\n"
         f"• Learning Style: {style_label}\n\n"
         f"Here's what you can do:\n"
         f"• /quiz — Take today's quiz\n"
         f"• /progress — View your mastery\n"
         f"• Just *ask me anything* about the course!\n\n"
         f"Let's start learning! 🚀")


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

    # ── Socratic reply: resume the paused quiz graph ───────────────────────────
    if state == STATES["IN_SOCRATIC"]:
        thread_id = session.get("quiz_thread_id")
        if not thread_id:
            send(chat_id, "Session expired. Use /quiz to start a new quiz.")
            SESSIONS[user_id]["state"] = STATES["IDLE"]
            return

        typing(chat_id)
        config = {"configurable": {"thread_id": thread_id}}
        agent.quiz_graph.invoke(Command(resume=text), config)
        graph_state = agent.quiz_graph.get_state(config)

        if graph_state.next:
            # Still in Socratic — another interrupt, send next hint
            interrupts = graph_state.tasks[0].interrupts if graph_state.tasks else []
            hint = interrupts[0].value if interrupts else "Let's try a different angle..."
            send(chat_id, f"🤔 *{hint}*\n\n_Type your answer below ↓_")
        else:
            # Socratic ended (understood or 3 rounds exhausted)
            result = graph_state.values
            messages = result.get("messages", [])
            reply = messages[-1].content if messages else "Great effort!"
            question = result.get("quiz_question", {})
            concept = question.get("concept", "")
            is_correct = result.get("is_correct", False)

            if concept:
                # Socratic success: partial credit (+3, needed help but got there)
                # Socratic failure: small penalty (-5, didn’t understand even with hints)
                delta = +3 if is_correct else -5
                db.update_mastery(user_id, concept, delta)
                db.record_quiz_result(user_id, {
                    "q_id": question.get("id"), "concept": concept,
                    "selected": session.get("mcq_selected", ""),
                    "correct": is_correct,
                })
                mastery = db.get_mastery_summary(user_id).get(concept, 0)
                status = "💡 Keep practising!" if not is_correct else "🎉 You got there!"
                reply += f"\n\n{status}\n📊 *{concept}* mastery: {mastery}%"
            send(chat_id, reply)
            SESSIONS[user_id]["state"] = STATES["IDLE"]
            session.pop("quiz_thread_id", None)
            session.pop("mcq_selected", None)
        return

    # ── Not registered ────────────────────────────────────────────────────────
    student = db.get_student(user_id)
    if not student or not student.get("registered"):
        send(chat_id, "👋 Hi! Please send /start to register first.")
        return

    # ── Free chat: concept question ───────────────────────────────────────────
    typing(chat_id)
    style = student.get("style", "analogy")
    response = agent.answer(text, student)
    send(chat_id, response)


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

        if data.startswith("ans_"):
            handle_answer_callback(user_id, chat_id, msg_id, cb_id, data)
        elif data.startswith("int_"):
            handle_interest_callback(user_id, chat_id, msg_id, cb_id, data)
        elif data.startswith("style_"):
            handle_style_callback(user_id, chat_id, msg_id, cb_id, data)
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

    if text.startswith("/start"):
        handle_start(user_id, chat_id, first_name)
    elif text.startswith("/quiz"):
        handle_quiz(user_id, chat_id)
    elif text.startswith("/progress"):
        handle_progress(user_id, chat_id)
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
            resp = requests.get(
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
