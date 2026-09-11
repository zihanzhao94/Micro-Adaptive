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

## 2026-07-21 — Adaptive Learning Activity + 持久化数据闭环

### 做了什么
- 将原本固定题库的 quiz flow 改为课程材料驱动的 adaptive learning flow：
  `select_concept → retrieve_course_context → choose_activity → generate_activity`
- 在 `agent.py` 中新增 Pedagogy decision node：`choose_activity`
  - 输入学生 mastery、learning style、interests、目标 concept 和 RAG context
  - 由 LLM 在受限集合中选择学习活动：`quiz` / `coding_task` / `diagram_prompt`
  - 输出 `activity_type`、`activity_reason`、`difficulty`
- 将生成结果统一为 `learning_activity`，避免后续 bot/UI 需要分别处理很多零散字段
- 保留 quiz 的原有 Socratic feedback：如果 activity 是 quiz，学生答错后仍进入 Socratic loop
- 将 Telegram 入口从单一 `/quiz` 扩展为通用 `/learn`
  - `/learn` 启动一次 adaptive activity
  - `/quiz` 作为兼容入口保留，内部调用同一个 learning flow
- 将 `quiz_graph` 语义升级为 `learning_graph`
  - 保留 `quiz_graph = learning_graph` alias，避免旧代码立即断掉

### RAG / 上传材料改动
- 前端上传材料后，FastAPI 会保存文件到 `course_materials/`
- 上传接口改为只索引（处理）刚上传的文件：
  `index_uploaded_material(save_path)`
- 禁用了自动扫描整个本地 `course_materials/` 的逻辑，避免 sample/local 文件被误当成 educator 上传内容
- 当前设计：
  - 新上传文件 → 增量加入 Chroma
  - 同名文件 → 删除旧 source 对应 chunks 后再加入新内容
  - `query_rag()` 只读取已有 Chroma index，不再自动 build 本地目录

### 数据库 / Dashboard
- 实现 `src/database.py`，用 SQLite 替代 `mock_db.py`
- 新增表：
  - `students`：学生 profile、注册状态、quiz_count
  - `mastery`：每个学生每个 concept 的 mastery score
  - `quiz_results`：答题记录和历史
- `bot.py` 改为读写 SQLite，学生注册、mastery 更新、quiz result 都会持久化
- `api.py` 改为从 SQLite 读取学生数据，解决 bot 进程和 FastAPI 进程无法共享 in-memory mock data 的问题
- Dashboard 去掉主要 mock data，改为从 FastAPI 拉取：
  - `/dashboard/summary`
  - `/students`
  - `/students/{id}`
  - `/course`
  - `/teaching-intention`
- `.gitignore` 增加 `micro_adaptive.db`，避免提交本地运行时数据库

### 设计决策
- **Socratic 不是 activity_type**
  - `quiz` / `coding_task` / `diagram_prompt` 是学生要完成的任务
  - `socratic_followup` 是 quiz 答错后的 feedback strategy
  - 所以 Socratic 暂时只保留在 quiz 分支，不强行复用到 coding/diagram task
- **LLM 做教学策略建议，代码做约束**
  - `choose_activity` 让 LLM 根据学生画像和课程上下文做推荐
  - 但 activity type 和 difficulty 都限制在固定集合，避免 LLM 生成未知类型导致系统无法执行
- **先用一个 LangGraph 多 node，不急着拆多 agent**
  - Profiler / Pedagogy / Generation 的职责先映射成 graph nodes
  - 等流程稳定后，再决定是否需要真正拆成多个 agent 或 external tools
- **先统一入口，再扩展评估**
  - `/learn` 代表 adaptive weekly learning journey 的学生侧入口
  - 现在 quiz 已有答题/评估/Socratic 闭环
  - coding/diagram 目前只生成任务，还没有提交和评估闭环

### 遇到的问题 & 解决方法
- 前端上传显示 `Failed to fetch`
  - 原因：FastAPI 后端没有在 `127.0.0.1:8000` 运行
  - 解决：明确开发时需要分别启动 backend、frontend、Telegram bot
- bot 和 dashboard 数据不同步
  - 原因：`mock_db.py` 是 in-memory，bot.py 和 uvicorn 是两个进程，内存不共享
  - 解决：改用 SQLite，让两个进程读写同一个 `micro_adaptive.db`
