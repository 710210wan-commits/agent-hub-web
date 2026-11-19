# Daily SSE 正文流更新日志

> 记录范围：Daily canonical conversation 从“生命周期 SSE + 最终正文一次性出现”演进为安全、可停止、可重连的真实正文增量流。
>
> 起始提交：`bfa6667 docs(sse): add Daily Codex-style streaming plan`
>
> 维护方式：按实际发生顺序追加，并按真实 Git 提交日期归入 `## YYYY-MM-DD`。每项简要记录关联 Plan、对应 Task、问题、修改方案、代码变更、验证结果和本仓库真实提交号；跨仓依赖提交放在正文中说明。不得把方案、Spike 或待实施事项写成已上线功能，并须在 Push、Pull Request 或 Merge 前补齐。

## 2026-11-19

### 1. 建立 Daily Codex 式正文流联合方案

提交：`bfa6667`

Plan 文档：`docs/SSE/2026-11-17-daily-codex-style-sse-implementation.md`

对应 Plan 模块：联合方案基线、Task 0～7

#### 问题

- Daily 已有 canonical conversation、生命周期 SSE、cursor 补洞和 snapshot 恢复，但最终正文只能在完整 `message.created` 到达后一次性显示。
- 直接透传 provider chunk 可能泄漏 reasoning、工具参数、内部 JSON 或尚未确认的工具决策文本。
- 停止、失败和断线时缺少可刷新恢复的 partial output，前端也没有真实 delta 状态机。

#### 修改方案

- 以 canonical assistant message 为最终权威，以 durable `output.started/delta/completed` 构建可排序、可重放的正文草稿。
- 明确停止保留、断线续接、snapshot 恢复、canonical 核对、批量持久化和低延迟唤醒语义。
- 将 provider 流安全、Agent Loop 公开输出边界、事件投影和 Codex 式 UI 拆为 Task 0～7，禁止前端拆字伪造流式输出。

#### 代码变更

1. 新增 `docs/SSE/2026-11-17-daily-codex-style-sse-implementation.md`，逐项盘点 Daily 前端 reducer/SSE/snapshot 能力和 DSI 后端 provider/Gateway/event store 能力，并列出预计修改文件。
2. 在同一文档中定义 `output.started`、`output.delta`、`output.completed` 的字段、正常/取消/失败顺序、`messageId` 复用、`outputSeq` 连续性和 canonical message 一致性规则。
3. 将实现拆成 Task 0～7：上游 Spike、provider 流原语、Agent Loop 公开边界、durable output、低延迟投递、前端 reducer、Codex 式 UI 和端到端故障验收。
4. 文档明确 Daily-only、Work/Xiaozhi 零改动、禁止 raw reasoning/tool payload、禁止前端拆字和禁止生产 mock 回退；该提交没有修改 `src/` 或任何生产运行时代码。

#### 验证结果

- 文档提交只包含 `2026-11-17-daily-codex-style-sse-implementation.md`。
- 未执行生产代码测试；后续行为实现继续受各 Task 的 TDD 和跨仓门禁约束。

### 2. 调整公开输出边界、界面节奏与 Task 0 验收

提交：`c04523b`

Plan 文档：`docs/SSE/2026-11-17-daily-codex-style-sse-implementation.md`

调研文档：`docs/SSE/2026-11-18-daily-agent-benchmark-and-gap-analysis.md`

对应 Plan 模块：交互方案、模型流安全边界、Task 0、Task 2～7

#### 问题

- 默认展示“已完成 N 个步骤”会给普通问答增加噪音，且不能解释工具任务为什么仍在等待。
- 同一次模型调用可能先产生 `content`、随后才产生 tool call；只过滤 reasoning/tool-call 字段仍可能提前公开工具决策文本。
- 原 Task 0 要求在 durable event 和浏览器链路尚未建设时验证两者不泄漏，验收责任与实现阶段不匹配。

#### 修改方案

- 普通问答在首批正文到达后直接移除等待状态；只有真实工具活动才提供“查看执行过程”。
- 把“可以公开输出”定义为 Agent Loop 的显式 final-answer 阶段；工具型问答若不能安全复用同一次调用，则使用独立 tools-disabled final-answer 流。
- Task 0 只用原型验证上游顺序和 public-output sink；durable event 与浏览器不泄漏改由 Task 7 在真实链路验收。
- 安全清理前移到事件持久化和 SSE 投递之前，并要求覆盖敏感字符串跨 chunk 的情况。

