# Daily Codex 式正文流实施方案

> 日期：2026-11-17  
> 状态：待联合评审  
> 范围：仅 `mode=daily`；不改变 Work/Xiaozhi 链路  
> 前端仓库：`D:\0 ysq文件\agent-hub-web`  
> 后端仓库：`D:\0 ysq文件\DSI-agent-loop`

## 目标

把 Daily 当前的“任务生命周期 SSE + 最终正文一次性出现”升级为真实的、可停止、可重连、可核对的正文增量流，交互接近 Codex：先展示安全活动摘要，再逐段展示最终回答；停止或断线时保留已生成内容；完成时由 canonical assistant message 收口。

本方案中的“流式”必须来自模型或后端真实产生的增量。禁止把完整最终答案在前端拆字播放，也禁止在生产环境回退到 mock 输出。

## 非目标与边界

- 仅实现 Daily，不修改 Work 的 Xiaozhi transport、API 或 UI 语义。
- 不展示 chain-of-thought、reasoning、system prompt、内部模型事件、未审查工具参数或凭据。
- 不实现 Workflow、地图引擎、Redux、AI SDK、真实 auth 或通用多模型配置界面。
- 第一阶段不承诺跨 Turn checkpoint/resume；“重新连接输出流”和“继续生成一个已停止 Turn”是两件事。
- 不修改 `S:\Projects\projects_new`。
- 前后端应在各自仓库、各自分支和各自测试门禁下实施；本文件只是联合方案，不扩大 `agent-hub-web` 的 frontend-only 修改边界。

## 架构原则

1. canonical message 是最终权威；delta 是构建它的可重放增量。
2. 同一个 `messageId` 的 delta 只能按序追加，不允许前端猜测替换关系。
3. SSE 断线不重新执行模型；只能按 cursor 重放，或重新加载 snapshot。
4. 工具/生命周期事件和正文事件共享可证明的顺序关系。
5. 模型产生的 reasoning 字段永不进入公共事件和浏览器。
6. 后端积累的最终正文必须与完成时持久化的 assistant message 字节一致。
7. 增量按时间或大小批处理，避免逐 token 写数据库和逐 token React render。
8. `content` 字段本身不代表可公开；只有 Agent Loop 明确进入 final-answer 阶段后才能产生公共正文事件。
9. 安全清理先于 durable event 写入和 SSE 投递，最终消息只从同一份已公开文本累积得到。

---

## 一、建议的输出样式

### 1. 等待与工具阶段

用户发送后立即创建当前助手输出区域，不先渲染一个永久空白的 assistant 消息。界面按任务是否实际进入工具阶段采用不同节奏：

| 场景 | 用户看到的效果 |
| --- | --- |
| 普通问答 | 请求发出后显示低调等待状态；首批正文到达后，等待状态直接让位给正文，不保留执行过程入口。 |
| 查询知识库、调用工具 | 等待时原地更新一条具体状态，例如“正在查询知识库…”；正文开始后，将实际工具活动折叠到正文上方的“查看执行过程”。 |
| 生成中 | 正文在同一位置逐批增长；用户在底部附近时跟随输出，主动向上滚动后保留阅读位置；停止按钮位于输入区。 |
| 断线、停止或失败 | 已显示正文保留在原位；断线提供“重新连接”，主动停止显示“生成已停止”，失败显示具体且可处理的脱敏原因。 |

普通问答正文尚未开始时，只显示一条低调等待状态：

```text
AI  智能体平台

● 正在分析请求…
```

工具执行时原地替换当前活动，不连续堆叠重复状态：

```text
● 正在查询知识库…
● 正在使用工具…
```

规则：

- 同时只显示一个当前活动。
- 不默认展示“已完成 N 个步骤”；步骤总数不作为主要阅读信息。
- 只有实际发生过工具活动时，正文开始后才显示“查看执行过程”入口。
- “查看执行过程”只允许展示经过白名单映射的工具显示名、阶段和成功/失败状态。
- 不展示模型推理、原始 tool input/output、内部服务名、Token、Cookie 或错误对象。
- 活动区使用 `aria-live="polite"`，但相同文案不得反复播报。

### 2. 正文流式阶段

第一个真实正文 delta 到达后，普通问答的等待状态直接消失；工具任务的活动区折叠为按需展开的“查看执行过程”。正文在同一个 assistant 输出区域中逐段生长：

```text
[查看执行过程]  // 仅实际发生过工具活动时显示

根据当前数据，风险主要集中在……▍
```

视觉与交互规则：

