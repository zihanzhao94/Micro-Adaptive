# Development Log — Micro-Adaptive Learning System

> 记录设计决策、遇到的问题和解决方案，供报告撰写参考。

---

## 模板格式

```
## YYYY-MM-DD
### 做了什么
### 设计决策（为什么这样做，有哪些备选方案）
### 遇到的问题 & 解决方法
### 下一步
```

---

## 2026-06-23

### 做了什么
- 完成 MVP Telegram Bot 基础框架：注册流程、/quiz、/progress、/help、自由问答
- 引入 LangGraph + GPT-4o-mini，agent.py 实现自由问答的 AI 回复
- 开始设计 QuizGraph（LangGraph 图，处理出题→判断→反馈流程）

### 设计决策
- **为什么用 LangGraph？**
  - 以后要加 Socratic 对话循环（多轮追问），纯函数调用难以管理状态
  - LangGraph 的 State + 条件边天然适合这种分支+循环流程
- **QuizGraph 节点设计（简化版 MVP）**
  - 6个节点：`start → ask → check → message（答对）/ explain（答错）→ end`
  - 暂不实现 Socratic 循环，先跑通直通流程

### 遇到的问题 & 解决方法
- `AIMessage` 无法 JSON 序列化 → `llm.invoke(...).content` 取文本
- Telegram API ProxyError → 设置 `NO_PROXY=api.telegram.org`
- `student['learning_style']` KeyError → 字段实际名称是 `style`

### 下一步
- 定义 QuizState（TypedDict）
- 实现 QuizGraph 的节点函数和条件边
- 接入 bot.py 的 /quiz 流程

---

## 2026-06-23（续）— QuizGraph 实现 & 调试

### 做了什么
- 完成 QuizGraph 全部节点并跑通（`python agent.py` 本地测试通过）
- State 用 `MessagesState` 扩展，加字段：`quiz_question` / `learning_style` / `choice` / `is_correct`
- 节点：`ask_question`（随机选题）→ `check_answer`（比对答案存 is_correct）→ 条件路由 → `message_student`（答对，直接用 quiz_data 解释）/ `explain_answer`（答错，调 LLM 给提示）
- 条件边用 `route_based_on_correctness` 函数，按 `is_correct` 返回下一节点名

### 设计决策
- **节点 vs 条件边分离**：LangGraph 中节点函数返回 dict（State 更新），条件边函数返回节点名字符串，二者不能合并到一个函数。
- **State 是节点间唯一通信通道**：随机选的题、学生选项、判断结果都必须存进 State，否则下游节点读不到。
- **system prompt 是节点级、不是图级**：只有调 LLM 的节点才需要；hardcoded 题目阶段不需要 system prompt，等以后加「AI 生成题目」节点时该节点再自带 system prompt。
- **自由问答暂不入图**：`answer_question` 保留为独立函数；对话记忆是后续迭代，避免 scope creep。

### 遇到的问题 & 解决方法
- LLM 输出里出现「Student: ...」假装是对话历史 → 根因是 `explain_answer` prompt 里拼了带 example 的 `System_prompt`，LLM 模仿了示例格式 → 改用不含 example 的内联 prompt 解决。
- （记录最佳实践，待后续应用）调 LLM 应将 system 内容作为独立 `SystemMessage` 传入，而非拼进 user 字符串，可避免角色混淆。

### 下一步
- 接入 bot.py 的 /quiz 流程：调用 `quiz_graph.invoke(...)`，传入 `choice` / `learning_style`，把 `result["messages"][-1].content` 发给学生
- 实现 database.py（目前全是 stub）

---

## 2026-06-29 — QuizGraph 接入 bot + human-in-the-loop

### 做了什么
- 用 `interrupt()` 把 quiz 图改成「人在回路」：图发完题后停在 `check_answer`，等学生点按钮再恢复
- `compile(checkpointer=MemorySaver())` 加检查点；按环境变量 `LANGGRAPH_API_URL` 区分库模式 / langgraph dev 模式（dev 模式平台自己管 checkpointer，不能自带）
- bot.py 接入图：
  - `handle_quiz`：`invoke` 启动图→停在 interrupt→`get_state` 取出图选的题→发题+按钮
  - `handle_answer_callback`：`invoke(Command(resume=selected))` 恢复图→拿 `is_correct`/`reply`→更新 mastery
  - 两次调用用同一 `thread_id = str(user_id)` 串成一局；不再需要 `SESSIONS["current_q"]`