#### 代码变更

1. 修改 `docs/SSE/2026-11-17-daily-codex-style-sse-implementation.md` 的交互章节：新增普通问答/工具任务/生成中/终态场景表，移除默认“已完成 N 个步骤”，改为仅有真实工具活动时显示“查看执行过程”。
2. 修改模型安全章节：新增“先 content、后 tool call”风险，冻结“明确无工具可直接流；可能用工具先完成决策与执行，再发起 tools-disabled final-answer 流”的两路径设计。
3. 修改 Task 0/2/3/4/6/7：把 durable event/browser 不泄漏移到 Task 7，要求安全清理先于事件持久化，新增 final-answer 阶段到首批正文可见指标，并规定首批立即渲染、后续约 60ms batching。
4. 将稳定 Markdown block 缓存和代码高亮优化改为真实 10k 长回答证明瓶颈后的性能工作，不再阻塞首版真实增量、停止保留和断线续接验收。
5. 新增 `docs/SSE/2026-11-18-daily-agent-benchmark-and-gap-analysis.md`，记录竞品、现有 Daily 能力证据和流式输出之外的产品缺口；未修改聊天组件、transport 或 reducer。

#### 验证结果

- 文档 diff 检查通过，未修改运行时代码。
- 方案明确 Task 0 未通过前不得开始公共浏览器协议实现。

### 3. 完成 Task 0 上游流与公开输出边界 Spike

提交：`a3b3e4e`

Plan 文档：`docs/SSE/2026-11-17-daily-codex-style-sse-implementation.md`

后端执行 Plan：`D:\0 ysq文件\DSI-agent-loop\docs\SSE\2026-11-19-daily-public-answer-stream-spike.md`

对应 Plan 模块：Task 0

#### 问题

- 尚未用目标上游证明 reasoning、content 和 tool-call chunk 的实际顺序。
- 无法确认工具能力开启的同一次调用是否能在首个 content 前证明已经进入最终回答阶段。
- 部署拓扑、PostgreSQL 通知能力以及 `output.*`、partial、取消和容量上限尚未冻结。

#### 修改方案

- 后端用可重复 fixture 和测试专用 public-output gate 验证工具决策阶段零公开正文、独立 final-answer 阶段多次公开增量。
- 使用 metadata-only 探针测量真实 `deepseek-v4-flash` 事件顺序和独立 final-answer 首字时间，不记录正文、reasoning 或工具参数。
- 采用“工具阶段结束后独立 tools-disabled final-answer 调用”，并冻结后续公共事件、partial snapshot、取消、容量与 wake-up 边界。

#### 代码变更

1. 修改 `docs/SSE/2026-11-17-daily-codex-style-sse-implementation.md` 的 Task 0，将九个检查项全部标记完成，并写入后端实现提交 `ccbb4c7` 和后端执行 Plan 路径。
2. 在 Task 0 验收结果中记录 fixture 结论：工具决策阶段的中间 content 未进入原型 public-output sink，独立 final-answer fixture 产生两个可拼接公开增量。
3. 写入真实 `deepseek-v4-flash` 两次测量值 1,940ms/2,285ms，以及 `role → reasoning → content/tool_call → finish` 的事件顺序，明确后续采用独立 tools-disabled final-answer 调用。
4. 写入单 `agent-api` Conversation 拓扑、PostgreSQL 16.14 `LISTEN/NOTIFY` 实测，以及后端 Plan 已冻结的 `partialOutput`、32,000 字符、2,048 durable delta 和 wake-up 边界。
5. 本提交只更新联合方案状态，没有修改 `src/features/chat`、BFF、Schema 固定制品或生成客户端；生产协议和浏览器链路仍属于 Task 1～7。

#### 验证结果

- 后端 `pnpm agent:test:public-answer-stream-spike`、`pnpm ts-check` 和 `pnpm agent:test:model-adapter` 通过。
- 真实探针观察到 `role → reasoning → content → finish` 与 `role → reasoning → tool_call → finish`。
- durable event store 与浏览器不泄漏仍保留为 Task 7 端到端门禁。