- assistant 正文保持现有无气泡、左对齐样式；用户消息继续使用用户气泡。
- 首批正文立即渲染；后续增量每 40–80ms 合并一次，默认 60ms。
- 只在当前未完成正文末尾显示低调流式光标；完成、停止、失败和断线后移除。
- 首版先保证真实增量、停止保留和断线续接；稳定 Markdown block 缓存与代码块渲染优化在真实长回答证明存在瓶颈后再纳入性能门禁。
- 未闭合代码围栏必须安全展示，不得因语法高亮阻塞首版真实流式链路。
- 用户位于底部附近时自动跟随；用户主动向上滚动后停止自动滚动，并显示“回到底部”。
- delta 不得触发整个消息列表重新挂载，也不得改变既有消息的 selection snapshot。

### 3. 完成、停止、失败与断线

完成时移除光标，canonical `message.created` 替换或核对 draft，并显示消息操作区：

```text
[复制] [重新生成]
```

第一阶段必须实现：

- 复制完整正文。
- 重新生成一个新 Turn；不得复用旧 Turn 的 event cursor。
- 完成后正文和历史刷新结果一致。

停止时：

```text
生成已停止
[重新生成]
```

- 保留已经确认的 partial 正文。
- 不显示“继续生成”，直到后端具备明确的 checkpoint/resume 契约。

断线时：

```text
连接已中断，已保留当前内容
[重新连接]
```

- “重新连接”只恢复 SSE，并从最后应用的 cursor 继续。
- 不重新提交 Turn，不重新运行模型。
- 如果服务器声明 cursor 过期，加载新 snapshot；已有可读正文在完成核对前不得静默消失。

失败时：

- 保留服务端已经确认的 partial 正文。
- 展示稳定、脱敏的错误文案。
- 区分“模型失败”“能力不可用”“认证失效”“事件流断线”，但不显示上游原始异常。

### 4. 可访问性与性能验收

- `prefers-reduced-motion` 下禁用光标闪烁和不必要动画。
- 一次连续回答不得因每个 token 产生一次 React commit。
- 10,000 字回答期间输入框、停止按钮和滚动保持可响应。
- 屏幕阅读器按合并后的语义段落播报，不能逐 token 播报。
- 移动端至少保证正文、停止、重连和回到底部可用；本方案不新增移动端专项视觉范围。

---

## 二、建议的事件协议

### 1. 公共事件

在现有 `ConversationPublicEvent` 中增加三类事件，命名保持与 `message.created`、`turn.started` 一致的点分风格：

```ts
type ConversationOutputStartedEvent = {
  type: "output.started";
  conversationId: string;
  eventSeq: string;
  turnId: string;
  taskId: string;
  messageId: string;
  payload: {
    mode: "append";
  };
};

type ConversationOutputDeltaEvent = {
  type: "output.delta";
  conversationId: string;
  eventSeq: string;
  turnId: string;
  taskId: string;
  messageId: string;
  payload: {
    outputSeq: string;
    delta: string;
  };
};

type ConversationOutputCompletedEvent = {
  type: "output.completed";
  conversationId: string;
  eventSeq: string;
  turnId: string;
  taskId: string;
  messageId: string;
  payload: {
    outputSeq: string;
    charCount: number;
    contentSha256: string;
  };
};
```

约束：

- `messageId` 在 `output.started` 前预分配，并在最终 `message.created` 中复用。
- `eventSeq` 继续作为 conversation 级总顺序，纳入现有补洞和重放逻辑。
- `outputSeq` 是当前 `messageId` 内从 `1` 开始的连续十进制字符串。
- `delta` 是 UTF-8 文本的追加片段；禁止发送全量正文冒充 delta。
- `delta` 必须已经通过支持跨 chunk 边界的流式安全清理；事件库和 SSE 中不得出现清理前文本。
- 单个 delta 建议不超过 8 KiB，Schema 必须设置明确上限。
- 空 delta、重复 `outputSeq`、跳号、完成后继续 delta 都是协议错误。
- `contentSha256` 用于前后端诊断和测试核对，不作为浏览器安全边界。

### 2. 正常事件顺序

无工具回答：

```text
turn.queued
turn.started
output.started
output.delta × N
output.completed
message.created
turn.completed
```

带工具回答：

```text
turn.started
tool.started
tool.completed
...
output.started
output.delta × N
output.completed
message.created
turn.completed
```

完成事务必须保证：

- `output.completed`、最终 `message.created`、`turn.completed` 的相对顺序固定。
- `message.created.payload.message.content.text` 等于所有 delta 按 `outputSeq` 拼接的文本。
- `messageId`、`turnId`、`taskId` 全部匹配。
- canonical message 不一致时前端以 canonical message 为准，同时记录脱敏的 consistency error。

### 3. 停止与失败顺序

用户取消：

```text
output.delta × N
turn.cancelling
turn.interrupted
```