- `choose_activity` 返回字段和 `generate_activity` 读取字段不一致
  - 原因：最初返回 `{"activity": ...}`，但后续读取 `activity_type`
  - 解决：统一为 `activity_type`、`activity_reason`、`difficulty`
- 非 quiz activity 不能继续走 `check_answer`
  - 原因：coding/diagram task 没有 A/B/C/D answer
  - 解决：新增 `route_activity`，quiz 走 `check_answer`，非 quiz 走 `message_activity`

### 当前架构

```
select_concept
    ↓
retrieve_course_context
    ↓
choose_activity
    ↓
generate_activity
    ├── quiz → check_answer → socratic_followup / message_student
    └── coding_task / diagram_prompt → message_activity → END
```

### 验证
- Python 编译检查通过：
  `.venv/bin/python -m py_compile src/agent.py src/bot.py src/api.py src/database.py src/course_rag.py`
- 前端 lint 通过，无错误；仅剩一个旧 warning：`setup/course/page.tsx` 中 `Tag` import 未使用
- `agent.learning_graph` 和兼容 alias `agent.quiz_graph` 均可正常 import

### 下一步
- 给 `coding_task` / `diagram_prompt` 增加学生提交入口
- 新增 `evaluate_activity_response` node：
  - quiz：继续用现有 MCQ + Socratic
  - coding_task：评估学生提交的代码/思路
  - diagram_prompt：评估学生提交的图或文字描述
- 将 evaluation 结果写入 SQLite，更新 mastery
- 后续考虑加入 `reflection` activity，但要先明确 reflection 的提交格式和评分标准

---

## 2026-07-31 — Activity Evaluation 与对话记忆

### 做了什么
- 完成 `coding_task` 和 `diagram_prompt` 的提交与评估闭环：学生可在 Telegram 直接提交文字说明，LLM 根据课程 RAG context 给反馈并更新 mastery。
- quiz、coding task、diagram task 的结果统一写入 SQLite；`quiz_results` 目前也承担 activity history 的角色。
- 新增原始对话记录 `conversation_messages`：保存学生消息、bot 回复和按钮选择。
- 新增每个学生一条动态 `conversation_summary`：由旧 summary、学生消息和结构化学习结果更新，用于保留跨多次聊天仍有用的课程/项目背景。
- 新增 Telegram 命令：
  - `/history`：查看最近 10 条原始对话
  - `/memory`：查看动态 conversation summary

### 当前 Agent 输入
- 自由会话回答：`conversation_summary + 最近10条对话 + 当前问题 + RAG`。
- 选活动/出题：`conversation_summary + mastery + 最近5次活动结果 + RAG`。
- Pedagogy Agent 会参考近期活动类型和结果，避免重复同一种活动，并对薄弱概念安排巩固练习。

### 设计决策
- 原始对话与 summary 分开保存：原始记录用于短期上下文和追溯；summary 用于长期、低 token 的个性化上下文。
- summary 只采纳学生明确表达的信息和已保存的学习结果，不从 bot 回复复制课程介绍或推断学生背景。
- 不把全部历史对话直接放入 prompt，只读取最近 10 条，避免无关信息和 token 成本不断增长。
- 仍由业务数据库保存长期学习数据；LangGraph `MemorySaver` 只负责单次 graph workflow 的运行状态。

### 验证
- SQLite activity history 读写测试通过。
- 原始对话持久化测试通过（包含 bot 编辑消息后的更新）。
- Python 语法检查通过：`src/database.py`、`src/agent.py`、`src/bot.py`。

### 下一步
- 用真实 Telegram 对话验证 summary 是否保留恰当信息、不会写入无关内容。
- 将默认 mastery concepts 改为 educator 上传课程材料后可配置/可提取的 concepts。
- 视测试结果决定是否将 `quiz_results` 重命名为更准确的 `activity_results`。

---

## 2026-08-05 — Course-scoped Adaptive Learning Workflow

