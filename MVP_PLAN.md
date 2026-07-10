# Micro-Adaptive Learning System — MVP Plan

## 当前状态（已完成）

Telegram bot 基础框架已就绪，包含：
- `/start` 注册流程（name → interests → learning style）
- `/quiz` 随机 MCQ + inline button 答题
- `/progress` 显示各概念掌握度
- 自由文本回复（mock_responses，固定文案）
- 内存存储（mock_db）+ 硬编码题库（quiz_data）

---

## MVP 目标

**一个能真实工作的端到端学习 bot：**
用 LangGraph + GPT-4o-mini 替换所有 mock，接入真实 AI 评估和解释，数据持久化到 SQLite。

### 技术栈

```
python-telegram-bot      # Telegram 消息收发（已有）
langgraph                # Agent 状态图框架
langchain-openai         # GPT API 封装
openai                   # GPT-4o / GPT-4o-mini
SQLite (sqlite3)         # 持久化存储
```

> **为什么用 GPT 而不是 Claude API：**
> Claude 会员（claude.ai）与 API 独立计费，API 需单独在 console.anthropic.com 充值。
> OpenAI 更易获取，GPT-4o-mini 性价比高，适合 MVP 阶段。

---

## LangGraph Agent 设计

Bot 负责 Telegram 消息路由，LangGraph Graph 负责对话逻辑，两者解耦。

```
bot.py（消息路由）
    └── 调用 agent.py（LangGraph Graph）
            ├── node: select_question    # 根据掌握度选概念和题目
            ├── node: send_question      # 返回题目文本给 bot
            ├── node: evaluate_answer    # GPT 评估学生回答
            ├── node: socratic_followup  # 答错时生成引导问题
            ├── node: explain_concept    # 自由提问时解释概念
            └── node: update_mastery     # 更新 DB 中的掌握度
```

**Graph State（每个用户一个）：**
```python
{
    "user_id": int,
    "student_profile": dict,    # name, interests, style
    "current_question": dict,   # 当前题目
    "dialogue_history": list,   # Socratic 对话历史
    "socratic_round": int,      # 已追问几轮（最多3轮）
    "last_answer": str,         # 学生最新回答
}
```

---

## 阶段一：搭建 LangGraph 骨架 + 接入 GPT

**目标：** 用 LangGraph Graph 替换 mock_responses，学生问问题时 GPT 真实回答。

### 要做的事

1. **安装依赖**
   ```
   pip install langgraph langchain-openai openai
   ```
   在 `.env` 加 `OPENAI_API_KEY=...`

2. **新建 `agent.py`**
   - 定义 `AgentState`（TypedDict）
   - 实现 `explain_concept` node：接收问题 + 学生风格/兴趣 → GPT 生成个性化解释
   - System prompt 根据 style 切换：
     - `socratic`：用反问引导思考
     - `analogy`：用学生兴趣领域打比方
     - `direct`：直接清晰解释
   - 编译成 `graph = StateGraph(AgentState).compile()`

3. **修改 `bot.py` 的 `handle_text()`**
   - 把 `mock_responses.get_response()` 换成调用 `agent.explain_concept()`

**验收标准：** 发 "explain overfitting" → GPT 根据兴趣（如 Gaming）给出类比解释

---

## 阶段二：数据持久化（SQLite 替换内存）

**目标：** 重启 bot 后数据不丢失，为后续掌握度选题打基础。

### 要做的事

1. **新建 `database.py`**，建三张表：
   ```sql
   students (user_id, name, interests, style, registered_at)
   mastery  (user_id, concept, score, updated_at)
   quiz_log (id, user_id, concept, question_id, correct, timestamp)
   ```

2. **用 `database.py` 替换 `mock_db.py`**
   - 接口保持一致（`get_student`, `save_student`, `update_mastery`, `record_quiz_result`）
   - `bot.py` 无需改动

**验收标准：** 重启 bot 后，`/progress` 仍显示之前的掌握度

---

## 阶段三：AI 评估答案 + 开放式题型

**目标：** 不只是 MCQ，支持学生用自然语言回答，GPT 判断对错。

### 要做的事

1. **在 `agent.py` 新增 `evaluate_answer` node**
   - 输入：题目、学生回答、参考答案
   - 输出：`{"correct": bool, "feedback": str}`
   - GPT 做语义判断，而非字符串匹配

2. **在 `quiz_data.py` 新增开放式题目**（`"type": "open"`）
   - 题目格式：「用自己的话解释 X 是什么」

3. **修改 `handle_text()` 识别答题状态**
   - Session 记录 `"state": "wait_open_answer"` + 当前题目
   - 收到文本时判断是否在答题，分流到 agent

**验收标准：** 「解释 gradient descent」→ GPT 判断理解是否正确 + 给出反馈

---

## 阶段四：智能出题（基于掌握度）

**目标：** 根据学生弱点选题，不再随机。

### 要做的事

1. **修改 `handle_quiz()`**
   - 从 DB 读取该学生所有 concept mastery score
   - 优先选 score 最低的 concept 出题

2. **难度自适应**
   - mastery < 40% → 简单题（概念定义）
   - mastery 40–70% → 中等题（应用）
   - mastery > 70% → 挑战题（边缘情况）

3. **用 GPT 动态生成题目（替代硬编码题库）**
   - `generate_question` node：输入 concept + difficulty + interests → 输出题目 JSON
   - 返回 MCQ 或开放式题，由难度决定

**验收标准：** 答错 gradient descent → 下一题优先出 gradient descent 相关题

---

## 阶段五：Socratic 多轮对话

**目标：** 答错时不直接给答案，LangGraph 管理多轮引导对话。

### 要做的事

1. **在 Graph 中加入 Socratic 子流程**
   - `evaluate_answer` → 若错误 → `socratic_followup` node
   - State 中 `socratic_round` 计数，最多 3 轮
   - 3 轮后若仍未答对 → `explain_concept` node 直接解释

2. **`socratic_followup` node**
   - 输入：题目、学生错误回答、对话历史
   - 输出：一个引导性问题（不直接给答案）

3. **条件边（Conditional Edge）**
   ```
   evaluate_answer
       ├── correct=True  → update_mastery（+分）→ END
       ├── correct=False, round<3 → socratic_followup → 等待学生回复
       └── correct=False, round=3 → explain_concept → update_mastery（-分）→ END
   ```

**验收标准：** 答错后进入最多 3 轮 Socratic 对话，能通过引导自己得出答案

---

## 非 MVP 范围（之后再做）

- Educator dashboard（上传材料、查看 heatmap）
- RAG（解析课件 PDF，替换硬编码知识）
- 学生邀请链接机制
- 语音消息支持
- PostgreSQL 替换 SQLite

---

## 文件结构（MVP 完成后）

```
telegram-bot/
├── bot.py            # Telegram 消息路由（已有，小改动）
├── agent.py          # LangGraph Graph 定义（新增）
├── database.py       # SQLite 持久化（新增，替换 mock_db）
├── quiz_data.py      # 硬编码题库（保留，阶段四后逐步淘汰）
├── mock_db.py        # 废弃
├── mock_responses.py # 废弃
├── requirements.txt
└── .env              # BOT_TOKEN + OPENAI_API_KEY
```

---

## 开始顺序

```
阶段一（2天）→ 阶段二（1天）→ 阶段三（2天）→ 阶段四（1-2天）→ 阶段五（2天）
```

阶段一完成后 bot 就有真实 AI 能力了，后续每个阶段独立可演示。