取消后不发送 `output.completed`。是否把 partial 写入历史需要明确：本方案选择“保留可重放 partial，但不创建 completed assistant message”；snapshot 增加 `activeOutput` 或 `partialOutput` 投影，使刷新后仍可显示已确认片段，并标记为 interrupted。

模型失败：

```text
output.delta × N   // 可选
turn.failed
```

失败同样不得伪造 `output.completed`。partial 是否存在由 snapshot 投影如实返回。

### 4. 重连、幂等与补洞

- 继续复用 `Last-Event-ID = conversationId:eventSeq`。
- 前端只在本地持有与投影绑定的 `appliedSeq`；不能单独持久化孤立 cursor。
- 重放到重复 `eventSeq` 时忽略；收到跳号时先走现有 REST `/events` 补洞。
- REST 事件页和 SSE 必须返回完全相同的 output event schema。
- cursor 过期返回现有 `RESYNC_REQUIRED`；前端重新加载 snapshot，再从 snapshot watermark 建流。
- snapshot 增加当前输出投影时，必须带 `messageId`、最后 `outputSeq`、partial content、Turn 状态和 watermark。
- reconnect、snapshot reload、REST gap repair 都不得触发模型再次运行。

### 5. 分块、存储与投递策略

不按单 token 持久化。后端 output accumulator 使用以下任一条件 flush：

- 距上次 flush 达到 80–120ms；或
- 缓冲达到 1–4 KiB；或
- 检测到稳定段落边界；或
- 收到完成、取消、失败信号。

推荐把批量后的 `output.delta` 作为 durable conversation event 写入现有事件存储，以复用 `eventSeq`、REST 补洞和 SSE 重放。为避免当前固定轮询造成接近 1 秒的视觉延迟，事件流增加 commit 后的定向 wake-up；数据库轮询保留为跨进程和通知丢失时的兜底。

如果生产部署为多进程，必须在实现前确认 wake-up 机制：

- 优先使用 PostgreSQL `LISTEN/NOTIFY` 或等价的共享通知；
- 不能依赖仅进程内 EventEmitter 作为唯一投递机制；
- 通知只负责唤醒，事件正文仍从 durable store 读取。

### 6. 模型流安全边界

当前 Agent Loop 的模型调用同时承担“选择工具”和“生成最终答案”。同一次调用可能先产生 `content`，随后才发起工具调用；因此，第一个 `content` 到达不等于已经进入公开最终回答阶段。直接转发 provider 的所有 chunk，或只过滤 reasoning/tool-call 字段，仍可能把工具决策过程中的文本提前公开。

实施前必须完成一个 RED/Spike 验证，确认实际 OpenAI-compatible 上游在以下场景的 chunk 结构：

- 普通最终回答；
- native tool call；
- content 与 tool call 混合；
- 先收到 content、随后收到 tool call；
- reasoning/content 分离；
- 流中断与 provider error。

Agent Loop 必须把“可以公开输出”定义为明确、可测试的阶段边界，并按场景选择路径：

- 本轮明确无需工具时，直接进入 final-answer 阶段；首批通过安全清理的公开正文到达后立即发送。
- 本轮可能使用工具时，先完成工具决策与执行，只向浏览器发送安全活动状态；确认工具阶段结束后，再进入 final-answer 阶段，并在该阶段关闭工具调用。
- 如果上游能在任何正文产生前可靠标识 final-answer 阶段，可以安全复用同一次调用；否则使用单独一次流式 final-answer 调用，接受工具型问答首字时间增加，不能以提前公开不确定 content 换取低延迟。

推荐实现独立的 `PublicAnswerStream` 适配层：

- 只接收经过 Agent Loop 判定为公开最终回答的 text delta。
- 丢弃 reasoning、tool-call argument delta 和 provider metadata。
- 安全清理必须发生在 `output.delta` 写入 durable event store 和发送 SSE 之前；清理器必须保留足够的跨 chunk 尾部状态，覆盖敏感字符串横跨两个或多个 chunk 的情况。
- 同时把同一份已清理、已公开的 delta 累积为最终 `finalAnswer`；最终落库不得再次生成、改写或从未清理文本重建。
- 如果现有模型接口无法在流开始前证明内容是公开最终回答，则暂停正文协议实施并评审 Agent Loop 的 final-answer 阶段；不得用完整结果拆字作为替代。

---

## 三、现有前端完成情况

### 能力明细