### 做了什么
- 将课程、上传材料和 RAG retrieval 按 `course_id` 隔离；教师上传的 PDF/TXT 保存到 `course_materials/<course_id>/`，并在 Chroma metadata 中保存课程 ID。
- 新增教师确认课程概念的流程：LLM 可根据课程资料和 learning objectives 提供建议，但只有教师保存后才成为正式 concept map。
- 为 concept 增加稳定 `concept_id`；教师在 dashboard 改名后，既有 mastery 和 quiz history 仍显示新名称并保留分数。
- 新增 dashboard 的 `Course Concepts` 页面，可在 setup 后继续维护概念。
- 将 agent 的选题改为优先使用教师确认的 concept map；新学生不会再依赖旧的 ML hardcoded concepts。
- 将 quiz、coding task、diagram prompt 的生成与开放题评价提取到 `skills.py`，由 LangGraph nodes 负责编排。
- 实现材料删除：删除原文件、SQLite material record 与对应 Chroma chunks。
- 统一 Chroma 集成到 `langchain-chroma`，移除旧的 community vector-store fallback；损坏的本地索引仅保留为本地备份。
- 新增 educator SQLite account persistence：注册信息、密码 hash、当前 educator 与课程归属会保存；login/register 不再是 mock 跳转。
- 课程邀请改为 Telegram deep link：二维码和复制链接使用 `course_<course_id>` payload，新学生注册时会绑定对应课程。
- 为 Telegram HTTP 调用加入连接重试，并固定从 `src/.env` 读取 bot 配置。

### 设计决策
- **LLM 建议、教师确认概念**：上传材料不自动覆盖课程结构，避免概念太细或提取错误。
- **概念 ID 与显示名称分离**：mastery/history 应属于课程概念本身，而不是一个可编辑字符串。
- **单个通用 Telegram bot**：课程差异由 invite payload 和 `course_id` 路由，而不是每门课维护一个 bot。
- **本地运行数据不进入 Git**：上传文件与 Chroma backup 可重新生成或含课程内容，因此保持本地。

### 已知限制
- 当前 educator login 是单机 demo 的全局 active educator，不是 cookie/JWT session。
- 当前一个 Telegram user 只能绑定一门课程；若要支持同一学生加入多门课，需要增加 `student_courses` enrollment 表，并将 mastery key 改为 `(user_id, course_id, concept_id)`。

### 验证
- Python 编译、SQLite concept rename persistence 测试、educator login persistence 测试和 Next.js lint 均通过。

### 下一步
- 实现 `student_courses`，使现有学生也能通过新邀请加入另一门课程。
- 用 cookie/JWT 取代全局 `active_educator_id`，保护 educator API。
- 为课程资料增加安全的重建索引入口。

---

## 2026-08-15 — 每周反思推送（方向调整）

### 背景
导师建议把方向从「自适应出题」转向「学习反思」，并要求系统能主动找学生、和每周课程绑定、老师能看到学生怎么用。

核心问题是：**学生凭什么会主动用？**

参考的是教育学里的 minute paper（下课前问「今天最重要的三个概念是什么」「哪里还不懂」）。它有效的前提是人还在教室、只花两分钟、写两行字。搬到课外自愿参与后这三条都没了，所以这次的设计重点不是功能多，而是**让学生花的力气尽量小、拿到的回报看得见**。

### 主要改动

**1. 课程按周组织**
- 课程加了开课日期、总周数、推送星期和时间；材料加了周次，上传时必须选。
- 周次是**算出来的**（`(今天 - 开课日) // 7 + 1`），没有单独建周次表 —— 课表规律时不需要。
- dashboard 加了 Weekly Push 设置页，setup 流程多了一步。

**2. 定时推送**
- bot 里加了一条独立线程，每 2 秒检查一次该不该发。没放在原来的消息轮询里，因为那里会卡最多 30 秒。
- 群发用单独线程 + 限速 20 条/秒，200 人广播期间学生照样能正常聊天。
- 靠「这个时间点发过没」防重复。改了推送时间就是新的时间点，会重新发。

**3. 学生端：点按代替打字**
- 推送出来是**本周概念的按钮，点最多 3 个**，十秒能答完。第二问「哪里不清楚」可选，有 Skip。
- 概念从当周材料自动提取，每周算一次并缓存。
- 答完给一句**缺口反馈**：「本周还讲了 X，值得回看」。
- 困惑**不当场解答**，要点「Explain it now」才解释 —— 否则「下节课老师会讲」这个最强的动力就没了。

**4. 班级汇总**
- 推送 24 小时后自动发：大家都选了什么、最多人卡在哪、「你不是一个人」。
- 触发条件是固定 24 小时，不是「所有人都回复」—— 回复率现实上到不了 100%。
- 文案不替老师承诺「会讲」。老师可以自己加一句，不加也照发。

