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

### 4. 完成 Task 1 后端模型流原语

提交：前端暂未提交；后端实现 `c34028d`

Plan 文档：`docs/SSE/2026-11-17-daily-codex-style-sse-implementation.md`

后端执行 Plan：`D:\0 ysq文件\DSI-agent-loop\docs\SSE\2026-11-19-daily-model-stream-primitives.md`

对应 Plan 模块：Task 1

#### 问题

- 联合方案中的 Task 1 尚未有完成证据，前端计划无法确认后续 Task 2 可依赖哪些后端流接口和安全语义。
- 需要明确 Task 1 只提供内部模型流原语，不代表 Agent Loop 已公开正文，也不代表 durable event 或浏览器链路已经可用。

#### 修改方案

- 将 Task 1 五项检查标记完成，并关联后端实现提交与批准执行 Plan。
- 记录 provider parser、Gateway retry/timeout/abort/concurrency 和敏感日志测试证据。
- 保持 Task 2～7 未完成，明确 Agent Loop final-answer gate、Conversation 协议、浏览器展示仍未接通。

#### 代码变更

1. 修改 `docs/SSE/2026-11-17-daily-codex-style-sse-implementation.md` 的 Task 1，将 provider stream、OpenAI-compatible SSE parser、Gateway 生命周期、normalized event 和分类型事件五项标记为完成。
2. 在 Task 1 状态中关联后端 `c34028d feat(agent-loop): add model stream primitives` 和 `docs/SSE/2026-11-19-daily-model-stream-primitives.md`。
3. 记录后端 `NormalizedModelStreamEvent` 已区分 response lifecycle、reasoning、content、tool-call、usage 与 completion；原始 `Response`、SSE frame 和 provider JSON 不越过 adapter 边界。
4. 记录 Gateway 以首个归一化事件为透明重试边界，并在完成、错误、取消或消费者提前停止时释放 reader、timeout 和 concurrency permit。
5. 记录 Task 1 focused test 7/7、现有 model-adapter 回归与 TypeScript 严格检查通过；本仓库未修改 `src/`、BFF、Schema 固定制品或生成客户端。

#### 验证结果

- 后端先运行 `pnpm agent:test:model-streaming` 获得 RED：6 个初始用例均因 provider/Gateway 不存在 `stream()` 而失败；最小实现后重跑，最终 7/7 通过。
- provider parser 测试以逐字节网络分块覆盖中文 UTF-8 边界、CRLF/LF、comment、多行 `data:`、`[DONE]`、reasoning/content/tool-call/usage；并覆盖 malformed JSON、premature EOF、provider error、HTTP 503 脱敏和提前结束时取消 response body。
- Gateway 测试覆盖首个 normalized event 前允许重试、首事件后禁止重试、per-attempt timeout、caller abort、provider `finally`、消费者 early return，以及 maxConcurrency=1 时并发许可可被下一请求及时取得。
- 日志测试捕获 `console.log`，确认 synthetic reasoning、正文和工具参数字符串均未出现，同时仍产生 `model_stream_complete` 元数据日志。
- 后端运行 `pnpm agent:test:model-adapter`，既有非流生成、重试、超时、并发、工具调用与 facade 回归通过，并输出 `model adapter phase-one tests passed`；运行 `pnpm ts-check`，严格类型检查无诊断。
- 后端运行 `git diff --check` 无 whitespace error；本仓仅做方案/ChangeLog 同步，Task 2～7 仍未完成，当前浏览器不会因本次文档更新获得正文流能力。

### 5. 完成 Task 2 Agent Loop 公开正文边界

提交：前端暂未提交；后端实现 `cf55ac2`、`2a5bda4`

Plan 文档：`docs/SSE/2026-11-17-daily-codex-style-sse-implementation.md`

后端执行 Plan：`D:\0 ysq文件\DSI-agent-loop\docs\SSE\2026-11-19-daily-public-answer-boundary.md`

对应 Plan 模块：Task 2

#### 问题

- Task 1 只提供 provider/Gateway 流原语，尚不能证明哪些模型片段可以作为用户正文公开。
- 工具能力开启的调用可能先产生 content、随后产生 tool call；直接接入浏览器会泄漏决策文本。
- reasoning、tool arguments、内部协议、跨 chunk 凭据及取消/失败 partial 尚无统一 Agent Loop 门禁。

#### 修改方案

- 增加显式 final-answer stage：无有效工具时直接进入流；可能使用工具时，decision call 完全私有，工具阶段结束后再发起独立 tools-disabled final stream。
- 公开 sink 只消费清理后的 content delta；reasoning、usage、provider metadata 不进入 sink，tool-call delta 和内部工具协议 fail closed。
- 通过有状态清理器覆盖跨 chunk assignment、Bearer、连接串、`sk-` key 和完整 PEM 私钥块，成功答案只由同一份已公开 accumulator 产生。
- 取消/失败不补发 safety buffer，只保留已进入 sink 的 partial；未传 public sink 的既有调用保持原行为。