| 能力 | 现状 | 评估 |
| --- | --- | --- |
| Daily canonical conversation 路由 | Daily 正常场景已固定使用 `DailySessionView` 和 canonical client，不再走旧 `projects-new` | 完成 |
| Daily SSE 获取与解析 | 已使用 `fetch` 读取 `text/event-stream`，有独立 parser 和 Zod 公共事件校验 | 完成 |
| `eventSeq` 与 `Last-Event-ID` | 已校验 conversation-scoped cursor，并在重连时携带最后事件 ID | 完成 |
| SSE 断线后的 REST 补洞 | 检测 sequence gap 后通过 `/events` 修复，再应用实时事件 | 完成度高 |
| Snapshot/RESYNC 恢复 | 已支持 snapshot watermark、cursor 过期和重新安装 projection | 完成度高 |
| Daily 生命周期状态 | 已覆盖 queued、running、cancelling、completed、failed、interrupted | 完成 |
| Daily 工具活动摘要 | 已消费 `tool.started/tool.completed`，UI 只显示安全通用文案 | 基本完成 |
| Daily 取消和手动重连 | 已接 canonical cancel；断线后提供重新连接，且不会自动重提 Turn | 完成度高 |
| 统一 `answer.delta` 状态模型 | 通用聊天 reducer 已有，但 canonical Daily reducer 未使用 | 可复用、未接入 |
| 40–80ms delta 合并 | `useBatchedDeltas` 已有，默认约 60ms；Daily controller 尚未接入 | 可复用、未接入 |
| Markdown/GFM 渲染 | 已使用 `react-markdown` + `remark-gfm`，表格支持横向滚动 | 基本完成 |
| Daily 正文 delta | Schema、SSE event union、reducer 都没有 `output.delta` | 未开始 |
| Daily current output draft | 没有 `messageId/outputSeq/content/status` draft，也没有 canonical 内容核对 | 未开始 |
| partial message 的停止/失败恢复 | Daily 停止只改变 Turn 状态，没有可刷新恢复的正文 partial projection | 未完成 |
| Daily streaming composer 状态 | `composerStatus` 只区分 submitting/working，尚无 streaming | 未完成 |
| 流式自动滚动与用户滚动接管 | chat 组件中未发现 scroll anchor、用户滚动锁或“回到底部” | 未完成 |
| 流式光标与稳定 Markdown block | 未发现 streaming caret；当前每次以完整 content 重新执行 Markdown 渲染 | 未完成 |
| 消息复制、代码复制、反馈栏 | `MessageList`/`MessageContent` 未提供相关操作 | 未完成 |

### 关键证据

- Daily/Work 分流位于 `src/app/chat/page.tsx:40-48`；Daily canonical view 的渲染入口位于 `src/app/chat/page.tsx:89-99`。
- Daily SSE 请求、`Last-Event-ID` 和 parser 消费位于 `src/features/chat/transports/daily-session-client.ts:281-324`。
- SSE frame parser 入口位于 `src/features/chat/transports/conversation-sse.ts:16`，输出会经过 `ConversationPublicEventSchema` 校验。
- sequence gap 异常定义和严格连续检查位于 `src/features/chat/session/daily-conversation-reducer.ts:87-96`、`:287-294`；补洞流程位于 `src/features/chat/session/use-daily-conversation.ts:181-255`。
- Daily reducer 当前只在完整 `message.created` 到达时安装消息，见 `src/features/chat/session/daily-conversation-reducer.ts:332-351`；工具事件处理见 `:366-381`。
- 通用 40–80ms batching 位于 `src/features/chat/use-batched-deltas.ts:10-64`，默认 delay 的钳制位于 `:22`，但 `DailySessionView/useDailyConversation` 没有调用它。
- Markdown/GFM 渲染位于 `src/components/chat/message-content.tsx:1-22`；消息列表只渲染正文和 ActivityLine，见 `src/components/chat/message-list.tsx:15-39`。
- Daily composer 状态映射位于 `src/components/chat/daily-session-view.tsx:178-182`，当前没有返回 `streaming`。
- 对 chat 组件和 Daily controller 的检索未发现 `scrollIntoView`、`scrollTop`、Clipboard API 或 streaming caret 实现，因此自动滚动接管与复制操作仍属缺口。

### 前端估算

| 层次 | 完成度 | 说明 |
| --- | ---: | --- |
| SSE 可靠传输与恢复 | 85% | cursor、补洞、重连、snapshot 已有 |
| Daily 生命周期状态机 | 80% | 缺 output draft 和 partial terminal 语义 |
| 正文 delta 消费 | 10% | 可复用通用 batching，但 Daily 未接入 |
| Codex 式展示体验 | 35% | Markdown/活动行已有，滚动与操作区不足 |
| Daily 前端总体 | 约 50% | 基础牢固，正文流主路径未实现 |

### 预计修改文件

