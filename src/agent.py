"""
agent.py — LangGraph tutoring agent
note: does not generate questions, only answers them based on student input, questions are from quiz_data.py
"""
import random
from langchain_openai import ChatOpenAI
from langgraph.graph import MessagesState
from langgraph.graph import StateGraph, START, END
from typing import Literal
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt, Command
import os
import quiz_data
import course_rag

System_prompt = """
You are a helpful and knowledgeable tutor for course subject from context provided.
You will be provided with a student's question and their learning style (e.g., "analogy", "step-by-step", "visual"). 
Your task is to generate a clear, concise, and engaging response that aligns with the student's learning style. 
If the answer is found in the provided course materials, answer directly based on them.
Your response should be informative, accurate, and tailored to the student's learning style. 
Restrict the content to course related topics
Keep your responses under 200 words.

example:
Student: "Can you explain gradient descent?"
Learning Style: "analogy"
Tutor: "Sure! Imagine you're hiking down a hill in the fog. 
You can't see very far ahead, so you take small steps in the direction that seems to go downhill.
In machine learning , gradient descent works similarly. It helps us find the lowest point (minimum) 
of a function by taking small steps in the direction of the steepest slope (the gradient).
 The learning rate controls how big those steps are. Too big, and you might overshoot the minimum; too small, 
and it takes forever to get there. So, it's like adjusting your step size while hiking to ensure you reach the bottom efficiently."
"""

llm = ChatOpenAI(temperature=0, openai_api_key=os.getenv("OPENAI_API_KEY"))  

#  ----quiz graph: ask a question, check answer, explain if wrong, message if correct ----
# free chat function to answer student questions based on their learning style 
# TODO: may need to add to graph or memory to keep track of previous questions and answers for context
def answer(question: str, student: dict) -> str:
    """
    Free-chat: answer a student's question using GPT, personalised by their learning style.
    """
    from langchain_core.messages import SystemMessage, HumanMessage
    style = student.get("style", "analogy")
    interests = ", ".join(student.get("interests", [])) or "general topics"
  
    context = course_rag.query_rag(question)
    if not context.strip():
        context = "No relevant course materials found for this question."
    messages = [
        SystemMessage(content=System_prompt),
        HumanMessage(content=(
            f"Student question: \"{question}\"\n"
            f"Learning style: {style}\n"
            f"Student interests: {interests}\n"
            f"Context from course materials:\n{context}\n"
        ))
    ]
    response = llm.invoke(messages)
    return response.content

# state type for the graph 
class State(MessagesState):
    # Only learning_style is required as input; other fields are set by nodes
    learning_style: str                  # required: "analogy" / "socratic" / "direct"
    quiz_question: dict = {}             # set by ask_question node
    choice: str = ""                     # set by check_answer node (via interrupt)
    is_correct: bool = False             # set by check_answer / socratic_followup
    socratic_round: int = 0             # incremented by socratic_followup

# ── Graph nodes ───────────────────────────────────────────────────────────────

def ask_question(state: State) -> dict:
    question = random.choice(quiz_data.get_all_questions())
    return {"quiz_question": question}

def check_answer(state: State) -> dict:
    choice = interrupt("waiting for student's answer choice (A/B/C/D)")
    correct = choice == state["quiz_question"]["answer"]
    return {"is_correct": correct}

# routing function: MCQ 答对 → message_student，答错 → 进入 Socratic
def route_answer_correctness(state: State) -> Literal["socratic_followup", "message_student"]:
    if state["is_correct"]:
        return "message_student"
    else:
        return "socratic_followup"


def explain_answer(state: State) -> dict:
    """
    Last resort after 3 failed Socratic rounds: directly explain the correct answer.
    """
    q = state["quiz_question"]
    style = state["learning_style"]
    prompt = (
        f"The student struggled with this concept after multiple hints.\n"
        f"Concept: {q['concept']}\n"
        f"Now give a clear, direct explanation of the correct answer.\n"
        f"Correct answer: {q['explanation_correct']}\n"
        f"Tailor the explanation to learning style: {style}. Keep it under 150 words."
    )
    reply = llm.invoke(prompt).content
    return {"messages": [{"role": "assistant", "content": reply}]}