#### 代码变更

1. 后端新增 `publicAnswerStream.ts`，提供内部 started/delta/completed/interrupted/failed sink 事件、协议门禁、安全清理器和公开 accumulator。
2. 后端 `AgentModelClient` 新增 tools-disabled `streamFinalAnswer()`；final policy 合并到 system prompt，Gateway request 使用空 tools 和 `toolChoice: none`。
3. 后端 `runAgentLoop.ts` 增加可选 `publicAnswerSink`，实现无工具直流和工具决策后独立 final stream；成功 `finalAnswer` 与 assistant message 不再从未公开文本重建。
4. 后端 Conversation guarded model 转发可选流能力并在每个 event 前检查 execution authority，但 Task 2 尚未给 Conversation executor 配置 sink，因此公共协议、事件库和浏览器行为不变。
5. 修改本方案 Task 2，将九项工作标记完成并关联后端 `cf55ac2`、`2a5bda4` 与执行 Plan；Task 3～7 保持未完成。
6. 本仓未修改 `src/`、BFF、Schema 固定制品、生成客户端或 UI；当前前端仍不会展示正文增量。

#### 验证结果

- 后端 RED：首次 `pnpm agent:test:public-answer-boundary` 因 boundary 模块不存在而失败；仅加入 primitive、尚未接 Loop 时，4 个 unit/model-client 用例通过而 2 个 Loop 用例失败。
- 后端 GREEN：最终同一 focused suite 9/9 通过，覆盖 reasoning/provider metadata/tool arguments 不公开、内部 tool JSON fail closed、content-then-tool decision 私有、无工具直流、工具后独立 final stream和无 sink 兼容路径。
- 同一 suite 验证 `api_key` 横跨三个 chunk 时先清理再公开，PEM 私钥块在完整 END marker 到达前不产生受影响 delta；完成答案严格等于 delta 拼接和 assistant message。
- 同一 suite 验证 caller abort/provider failure 后不 flush `token=withheld`，仅保留已公开 partial，并分别产生 interrupted/failed terminal。
- 后端 `pnpm agent:test:public-answer-stream-spike` 1/1、`pnpm agent:test:model-streaming` 7/7、`pnpm agent:test:model-adapter` 和 `pnpm ts-check` 均通过。
- Conversation execution suite 因环境未设置 disposable `SESSION_TEST_DATABASE_URL`，28 个用例均在共享 fixture 前停止，未进入产品逻辑，未记作通过或代码失败。
- 本仓仅同步文档，Task 3 的 durable event/partial projection 和 Task 4～7 的 SSE/浏览器验收仍未实现。

## 2026-11-20

### 6. 完成 Task 3 durable output event 与 partial 投影

提交：前端暂未提交；后端实现 `1d80d77`

Plan 文档：`docs/SSE/2026-11-17-daily-codex-style-sse-implementation.md`

后端执行 Plan：`D:\0 ysq文件\DSI-agent-loop\docs\SSE\2026-11-20-daily-durable-output-events.md`

对应 Plan 模块：Task 3

#### 问题

- Task 2 的公开正文只到进程内 sink，尚不能通过 Conversation event store、snapshot 或重连恢复。
- durable delta 必须在最终 assistant message 之前提交，原 `message_id` 外键无法引用尚未创建的消息。
- partial、成功收口、容量限制、进程崩溃和事务响应丢失尚无后端完成证据。

#### 修改方案

- 后端新增 output draft 与独立事件存储外键，预分配助手 `messageId` 并在成功消息中复用。
- 已清理正文按 100ms、4KiB、段落和终态批量提交，分配连续 `outputSeq` 与 Conversation `eventSeq`。
- 成功收口原子写入 `output.completed`、`message.created`、`turn.completed`；失败/中断只保留显式 partial。
- snapshot 只投影最新 Turn 的未完成 draft，避免后续成功后旧失败 partial 再次出现。

#### 代码变更

1. 后端 shared Zod 与生成 OpenAPI 新增严格 `output.started/delta/completed` 和 nullable `partialOutput`，并定义 32,000 code points、2,048 deltas、8,192 UTF-8 bytes 限制。
2. 后端 migration `0020_conversation_output_stream.sql` 新增 `conversation_output_drafts` 和 `conversation_events.output_message_id`，配套复合外键、唯一索引和 check constraints。
3. 后端新增 durable output controller/persistence，包含预分配 UUID、串行 sink、UTF-8 安全分片、定时/大小/段落 flush、连续序号、幂等响应丢失识别和晚到写入拒绝。
4. Conversation executor 接通 public sink；完成事务核对 exact content、code-point count、last output sequence 和 SHA-256 后复用 draft ID 创建 canonical assistant message。
5. event store 将内部两种消息引用统一投影为公共 `messageId`；snapshot 增加 running/interrupted/failed partial，completed draft 不作为 partial 返回。
6. 本仓只将 Task 3 九项标记完成并同步具体实现/验证证据；未修改 `src/`、前端 Schema 固定制品、生成客户端、reducer 或 UI。