- `src/features/chat/conversation/contracts/schema/conversation.v1.json`（由后端权威 Schema 同步）
- `src/features/chat/conversation/contracts/generated/*`（生成，不手改）
- `src/features/chat/transports/daily-session-contract.ts`
- `src/features/chat/session/daily-conversation-reducer.ts`
- `src/features/chat/session/use-daily-conversation.ts`
- `src/features/chat/session/daily-session-adapter.ts`
- `src/components/chat/daily-session-view.tsx`
- `src/components/chat/message-list.tsx`
- `src/components/chat/message-content.tsx`
- `src/app/globals.css`
- 对应 unit/component/E2E tests

---

## 四、现有后端完成情况

### 能力明细

| 能力 | 现状 | 评估 |
| --- | --- | --- |
| Canonical Conversation/Turn/Message | 已有独立表、repository、projection 和事务边界 | 完成 |
| Durable conversation event store | 生命周期、消息和工具事件持久化后可由 REST/SSE 重放 | 完成 |
| Conversation 级顺序 | 已使用连续 `eventSeq`，SSE 按 cursor 逐条投递且不跳过 gap | 完成度高 |
| SSE 心跳与背压 | 已有 heartbeat、drain timeout、慢客户端清理和连接数限制 | 完成度高 |
| SSE 代理友好响应头 | 已设置 `no-store, no-transform` 和 `X-Accel-Buffering: no` | 完成 |
| Turn 取消、lease 与恢复 | 已有 cancelling/interrupted、lease 校验、进程恢复和 terminal conflict 防护 | 完成度高 |
| 工具生命周期事件 | 公共契约已有 `tool.started/tool.completed` | 完成 |
| 最终 assistant message 事务收口 | 完成时一次写入完整正文、`message.created` 和 `turn.completed` | 完成 |
| 敏感信息清理 | Conversation executor 在结果落库前使用 credential redactor | 基本完成 |
| Provider 模型流 | OpenAI-compatible 请求固定 `stream: false` | 未开始 |
| Gateway 流接口 | `ModelGatewayLike.generate()` 返回完整 Promise，没有 AsyncIterable/stream 方法 | 未开始 |
| Agent Loop 公开正文流 | `runAgentLoop` 只返回完整结果，没有安全 public delta sink | 未开始 |
| `output.*` 公共事件 | event union 没有 started/delta/completed，OpenAPI 明确不支持 token-delta replay | 未开始 |
| partial output durable projection | 没有 partial message、最后 `outputSeq`、hash 或 snapshot 投影 | 未开始 |
| 低延迟事件唤醒 | conversation stream 默认约 1 秒轮询，未发现 commit 后共享 wake-up | 未完成 |
| delta 分块与容量限制 | 没有正文 accumulator、chunk 上限、flush 规则和写放大控制 | 未开始 |
| 流式完成一致性核对 | 只校验完整 `finalAnswer` 与 task result；尚无 `join(deltas)` 核对 | 未开始 |

### 关键证据

- 公共事件 union 目前包含 `message.created`、Turn 和工具事件，但没有任何 output/delta 事件，见 `packages/shared/src/types/conversationEvents.ts:14-36`。
- Conversation SSE 的 durable frame、严格 cursor 投递、背压和心跳位于 `api/src/modules/conversations/eventStream.ts:17-113`。
- SSE 默认 `pollMs` 为 1000ms，见 `api/src/modules/conversations/eventStream.ts:25`；响应头位于 `:133-136`。
- Provider 请求明确设置 `stream: false`，见 `api/src/modules/agent-loop/model/providers/openaiCompatible.ts:22-31`。
- Gateway 等待一次性 `provider.generate()`，见 `api/src/modules/agent-loop/model/modelGateway.ts:78-79`；接口本身返回 `Promise<NormalizedModelResponse>`。
- Conversation executor 在 `api/src/modules/conversations/executor.ts:114-126` 等待完整 `runAgentLoop` 结果，随后构造完整 `TurnOutcome`，没有 delta callback。
- `TurnOutcome` 只支持完整 `finalAnswer`，见 `api/src/modules/conversations/executionStore.ts:18-26`。
- 完成事务在 `api/src/modules/conversations/executionStore.ts:188-236`；完整正文写入位于 `:219`，随后写 `message.created` 和 `turn.completed` 位于 `:227-231`。
- OpenAPI transport rule 明确写着 `No token-delta replay`，见 `api/src/modules/conversations/openapi.ts:103`。
- 当前 SSE 正确性依赖 durable store 读取；代码中没有跨进程 commit notification 或 output chunk accumulator，因此低延迟 wake-up 和正文分块仍需新增。

### 后端估算