**5. 老师端**
- 新增 Reflections 页面：概念票数条形图 + 困惑原文列表。
- **票数为 0 的概念也显示** —— 「讲了但没人记住」是最有价值的信号。
- 加了 Send now 按钮，方便测试和临时补发。

**6. 其他**
- SQLite 开了 WAL，解决老师刷页面和 bot 写消息互相阻塞的问题。
- 新建 `reflections.py`，把反思相关逻辑从 `bot.py` 和 `agent.py` 里收拢起来。

### 踩的坑
- **汇总发不出去**：代码是「先记账、再发送」。没人填反思时发送被跳过，但账已经记了，之后永远不再发。改成没内容时把账划掉。
- **手动按钮没反应**：判断顺序错了，先检查「发过没」就直接返回，根本没看到按钮的标记。
- **学期最后一天推送后汇总丢失**：汇总原本从推送时间反推周次，跨天后算出「学期已结束」。改成推送时直接把周次存下来。

### 几个想清楚了的决定
- **周次算不存**：课表规律时建表是为不存在的需求做设计。
- **防重复用「时间点」不用「周次」**：这样改时间能重新触发，同时不会重复发。
- **反思单独建表**，没混进聊天记录 —— 它是「概念列表 + 困惑 + 每周唯一」的结构化数据，混进流水账后老师端根本统计不出来。
- **推送开关要留着**：它是唯一「暂停发消息但保留配置」的入口，学期中想停一周不该靠清空开课日期。

### 待办
- **期末复习包**：用学生 13 周的记录生成 —— 从没选过的概念（盲区）、没解决的困惑（这时候可以直接给答案）、盲区练习题。这是让学生坚持一整个学期的理由。现有的 quiz/mastery 代码在这里正好有用武之地。
- 汇总里加「另外 N 位同学也提到了这点」，降低承认不懂的心理压力。
- **隐私要分层**：反思是学生知道要给老师看的，自由提问不是。现在混在一张表里，老师端如果全都展示，学生就不会再诚实说「我不懂」了。
- 推送时间建议设在下课后半小时到一小时，别放晚上。
- **学生入口比代码重要**：老师第一节课放个二维码说一句话，和不说，注册率差一个数量级。
- 已知限制（写进报告）：学生的请求之间仍然会互相排队；会话状态存在内存里，bot 重启会丢。

---

## 2026-08-19 — 期末复习包、概念按周组织、老师可见推送内容

### 做了什么

**1. `/revise` 期末复习包（新增 `revision.py`）**

学生随时可打开，四个板块：
- **盲区排序** —— 四个信号打分：聊天里反复问（+4）、写过困惑（+3/次）、选过但答题正确率低（+3）、从没提过也没练过（+2）。第三条最有价值，因为学生自己发现不了「以为懂了其实没懂」。
- **困惑 + 解答** —— 但只解答**汇总已发出**的周次；当周的显示「等汇总发出后解锁」，避免绕开「老师先在课上讲」这个动力设计。
- **按周轨迹** —— 每周选了什么，纯列表。
- **定向练习** —— 复用现有 quiz 图，`forced_concept` 打在盲区第一名上。

自由聊天记录**只进学生自己的复习包，不进老师端**。这条边界让隐私分层落到了代码里：老师端接口从未暴露过 `conversation_messages`。

**2. 概念改为按周组织**

发现一个真 bug：概念被提取了两次（上传时进课程列表、推送时又对同一批 PDF 提取一次），两次名字对不上。学生 Week 1 点的 `Testing and Deployment`、`Assignments` 在 `course_concepts` 里根本不存在，**这些反思数据在盲区分析里被完全忽略**。

改法：
- 新增 `concept_weeks` 关联表（一个概念可跨多周）
- 提取只发生在上传时，且**把已有概念列表一并给 LLM**，要求同义复用、只新建真正的新话题
- 匹配用归一化 key（去标点、压空格、去复数尾缀），`Systems`/`System` 这类近义重名能对上
- 提示词明确排除 `Class Participation`、`Assignments` 这类课程管理内容
- 推送时 `week_concepts()` 改成**纯数据库查询**，不再调 LLM

实测：同一份 PDF 重新提取，10 个概念里 9 个复用已有名字。

**3. 没有材料的周不再降级推送**

原来该周无材料时会退回「课程整体概念」，等于拿别周的内容问学生——收到的数据看着像数据，其实无意义，还会污染老师的统计。改成**不发**，并在 schedule 页显示预警（到点前）和跳过记录（事后），Send now 按钮也会拦截并说明原因。