- 给 bot.py 所有 handler 加了英文 docstring

### 设计决策
- **interrupt 放 check_answer 而非 ask_question**：interrupt 应放在「必须有外部输入才能继续」的地方。check_answer 需要学生的 choice，所以停在它；ask_question 自己就能跑完。
- **`interrupt()`（节点内）vs `interrupt_before`（编译时）**：前者停在代码行、能直接返回 resume 的值；后者停在节点门口、需手动 `update_state`。选前者，因为要接收学生答案。
- **`thread_id` 的作用**：状态身份 = (checkpointer, thread_id)。同一用户共用 `str(user_id)`；不同图各有独立 checkpointer，即使同 id 也互不干扰。
- **库模式 vs API 模式与「是不是 agent」无关**：agent 的本质是「有状态 + 能决策/分支 + 可多步/human-in-the-loop」，跟用 `invoke()` 还是部署成 HTTP API 调用无关。当前 quiz 图（条件分支 + interrupt）已具备 agent 特征；反而单次调用的 `answer()` 最不像 agent。

### 遇到的问题 & 解决方法
- `langgraph dev` 启动失败：自带 checkpointer 在 API 模式被当硬错误 → 用 `if os.environ.get("LANGGRAPH_API_URL")` 区分，dev 模式不传 checkpointer。
- `interrupt() missing 1 required positional argument: 'value'` → `interrupt()` 必须传一个展示值，改成 `interrupt("waiting for student's answer choice")`。

### 待办 / 设计讨论（自由对话记忆）
- 现状：自由问答 `answer()` 是单次无状态调用，没有对话记忆。
- 问题场景：学生做完题问「为什么是这样」，chat 完全不记得刚才那道题。
- 方案 B（轻量，计划先做）：自由对话改成带 `MessagesState` + checkpointer 的小图（START→chat_node→END）实现记忆；quiz 结束时用 `chat_graph.update_state` 把题目上下文「喂」进对话历史，让 chat 能引用刚做的题。
- 方案 A（彻底）：合并成一个带路由的大图，quiz 和 chat 共享同一份 `messages`，双向共享上下文；复杂度高，留作后续。

### 下一步
- 实现自由对话 chat 图（方案 B 第一步）：`chat_node` + checkpointer，改 `handle_text` 调用它
- quiz 结束时把题目上下文写进 chat 历史
- 实现 database.py（持久化，顺带为部署铺路）
- （技术债）生产环境长轮询 → Webhook；MemorySaver → SQLite checkpointer

---

## 2026-07-01 — Socratic Tutoring Loop 实现

### 做了什么
- 设计并实现了完整的 Socratic 对话循环（`socratic_followup` 节点）
- `bot.py` 接入 Socratic 流程：答错后触发引导提问，接收学生自然语言回复，最多追问3轮
- 修复了 `agent.py` 调试脚本，使其能正确处理 Socratic 中断

### 设计决策

**`socratic_followup` 合并成单一节点（而非拆分成 explain + check 两个节点）**
- 原设计：`socratic_explain`（生成引导问题 + interrupt）→ `socratic_check`（评估理解）
- 问题：`socratic_check` 引用了 `socratic_explain` 里 interrupt 返回的局部变量 `student_reply`，跨 node 无法访问，会 NameError
- 解决：合并成 `socratic_followup`，一个 node 内完成「生成 hint → interrupt 等回复 → GPT 语义评估」，变量在同一作用域

**routing function 不能修改 state**
- 原写法：在 `route_socratic_attempt` 里做 `state["socratic_round"] += 1`
- 问题：routing function 是纯函数，只能读 state、返回节点名字符串；修改不会被 checkpointer 保存，实际上是无效写入
- 解决：`socratic_round + 1` 移进 `socratic_followup` 的 return dict，由 LangGraph merge 到 state 并持久化

**State 字段加默认值**
- 原来所有字段必填，LangGraph Studio 中需要手动填 `quiz_question`、`is_correct` 等
- 实际只有 `learning_style` 是 invoke 时的必要输入，其余由节点自动填写
- 改为加默认值：`quiz_question: dict = {}`、`is_correct: bool = False`、`socratic_round: int = 0`