| 层次 | 完成度 | 说明 |
| --- | ---: | --- |
| Durable conversation/event 基础 | 90% | 可复用现有顺序、重放和事务边界 |
| 模型 Provider/Gateway 流 | 0% | 当前固定 `stream: false` |
| Agent Loop 公开正文流 | 0% | 尚无安全 public delta 边界 |
| output event 与 partial projection | 5% | 只有最终 message/event 基础 |
| 取消、恢复、幂等基础 | 80% | 需要扩展到 partial output |
| Daily 后端总体 | 约 35% | 可靠底座已有，正文生产链尚未开始 |

### 预计修改文件/模块

- `packages/shared/src/types/conversationEvents.ts`
- `packages/shared/src/types/conversation.ts`
- `api/src/modules/agent-loop/model/types.ts`
- `api/src/modules/agent-loop/model/providers/openaiCompatible.ts`
- `api/src/modules/agent-loop/model/modelGateway.ts`
- `api/src/modules/agent-loop/model/clients/agentModelClient.ts`
- `api/src/modules/agent-loop/runAgentLoop.ts`
- `api/src/modules/conversations/executor.ts`
- `api/src/modules/conversations/executionStore.ts`
- `api/src/modules/conversations/eventStream.ts`
- `api/src/modules/conversations/projections.ts`
- `api/src/modules/conversations/openapi.ts`
- 数据库 migration（若 partial/output event 需要新字段或独立投影表）
- 对应 provider、Loop、conversation contract、execution、SSE、crash/recovery tests

---

## 五、剩余实施顺序

以下 Task 必须按顺序推进。行为变更遵循 TDD：先写失败测试，再做最小实现。公共契约变更先由后端生成权威 Schema，前端只同步和生成客户端。

### Task 0：联合契约与上游流 Spike

**目标：** 在修改公共 API 前，用最小原型证明上游真实 chunk 顺序和 Agent Loop 的公开输出边界，并冻结 output 事件设计；本阶段不依赖尚未建设的 durable event 或浏览器链路。

- [ ] 在后端为普通回答、tool call、混合 chunk、reasoning、取消和网络中断建立 provider fixture。
- [ ] 增加“先收到 content、随后收到 tool call”的强制 fixture，覆盖最危险的延迟工具决策顺序。
- [ ] 写失败测试，证明当前 provider `stream: false` 且无法产生正文 delta。
- [ ] 用原型 public-output sink 验证目标模型及 Agent Loop 是否能在任何公开文本产生前可靠区分 final-answer、reasoning、普通 content 和 tool-call arguments。
- [ ] 记录实际上游在各 fixture 中的事件顺序，并证明 public-output sink 只收到工具阶段结束后的最终正文。
- [ ] 判断工具型问答能否安全复用同一次调用；若不能，记录无法复用的具体原因，采用工具阶段结束后的独立 final-answer 流，并测量该独立调用的首字时间。无法安全复用本身不是 Task 0 失败。
- [ ] 确认单进程/多进程部署形态以及 PostgreSQL 通知能力。
- [ ] 联合评审 `output.*` schema、partial snapshot、取消语义和容量上限。
- [ ] 更新后端 approved Plan；此 Task 未通过前不得开始浏览器协议实现。

**验收：** 有可重复 fixture 和上游事件顺序记录；在“先 content、后 tool call”fixture 中，原型 public-output sink 从未收到中间文本，只收到工具阶段结束后的最终正文增量。若同一次调用无法安全复用，文档已记录原因、选定独立 final-answer 调用，并报告其首字时间。durable event store 与浏览器的不泄漏由 Task 7 在真实链路上验收。

### Task 1：后端模型流原语

**目标：** 增加内部流接口，同时不影响现有非流 JSON/工具调用。

- [ ] 为 `ModelProviderAdapter` 增加独立 stream 方法或独立 streaming adapter，保留现有 `generate()`。
- [ ] 实现 OpenAI-compatible SSE parser，覆盖任意网络分块、UTF-8 边界、多行 data、`[DONE]`、error 和 abort。
- [ ] 在 Gateway 层保留 timeout、并发限制、取消和安全日志；明确流开始后不得自动重试并重复输出。
- [ ] 只向上层暴露 normalized provider events，不暴露原始响应对象。
- [ ] 为 reasoning、content、tool call 和 usage 分别建类型。

**测试：** provider parser、gateway timeout/abort、首 chunk 前重试、首 chunk 后禁止透明重试、敏感数据扫描。

### Task 2：Agent Loop 公开正文流边界

**目标：** 建立明确的 final-answer 阶段，只把该阶段中最终用户可见的正文转换为 `PublicAnswerStream`。