def socratic_followup(state: State) -> dict:
    """
    单一 node 完成 Socratic 一轮：
    1. 根据对话历史生成引导问题（不给答案）
    2. interrupt() 挂起，等学生用自然语言回复
    3. GPT 语义评估：学生理解了吗？
    返回更新后的 messages, is_correct, socratic_round
    """
    q = state["quiz_question"]
    style = state["learning_style"]
    history = state.get("messages", [])
    round_num = state.get("socratic_round", 0)

    # Step 1: 生成引导问题
    hint = llm.invoke(
        f"You are a Socratic tutor. The student answered a quiz question incorrectly.\n"
        f"Concept: {q['concept']}\n"
        f"Conversation so far: {history}\n"
        f"Give ONE short guiding question to help the student discover the answer themselves. "
        f"Do NOT reveal the answer. Learning style: {style}"
    ).content

    # Step 2: 挂起等学生回复（hint 作为 interrupt 的提示信息显示给 bot）
    student_reply = interrupt(hint)

    # Step 3: 语义评估
    understood = "true" in llm.invoke(
        f"Concept: {q['concept']}\n"
        f"Correct answer key point: {q['explanation_correct']}\n"
        f"Student replied: {student_reply}\n"
        f"A reply with ONLY an emoji, symbol, or 'yes/ok' does NOT count as understanding."
        f"Does this reply show conceptual understanding? Answer only: true or false"
    ).content.lower()

    return {
        "messages": [
            {"role": "assistant", "content": hint},
            {"role": "user", "content": student_reply},
        ],
        "is_correct": understood,
        "socratic_round": round_num + 1,   # +1 在 node 里做，checkpointer 会保存
    }


# routing function: 根据理解情况和轮次决定下一步
def route_socratic_attempt(state: State) -> Literal["socratic_followup", "explain_answer", "message_student"]:
    if state["is_correct"]:
        return "message_student"                     # 学生理解了，结束
    elif state.get("socratic_round", 0) >= 3:
        return "explain_answer"                      # 3轮仍未理解，直接讲解
    else:
        return "socratic_followup"                   # 继续追问


def message_student(state: State) -> dict:
    """
    answer correct and explain the correct answer to the student based on their learning style."""
    q = state["quiz_question"]
    reply = q["explanation_correct"]
    return {"messages": [{"role": "assistant", "content": reply}]}


# ── Build graph ────────────────────────────────────────────────────────────────
builder = StateGraph(State)
builder.add_node("ask_question", ask_question)
builder.add_node("check_answer", check_answer)
builder.add_node("explain_answer", explain_answer)
builder.add_node("message_student", message_student)
builder.add_node("socratic_followup", socratic_followup)   # 合并后的单一 Socratic node

# ── Edges ─────────────────────────────────────────────────────────────────────
builder.add_edge(START, "ask_question")
builder.add_edge("ask_question", "check_answer")
# MCQ 判断后路由
builder.add_conditional_edges("check_answer", route_answer_correctness)
# Socratic 一轮后路由（可自循环）
builder.add_conditional_edges("socratic_followup", route_socratic_attempt)
builder.add_edge("explain_answer", END)
builder.add_edge("message_student", END)
if os.environ.get("LANGGRAPH_API_URL"):
    # langgraph dev / API mode: use graph as API
    quiz_graph = builder.compile()
else:
    # python bot.py / python agent.py : add memory checkpointer (as a library by bot.py)
    quiz_graph = builder.compile(checkpointer=MemorySaver())


# debugging: run the graph with a sample input
if __name__ == "__main__":
    config = {"configurable": {"thread_id": "test-1"}}

    # Step 1: start the graph — it picks a question and pauses at interrupt().
    quiz_graph.invoke({"learning_style": "analogy"}, config)
    state = quiz_graph.get_state(config)
    q = state.values["quiz_question"]
    print(f"\n📝 Question: {q['question']}")
    print(f"   Options: {q['options']}")
    print(f"   Answer:  {q['answer']}")

    # Step 2: simulate the student answering wrong ("A") — resume from the interrupt.
    print("\n▶ Student answers: A (intentionally wrong)")
    quiz_graph.invoke(Command(resume="A"), config)
    state = quiz_graph.get_state(config)

    if state.next:
        # Graph paused again → Socratic interrupt, get the hint
        interrupts = state.tasks[0].interrupts if state.tasks else []
        hint = interrupts[0].value if interrupts else "(no hint)"
        print(f"\n🤔 Socratic hint: {hint}")

        # Step 3: simulate a student reply with real understanding
        student_reply = "The model memorises the training data so it does well there but fails on new data."
        print(f"\n▶ Student replies: {student_reply}")
        result = quiz_graph.invoke(Command(resume=student_reply), config)
        end_state = quiz_graph.get_state(config)

        if end_state.next:
            # Still in Socratic (another round)
            hints2 = end_state.tasks[0].interrupts if end_state.tasks else []
            print(f"\n🤔 Round 2 hint: {hints2[0].value if hints2 else '(none)'}")
        else:
            # Graph finished
            messages = end_state.values.get("messages", [])
            if messages:
                print(f"\n✅ Final message: {messages[-1].content}")
            print(f"   is_correct: {end_state.values.get('is_correct')}")
            print(f"   socratic_round: {end_state.values.get('socratic_round')}")
    else:
        # Graph finished immediately (correct answer)
        messages = state.values.get("messages", [])
        if messages:
            print(f"\n✅ Correct! {messages[-1].content}")
        print(f"   is_correct: {state.values.get('is_correct')}")