**4. 老师能看到并修改推送文案**

- prompt 存进数据库，schedule 页显示**渲染后的真实消息**（不是带 `{week}` 的模板）+ 学生会看到的按钮列表
- 占位符校验：写了不存在的变量返回 400，不会等推送时才炸
- 改完**立即生效，不用重启 bot**（每次发送时读库）
- 预览和推送走同一个函数——曾经预览显示 12 个概念而实际只发 8 个（按钮数量上限），已修正

**5. 三个页面改成按周分组**：Overview 的掌握度（当前周高亮）、Concepts、Materials。

### 踩的坑
- **Telegram 4096 字符上限**：`/revise` 的困惑板块按 13 周真实数据算有 9000+ 字符，原来会静默发送失败（Telegram 返回 `ok: false`，不抛异常）。加了 `send_long()` 按空行分段。
- **汇总槽位提前占用**：无数据时跳过发送但已标记「已发」，之后永不重试。改成无内容时释放槽位。
- **手动汇总按钮被短路**：判断顺序把「已发过」放在强制标记前面，按钮标记永远读不到。
- **老师端 0 票基线读了废弃缓存**：`week_concepts` 改成读关联表后，reflections 页仍在读旧的 app_state 缓存，会导致「讲了但没人选」的概念显示不出来——而那是这个页面最有价值的信号。

### 设计决策
- **未分配周次的概念不进盲区分析**：它不属于「课程教过的内容」，否则会因为「从没选过」平白拿分。但概念本身保留，mastery 历史不受影响。
- **`/revise` 不限学期末**：随时可开，靠困惑解答的时间锁维持动力设计，而不是靠限制入口。
- **mastery 数据会偏稀疏，这是接受的代价**：不为了填这个数据而增加每周推送——「一周只碰学生一次」是这套设计最重要的纪律。

### 下一步（导师会议要求）
- **开放式书写替代点按** —— 与当前设计冲突：点按是为了把参与成本压到最低，开放式是为了拿到可分析的质性数据。折衷方向：第一问改开放式，概念按钮作为「想不起来」时的兜底。
- Bot 主动追问（开放式问题）
- 班级层面的质性归纳，生成 comment 给老师
- Presentation：Intro / Motivation / Literature / System / Demo + 录像
- 核心难题未解：**学生凭什么主动用，主动 interact 有阻力**

---

## 2026-08-27 — 按学生看反思

### 背景
导师看过班级视图后提出：

> analyze it for each week (for all students) **and analyze for each student over multiple weeks (or a single week)**
> maybe in future can also allow the users to "filter" by selected weeks/student(s)

第一项已经有了（反思页就是"某周 × 全班"），缺的是**按学生**这个维度。

顺带解决了一个存在很久的问题：`/dashboard/student/[id]` 和 students 列表页**整页都是空的** —— 它们完全依赖 `mastery` 和 `quiz_results` 两张表，而没人做过练习题，所以点进任何学生都显示 "No mastery data yet"，列表页三个统计卡片全是 0，所有学生被标成 "Struggling"。把反思数据接进去，正好一举两得。

### 做了什么

**1. `student_analysis()`（`reflections.py`）**

和 `class_analysis()` 平级，但**提示词完全重写**。班级视角问的是"全班哪里没听懂"，单个学生要问的是"这个人的理解停在什么层次、跨周有没有变化"。提示词里明确禁止用 "students" 或 "the class"，也禁止在只有一两周数据时声称趋势。

数据层没动 —— `list_reflections()` 早就支持 `user_id` 和 `week_no` 过滤，`week_no=None` 就是跨周、传了就是单周，正好覆盖导师说的两种情况。

**没有复用 `revision.py` 的 `rank_blind_spots()`**：它的打分用到了学生的自由聊天记录，而那是早先定下的隐私边界 —— 自由提问只进学生自己的 `/revise`，不进老师端。`build_confusions()` 更不能调，它有副作用会写入 RAG 答案。

**2. "从未提及"只算学生答过的周**

第一版列出了全部课程概念。但学生缺席的那周不算"没想起来"，是**根本没有数据** —— 混在一起会让缺口看起来大得多。

**3. 分析结果加缓存**

`GET /reflections` 之前**每次打开都调一次 LLM**。加了按学生的视图后会翻倍，而且老师刷新两次可能看到措辞不同的结论 —— 这会直接侵蚀他对结论的信任。