- [ ] 写失败测试：reasoning、工具参数和内部 JSON 不得进入 public delta。
- [ ] 写失败测试：同一次调用先产生 content、随后产生 tool call 时，先前 content 不得进入 public delta。
- [ ] 在 Agent Loop 中建立 public final-answer sink/AsyncIterable。
- [ ] 为“明确无需工具”和“可能使用工具”建立显式分支；后者在工具阶段结束前不得打开 public sink。
- [ ] final-answer 阶段必须关闭工具调用；若上游无法提前可靠标识该阶段，则使用独立流式 final-answer 调用。
- [ ] 每次已清理的公开输出同时 append 到 accumulator，最终 `finalAnswer` 只能来自该 accumulator。
- [ ] 工具 Turn 在 final-answer 阶段前继续使用现有安全活动事件，不把任何模型中间 content 当最终正文。
- [ ] cancel signal 必须中断 provider、停止新 delta，并返回 interrupted outcome。
- [ ] 明确 provider 在部分输出后失败时的 outcome 和 partial 保留规则。

**验收：** 所有完成 Turn 都满足 `join(cleanedDeltas) === finalAnswer`；所有工具、延迟 tool call、reasoning 和跨 chunk 敏感字符串 fixture 都无泄漏。

### Task 3：Durable output event 与 partial 投影

**目标：** 让正文增量可排序、可补洞、可重连、可在 snapshot 中恢复。

- [ ] 扩展 shared Zod schema 和 OpenAPI，加入 `output.started/delta/completed`。
- [ ] 预分配 assistant `messageId`，并贯穿 output 和最终 message。
- [ ] 在 durable event 写入前执行有界、可流式的安全清理，并覆盖敏感字符串跨两个或多个 provider chunk 的测试。
- [ ] 实现 80–120ms/大小/段落边界 accumulator flush。
- [ ] 批量写 durable output events，并分配连续 conversation `eventSeq`。
- [ ] 增加 partial output projection，覆盖 running/interrupted/failed snapshot。
- [ ] 完成事务写 `output.completed + message.created + turn.completed`，核对长度和 SHA-256。
- [ ] 为单 Turn 最大字符数、最大 chunk 数、事件保留和清理设置硬上限。
- [ ] 扩展 crash、lease loss、取消、重复 finish 和 transaction response-loss 测试。

**验收：** 任意时刻崩溃后不会重复执行模型；重放可恢复到最后 committed chunk；event store、SSE 和最终消息只包含同一份已清理公开文本，完成消息与 delta 完全一致。

### Task 4：低延迟 SSE 投递与 BFF 验证

**目标：** committed delta 通常在 200ms 内到达浏览器，同时保留 durable fallback。

- [ ] 为 event stream 增加 commit 后定向 wake-up。
- [ ] 多进程使用共享通知；数据库轮询仅作兜底。
- [ ] 验证 REST `/events` 与 SSE 返回同一 output schema。
- [ ] 验证心跳、背压、慢客户端断开和连接限额不会阻塞 Turn 执行。
- [ ] 验证 `/agent-api`/网关透传 streaming body、`Last-Event-ID`、content type、`no-transform` 和 `X-Accel-Buffering`。
- [ ] 增加 commit-to-browser、final-answer 阶段开始到首批正文可见、chunk 间延迟和慢客户端指标，但不记录正文内容。

**验收：** 本地/测试环境 p95 commit-to-browser 延迟小于 200ms；同时单独报告“final-answer 阶段开始 → 首批正文可见”的 p50/p95，区分模型首字时间与事件投递时间；通知丢失时仍能通过轮询恢复。

### Task 5：前端 Schema 同步与 Daily reducer

**目标：** Daily 能以严格状态机消费 output events。

- [ ] 先更新后端权威 Schema，再运行前端 conversation client generator/check。
- [ ] 为 reducer 写 `output.started/delta/completed` RED tests。
- [ ] 增加 `activeOutput`：`messageId`、`turnId`、`lastOutputSeq`、content、status。
- [ ] 拒绝 message/turn 不匹配、`outputSeq` 跳号和完成后 delta。
- [ ] 重复 event 幂等忽略；conversation `eventSeq` 跳号继续走现有 REST 补洞。
- [ ] canonical `message.created` 到达时核对并收口 draft。
- [ ] snapshot 安装、重连、RESYNC、取消、失败时正确恢复或保留 partial。

**测试：** reducer、adapter、hook、snapshot/stream race、REST/SSE 交错、旧页合并、身份切换和 abort。

### Task 6：前端 batching 与 Codex 式输出 UI

**目标：** 把真实 Daily delta 平滑呈现，不伪造、不抖动。