#### 验证结果

- 后端契约测试先因未知 `output.*`/`partialOutput` 2/2 RED，batching 测试先因模块不存在 RED；实现后分别 2/2 和 4/4 通过。
- `test:conversations:unit` 28/28、disposable pgvector PostgreSQL 上的 migration/storage 16/16、public boundary 9/9、model streaming 7/7、OpenAPI drift 3/3 与 TypeScript strict check 全部通过；batching 用例显式覆盖 32,000 code points 与 2,048 durable delta 上限。
- execution tests 覆盖成功事件顺序、同一 ID、exact delta/message、失败 partial、后续成功清除旧 partial、terminal retry、COMMIT response-loss、lease-expiry 回滚；均通过。
- crash test 在 committed delta 后终止真实子进程；恢复后 `lastOutputSeq=1` 和 partial 原文保留，状态为 interrupted，无 assistant message/`output.completed`，模型未重跑。
- 后端 `test:conversations` 全量 305 个测试通过，新增 output crash phase 随后单独通过；`git diff --check` 无 whitespace error。
- Task 4～7 仍未完成；本次不能声称浏览器已经显示增量正文或 commit-to-browser 已达到 200ms。

## 2026-11-22

### 7. 完成 Task 4 低延迟 SSE 投递与 BFF 验证

提交：前端未修改；后端实现 `cf8d835`、证据 `ab34679`

Plan 文档：`docs/SSE/2026-11-17-daily-codex-style-sse-implementation.md`

后端执行 Plan：`D:\0 ysq文件\DSI-agent-loop\docs\SSE\2026-11-22-daily-conversation-event-wakeup.md`

对应 Plan 模块：Task 4

#### 问题

- Conversation SSE 原先最多等待 1 秒轮询，已提交的 `output.delta` 不能及时唤醒浏览器连接。
- 多进程不能依赖进程内 emitter，但共享通知失效时仍必须从 durable event store 恢复。
- BFF 增量透传、恢复请求头、慢客户端隔离和无正文时延指标缺少联合验证。

#### 修改方案

- 后端在事件提交事务内发出 PostgreSQL 通知，每个进程用专用 listener 按 conversation ID 唤醒；周期轮询继续作为正确性兜底。
- event stream 只在唤醒后读取 durable store，读取期间的新通知触发补跑；通知本身不承载公共事件正文。
- 增加 commit-to-browser、final-stage-to-first-visible、chunk interval 和 slow-client metadata-only 指标。
- 用真实 `/agent-api` 流验证响应头、增量 body、`Last-Event-ID` 恢复和慢客户端隔离。

#### 代码变更

1. 后端新增 `eventWakeup.ts`，固定 channel、UUID 校验、按会话订阅、有界重连和关闭释放均由专用 pool client 负责。
2. 后端事件分配事务加入 `pg_notify`；提交后通知、回滚无通知，REST 与 SSE 仍读取同一份 durable 公共事件。
3. 后端 event stream 接入定向 wake-up 和读取中 rerun，保留 heartbeat、连接上限、背压断开及最长 60 秒轮询兜底。
4. 后端新增无正文的时延/慢客户端指标，并把 final-answer `started` 提前到公开阶段入口。
5. 后端 server 生命周期负责启动、降级和释放 listener；BFF 继续透传 streaming body 与恢复相关请求/响应头。
6. 本仓仅同步联合方案与 ChangeLog；Task 4 未修改前端运行时代码或 Schema 固定制品。

#### 验证结果

- 后端 RED：新增 focused suite 首次因 `eventWakeup.ts` 不存在失败；最小通知实现后，指标用例因样本为 0 继续失败，分别证明通知与指标缺口被测试捕获。
- PostgreSQL 跨 pool/事务 focused tests 4/4 通过，覆盖提交前不可见、提交后唤醒、回滚无通知、60 秒轮询配置下即时投递，以及完全丢弃通知后仍由 20ms 测试轮询恢复。
- `test:conversations:events` 29/29、`test:conversations:server` 14/14 通过；后者确认 Turn 完成前已收到首个真实 `output.delta`，并验证 `text/event-stream`、`no-store, no-transform`、`X-Accel-Buffering: no` 与 `Last-Event-ID`。
- 通知驱动重复样本为 commit-to-browser p50/p95 6/7ms、commit-return-to-browser p95 22～24ms；带 40ms provider 等待的 final-stage-to-first-visible 样本为 77ms、83ms，满足 200ms 门槛。
- 慢客户端测试验证背压只断开慢连接、快连接继续收到两帧；指标仅含原因/耗时/ID，不含测试正文、delta 或 payload。
- 后端 Conversation 全量套件、8/8 crash recovery、public-answer-boundary 9/9、TypeScript 与 API lint 通过；lint 为 0 error、21 个既有 warning。
- 前端只读回归 `proxy.test.ts` 与 `daily-session-client.test.ts` 共 37/37 通过，当时未提交前端文件。