**每次 `/quiz` 使用独立 thread_id（含时间戳）**
- 原来复用 `str(user_id)`，同一用户多次 quiz 会共享同一 checkpointer 状态，可能带入旧的 `is_correct` / `socratic_round`
- 改为 `f"{user_id}-quiz-{int(time.time())}"` 并存入 `SESSIONS["quiz_thread_id"]`，每局独立

**learning_style 的实际作用**
- 不决定是否触发 Socratic（答错必进 Socratic），而是影响引导问题的表达风格
- analogy 风格 → 用生活类比引导；step-by-step → 拆分推理步骤；visual → 用图示描述引导
- `message_student`（答对反馈）目前仍用硬编码 `explanation_correct`，未来可改成 GPT 根据风格生成

### 遇到的问题 & 解决方法

| 问题 | 原因 | 解决 |
|------|------|------|
| 发表情 ✅ 也被判为"理解了" | GPT 把符号当确认 → `true` | 在评估 prompt 中加约束：纯表情/符号/yes 不算理解 |
| `result["messages"][-1].content` IndexError | 答错后图在 Socratic interrupt 再次暂停，messages 还未写入（在 return 之前） | 改用 `get_state(config)` 拿状态；检查 `state.next` 决定是否还在运行 |
| bot.py 中 Socratic hint 拿不到 | 以为 `invoke()` 返回值带 hint，实际 hint 在 interrupt payload 里 | 改为 `graph_state.tasks[0].interrupts[0].value` 取 interrupt 的值 |

### 当前架构

```
check_answer (interrupt: 等 MCQ 选项)
    ├── 答对 → message_student → END
    └── 答错 → socratic_followup (interrupt: 等自然语言回复)
                  ├── 理解了 → message_student → END
                  ├── 未理解, round<3 → socratic_followup（循环）
                  └── round≥3 → explain_answer → END
```

bot.py 状态机新增 `IN_SOCRATIC` 状态，学生文字回复时走 `Command(resume=text)` 路径。

### 下一步
- `message_student` 改为 GPT 根据学习风格生成个性化鼓励（而非硬编码文字）
- 实现 `database.py`（替换 mock_db，持久化 mastery 数据）
- 测试多轮 Socratic 在实际 Telegram 环境的表现
- 考虑加入 `/quiz [topic]` 参数，按概念出题

---

## 2026-07-12 — Course-grounded RAG 初版

### 做了什么
- 新增 `course_materials/` 目录，开始把课程内容与源代码分离存放
- 在 `src/course_rag.py` 中实现了课程材料读取、文本切分、向量索引构建、相似度检索和上下文格式化
- 在 `agent.py` 的自由问答路径中接入 `course_rag.query_rag(question)`，让回答先检索课程材料再交给 LLM 生成
- 用 `sample_ml.txt` 作为临时材料验证 RAG 基本流程，先跑通单课程问答闭环

### 设计决策
- **先做最小可运行 RAG，再逐步扩展**
  - 当前重点是验证 `load → chunk → index → retrieve → answer` 这一条主链路
  - 暂时不先做多课程管理、上传界面或复杂工具路由，避免 scope 过大
- **课程材料放在项目根目录**
  - `src/` 只放代码，`course_materials/` 放课程数据，后续更容易扩展到上传的 PDF、notes 和 slides
- **通用框架 + 课程扩展**
  - 核心问答流程保持通用
  - 课程特有能力（如 diagram review、code review）保留为后续可配置扩展，而不是现在写死

### 遇到的问题 & 解决方法
- 一开始对 `chunking`、`tokenize`、`vector store` 的职责边界不清楚
  - 通过先实现最小 RAG，把流程拆成独立函数理解：`load_documents` 负责读取，`chunk_text` 负责切分，`build_index` 负责建索引，`retrieve` 负责检索
- 课程材料路径容易和 `src/` 混淆
  - 统一改为项目根目录下的 `course_materials/`
- 目前 `course_rag.py` 里还有未使用 import 和重复创建 embedding 的问题
  - 先保证主链路可运行，下一步再做代码收敛和缓存优化

### 下一步
- 单独测试 `query_rag()`，确认能稳定检索到与问题相关的 chunk
- 清理 `course_rag.py` 中未使用的 import 和无效变量，避免噪音代码
- 给检索结果增加空结果 fallback，避免 `agent.answer()` 在无上下文时直接传空字符串
- 跑通自由问答后，再考虑把 quiz / reflection 的题目生成逐步从 hardcoded 数据迁移到课程材料驱动

---