- [ ] 在 Daily controller 中复用或抽取现有 `useBatchedDeltas`。
- [ ] 首批正文立即渲染，后续 delta 按约 60ms 合并；非 delta 事件前 drain buffer，完成、停止、失败和断线时立即 flush。
- [ ] 给 `MessageList`/`MessageContent` 增加 streaming、partial、interrupted 状态。
- [ ] 普通问答在正文开始后移除等待状态；只有实际工具活动时才显示可展开的“查看执行过程”，不默认显示步骤总数。
- [ ] 实现流式光标和 `prefers-reduced-motion`。
- [ ] 实现底部跟随、用户滚动接管和“回到底部”。
- [ ] 实现复制正文、代码复制和重新生成。
- [ ] 记录真实长回答的 React commit 和渲染性能；仅在数据证明存在瓶颈时，再把稳定 Markdown block 缓存和代码块优化提升为首版门禁。
- [ ] composer 在 `streaming` 中显示停止按钮，断线后显示重连而不是重新发送。

**测试：** 首批立即渲染、后续 60ms batching、工具过程按需展开、10k 字、用户滚动、复制、停止保留正文、可访问性；partial Markdown 与代码围栏至少保证安全和可读，不以高级缓存实现作为首版通过条件。

### Task 7：端到端与故障验收

**目标：** 在真实 Daily contract 上证明端到端流式和恢复语义。

- [ ] Playwright 优先验收正文至少发生两次真实增长，且增长来自多个真实 `output.delta`，不是前端拆字。
- [ ] 验证最终刷新后历史正文与流式拼接一致。
- [ ] 验证中途停止后没有后续 delta，半截正文在刷新后仍可见。
- [ ] 验证 SSE 中断后重连不重复文本、不重复模型执行。
- [ ] 验证普通问答正文开始后没有执行过程入口；工具任务正文开始后可按需展开安全活动详情。
- [ ] 在真实链路中验证“先 content、后 tool call”的中间文本既未写入 durable event store，也未到达浏览器。
- [ ] 验证工具完成后的最终正文产生多个真实 `output.delta`，并在浏览器中至少分两次增长显示。
- [ ] 验证 event gap 经 REST 修复后继续输出。
- [ ] 验证 `RESYNC_REQUIRED` 重新安装 snapshot 后不丢失可读正文。
- [ ] 验证认证失效、能力撤销、模型失败和慢客户端。
- [ ] 验证 Work 模式无行为和视觉回归。

**最终门禁：**

后端仓库至少执行 conversation/provider/Agent Loop focused tests、API typecheck、Schema/OpenAPI drift、相关安全测试和全量要求；前端仓库执行 focused Vitest、`pnpm lint`、`pnpm typecheck`、`pnpm test`、Daily canonical Playwright、默认 Playwright 和 `pnpm build`。只有实际观察到全部通过后才能声明完成。

## 完成定义

- Daily 的正文来自真实模型增量，而不是客户端拆字。
- Agent Loop 只在明确进入 final-answer 阶段后公开正文；普通 content 不被默认视为最终回答。
- 正文开始、追加、完成、取消、失败、断线和重连都有明确协议和 UI 状态。
- `join(output.delta) === canonical assistant message` 有自动化测试保证。
- 断线重连不重复执行模型、不重复正文、不跳过事件。
- reasoning、工具决策过程中的 content、工具参数、凭据和内部错误不进入浏览器、公共事件或日志。
- 安全清理发生在事件持久化和 SSE 投递之前，并正确处理跨 chunk 敏感字符串。
- Work 模式无回归。
- 前后端 Schema、生成客户端、OpenAPI 和部署文档一致。

## 风险与评审点

1. **最大风险：模型流与工具决策混合。** `content` 可能先于 tool call 到达；若无法在输出前证明已经进入 final-answer 阶段，必须使用独立最终回答阶段，不能直接透传。工具型问答增加首字延迟是可接受的安全代价，并应被单独测量。
2. **事件写放大。** 必须批量 chunk，并设置字符数、chunk 数和保留上限。
3. **当前 1 秒轮询延迟。** 必须增加共享 wake-up，不能只把 poll interval 调得很小。
4. **取消竞态。** cancel、provider 尾包和 terminal transaction 必须由 lease/Turn 状态裁决。
5. **partial 历史语义。** interrupted/failed partial 必须显式标记，不能伪装成 completed assistant message。
6. **多进程通知。** 进程内广播只能作为优化，不能成为 correctness 依赖。
7. **范围冲突。** 本方案是新的 Daily conversation 公共协议工作，不属于现有 Skill Market 前端计划；实施前需要单独批准的跨仓库 Plan。
8. **跨 chunk 安全清理。** 逐 chunk 无状态脱敏可能漏掉被拆开的敏感字符串；清理器必须有有界尾部状态，并在 durable event 写入前完成裁决。
