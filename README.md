# Micro-Adaptive

Micro-Adaptive is an agentic learning prototype for course-based adaptive tutoring.
Educators upload course materials through a web dashboard, and students interact
with an AI tutor through Telegram. The tutor uses RAG, student memory, mastery
tracking, and LangGraph activity orchestration to generate adaptive quizzes,
coding/design tasks, diagram prompts, and feedback.

## Project Structure

```text
.
├── src/
│   ├── agent.py              # LangGraph workflow and routing nodes
│   ├── skills.py             # Reusable tutoring skill functions
│   ├── bot.py                # Telegram student bot
│   ├── api.py                # FastAPI backend for dashboard and uploads
│   ├── course_rag.py         # Course material loading, chunking, Chroma retrieval
│   ├── database.py           # SQLite storage for students, mastery, history, memory
│   └── requirements.txt      # Python dependencies
├── educator-dashboard/       # Next.js educator dashboard
├── course_materials/         # Uploaded course files grouped by course_id
├── chroma_db/                # Persisted Chroma vector store
├── micro_adaptive.db         # Local SQLite database
└── langgraph.json            # LangGraph dev configuration
```

## Requirements

- Python 3.10+
- Node.js 18+
- OpenAI API key
- Telegram bot token, only needed for the Telegram bot

## Environment Setup

Create `src/.env`:

```env
OPENAI_API_KEY=your_openai_api_key
BOT_TOKEN=your_telegram_bot_token
```

`BOT_TOKEN` is only required when running `src/bot.py`.

## Python Setup

From the project root:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r src/requirements.txt
```

The project uses `langchain-chroma` as the only Chroma integration. If it is
missing, activate the project environment and reinstall the requirements:

```bash
source .venv/bin/activate
python -m pip install -r src/requirements.txt
```

## Start The FastAPI Backend

Run from the project root:

```bash
source .venv/bin/activate
PYTHONPATH=src uvicorn src.api:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Main API endpoints:

```text
GET  /health
GET  /materials
POST /materials/upload
GET  /course/concepts
POST /course/concepts/suggestions
POST /course/concepts
GET  /students
GET  /dashboard/summary
GET  /teaching-intention
PUT  /teaching-intention
```

## Start The Educator Dashboard

In a second terminal:

```bash
cd educator-dashboard
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

The dashboard calls the backend at:

```text
http://127.0.0.1:8000
```

To override it, create `educator-dashboard/.env.local`:

```env
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
```

## Upload Course Materials

Supported file types:

```text
.txt
.pdf
```

Upload through the dashboard:

```text
http://localhost:3000/dashboard/materials
```

Or test with curl:

```bash
curl -F "file=@course_materials/sample_ml.txt" http://127.0.0.1:8000/materials/upload
```

Upload flow:

```text
file upload
→ save into course_materials/<course_id>/
→ split into chunks
→ create embeddings
→ add chunks to chroma_db/ with course_id metadata
→ RAG retrieves only the active/student course material
```

## Confirm Course Concepts

After uploading materials, open the setup flow at `/setup/concepts`. The
`Generate suggestions` button asks the LLM for 5-12 high-level concepts from
the uploaded material and learning objectives. Suggestions are not saved
automatically: the educator can rename, remove, merge, or add concepts before
selecting `Save concepts`.

Only this confirmed list is stored as the course concept map. It is used to
choose a new student's first learning activity and to identify concepts in the
teaching-intention dashboard. Uploading another file does not overwrite it.

## Start The Telegram Bot

In another terminal:

```bash
source .venv/bin/activate
PYTHONPATH=src python src/bot.py
```

In Telegram:

```text
/start
/help
/learn
/progress
/memory
/history
```

Students can also ask natural-language questions such as:

```text
What can I do?
How do I start?
Explain this course topic.
```

## LangGraph Agent

The current learning graph is:

```text
select_concept
→ retrieve_course_context
→ choose_activity
→ generate_activity
→ evaluate_response
→ message_feedback / socratic_followup
```

`agent.py` handles graph orchestration. `skills.py` contains reusable skill
functions:

```text
generate_quiz_skill
generate_coding_task_skill
generate_diagram_prompt_skill
evaluate_open_activity_skill
```

To run the local debug script:

```bash
source .venv/bin/activate
PYTHONPATH=src python src/agent.py
```

## Memory And Data

The local SQLite database is:

```text
micro_adaptive.db
```

It stores:

```text
courses and active course
course materials
students
mastery
activity results
recent conversation messages
shared conversation summary
```

Free chat uses:

```text
conversation summary + recent messages + current question + RAG context
```

Activity selection uses:

```text
conversation summary + mastery + recent learning history + RAG context
```

Student registration is persisted in SQLite. The onboarding flow stores the
student name, selected interests, learning style, registration status, join time,
and the course_id active at registration time.

## Common Issues

`ModuleNotFoundError: No module named 'langchain_chroma'`

```bash
source .venv/bin/activate
python -m pip install -r src/requirements.txt
```

`Failed to fetch` in the dashboard

Make sure the FastAPI backend is running:

```bash
PYTHONPATH=src uvicorn src.api:app --reload --host 127.0.0.1 --port 8000
```

`BOT_TOKEN not set in .env`

Add `BOT_TOKEN` to `src/.env`, or only run the FastAPI/dashboard parts.

No RAG answer after upload

Check that:

```text
1. The file type is .txt or .pdf
2. OPENAI_API_KEY is set
3. The upload endpoint returned status: uploaded
4. chroma_db/ exists after upload
```