## 2026-11-23

### 8. 完成 Task 5 前端 Schema 同步与 Daily reducer

提交：前端实现 `de8f212`

Plan 文档：`docs/SSE/2026-11-17-daily-codex-style-sse-implementation.md`

权威 Schema：后端 `DSI@1d80d77e956008f1c20051cd589a3f0b41bc9ba9`

对应 Plan 模块：Task 5

#### 问题

- 前端仍固定在旧 Conversation Schema，生成类型不认识 `output.started/delta/completed` 与 snapshot `partialOutput`。
- reducer 没有公开正文草稿状态，无法校验 message/turn/task 身份、连续 `outputSeq`、完成后晚到 delta 或 canonical message 一致性。
- 断线 snapshot、REST 补洞与 SSE 增量交错时，partial 可能重复追加或丢失。

#### 修改方案

- 机械同步后端权威 OpenAPI，再运行 generator 与 drift check，前端不手写公共契约。
- reducer 增加严格 `activeOutput` 状态机；每个 delta 只按事件原文追加，不在客户端拆字或合成正文。
- snapshot partial 作为 watermark 时点的已应用草稿；历史 replay 只推进 Conversation 序号，watermark 之后才继续追加 delta。
- canonical assistant message 只有在 ID、Turn、完成状态和 exact text 全部一致时收口 draft；失败、停止和 RESYNC 保留可读 partial。

#### 代码变更

1. 更新 `conversation.v1.json`、lock 和生成客户端，新增三类严格 output event、nullable `partialOutput` 与对应 discriminated union。
2. `daily-conversation-reducer.ts` 新增 `DailyActiveOutput` 和 `ConversationOutputProtocolError`，实现 started/delta/completed、连续序号、身份、终态、code-point char count 及 canonical exact-text 校验。
3. reducer 安装 snapshot partial，并在 watermark replay、重复 event、Turn interrupted/failed 时分别避免重复追加、保持幂等和保留 partial 状态。
4. `daily-session-adapter.ts` 将非空 active output 投影为同一助手消息，标记 streaming/partial status；canonical 同 ID 消息存在时不重复投影。
5. `use-daily-conversation.ts` 把 active output 接入现有消息投影；Conversation `eventSeq` 跳号继续复用现有 REST repair，再应用已缓冲 SSE event。
6. 更新 reducer、adapter、hook、contract、client 与 view fixtures/tests；Task 6 的约 60ms UI batching、光标、滚动和停止按钮不在本次范围。

#### 验证结果

- TDD RED：新增 reducer/adapter 行为测试首次运行 5 个失败、20 个通过；失败点分别对应缺少 output 状态机、partial 恢复和消息投影。最小实现后相关用例全部转绿。
- focused suite 共 10 files、137/137 通过，覆盖 started/delta/completed 多次真实增长、Unicode code-point 完成校验、身份/序号/终态拒绝、重复事件幂等、canonical exact-text 收口与 mismatch fail-closed。
- 同一 focused suite 覆盖 snapshot partial 安装、watermark 内 replay 不重复、watermark 后续接新 delta、失败/停止保留 partial、RESYNC 后可读 stale state、旧页合并、身份切换和 abort。
- hook 的 REST/SSE 交错测试让 SSE 先收到 `output.delta`，再由 REST 补回缺失的 `output.started`，验证补洞后正文只追加一次且保持同一 message ID。
- `pnpm run verify:conversation-schema` 通过：`conversation.v1@0.1.5`、19 operations、SHA-256 `3def34f81596519dab609cc272f4cd613a61a5dad7b6b5796369707d05cc9158`；`pnpm run check:conversation-client` 确认生成客户端无 drift。
- `pnpm run typecheck` 与 `pnpm run lint` 通过；全量 `pnpm test` 为 96 files、849/849 通过。
- `pnpm run build` 首次在 Codex 沙箱内因 Turbopack 无法创建 CSS worker 子进程失败；相同命令获准在沙箱外重跑后成功编译、类型检查并生成 14/14 静态页面，确认不是代码构建错误。
- `git diff --check` 通过；Task 6、Task 7 仍未完成，不能声称约 60ms 前端 batching、最终 UI 交互或真实浏览器多次增长端到端验收已经完成。