按输入内容哈希做 key，有新回复时哈希自然变化、自动失效，不需要手动清。实测第二次请求 0.01 秒，措辞完全一致。

**4. 两个页面共用同一组筛选器**

反思页和学生页顶部都是 `[All students ▾] [Week N ▾]`，切换时通过 `?week=` 带着当前周次走。第一版只在反思页放了学生下拉，结果**回到班级视图只能点左上角的 Back**，很难找。

**5. students 列表改成参与度口径**

三个统计卡片和筛选按钮原本全按 `avgMastery` 算，换成参与周数、有困惑的学生数，筛选改成 Replies often / Rarely replies。统计用**一条聚合 SQL** 拿到所有学生的数据 —— 这个列表页本来每行就要跑好几次查询，不能再往里加。

### 踩的坑
- **`useSearchParams()` 需要 Suspense 边界**，否则反思页静态预渲染时构建失败。学生页因为是动态路由 `[id]` 没暴露这个问题。
- 用 sed/脚本改前端时，有一处锚点已经不存在（`note` 那段之前删了），替换**静默失败**，直到 tsc 报 `Cannot find name` 才发现。批量改写必须带 assert。

### 设计决策
- **数数字的事不交给 LLM**：召回次数、占比、"N of M concepts went unmentioned"、参与周数全是计算出来的。只有"这些人的描述停在什么层次"这种判断才用模型。又便宜又稳定，同样的数据不会两次给出不同结果。
- **老师端不返回学生原话**：接口里没有 `recallText`，也没有任何聊天记录。老师看到的是分析和概念图景，不是逐字记录。

### 待办
- **多选筛选**（导师说的 "selected weeks/student(s)" 里的复数）—— 需要引入 multi-select 组件，dashboard 里现在一个都没有，后端分析函数也要支持周次列表。他说的是 "in future"，暂缓。
- 跨周视图目前看不出效果：14 个模拟学生都只有 week 3 的数据。
- **模拟数据必须在报告里标注 simulated**。

---

## 2026-09-11 — 反思输入校验与非锚定式困惑追问

### 背景

开放式反思原先将少于 15 个字符的回答全部丢弃。这能拦住 `aa`、`I forgot`
之类无效输入，但也会误删 `SDLC`、`Use Cases`、`需求分析` 等真实课程概念。
另外，原有 follow-up 让 LLM 从 matched concepts 中挑一个追问，会替学生预先选定
“应该不确定的概念”，产生锚定偏差。

### 做了什么

**1. 用明确无效规则取代固定长度门槛**

- 删除 `MIN_RECALL_CHARS = 15`。
- 输入先做 Unicode-safe 归一化，去除标点并压缩空白。
- 只在能确定无效时短路返回：空白、纯符号、重复字符、明确的无回答表达，
  以及未对应课程概念的两字母英文片段。
- 在过滤前检查教师确认的概念名和缩写，因此 `AI`、`SDLC` 等短概念仍可进入
  语义分类。
- 分类 prompt 明确要求随机字符、重复字符和测试输入不能被当成 unmatched topic。

**2. uncertainty 追问改成学生自主选择**

- matched concepts 只表示“学生提到了什么”，不再被当成“学生不确定什么”的证据。
- 取消 LLM 从 matched list 中选一个概念生成问题的步骤。
- 改为稳定的整周视角问题：
  `Looking across the ideas you recalled—or anything else from this week—which part would be hardest to explain without notes, and why?`
- 学生可以从已回忆的多个概念中选择，也可以提出 matched 之外的本周困惑。

**3. 回归测试**

- 新增 `evaluation/test_reflection_input_validation.py`，覆盖明确噪声和中英文短概念。
- 新增 `evaluation/test_reflection_followup.py`，确认多个 matched concepts 不会让问题锚定到其中一个。
- 6 项相关 unittest 全部通过；6 项 core system checks 全部通过。

### 设计决定

- **长度不是语义质量的代理指标**：只拦截确定噪声，把其余内容交给语义分类。
- **recall 与 uncertainty 是两种不同信号**：模型可以识别学生提到的概念，但不应替学生
  决定哪个概念最不确定。
- **固定追问比生成式追问更符合这一步的目标**：它降低锚定、延迟、调用成本和生成失败，
  同时保留“学生自己指出 gap”这个核心信号。
