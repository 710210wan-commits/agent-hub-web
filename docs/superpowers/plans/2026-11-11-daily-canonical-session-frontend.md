# Daily Canonical Session Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留全局 `AuthProvider`，让 Daily Chat/History 使用同一身份，并接入 canonical conversation 的 turn、持久事件 SSE、恢复与 cancel；KB 只做 Task 6 回归；最后完成跨页面 E2E。

**Architecture:** 全局认证是唯一身份源。Daily conversation 使用独立 canonical client + 投影 reducer：snapshot 安装规范消息，REST events 恢复历史状态，fetch-SSE 只接收后续持久事件；UI 仅展示最终正文及一行安全活动提示。Work/Xiaozhi 路径保持不变。

**Tech Stack:** Next.js 16、React 19、TypeScript 5.9、Zod 4、Vitest/Testing Library、Playwright、fetch SSE、Next same-origin rewrite。

**Spec:** Frontend base `agent-hub-web@dab3ca76b57b047389e55dd32a71c65ad0ce7925`；backend base `DSI origin/session@c45f990d5afb7d82932958ee4e0bb8bce4d48b48`；contract `conversation.v1@0.1.2` from `api/openapi/conversation.v1.json`；backend contract draft `docs/plans/2026-11-06-session-c01-contract-draft.md`。

## Global Constraints

- 不新增第二套登录页、token store、用户 ID 或请求头。浏览器只使用 HttpOnly `dsi_app_session` Cookie。
- `AuthProvider` 是唯一身份状态机。Daily/KB 的 401 调 `auth.invalidate()`；403 只显示页面内权限/部署错误，不退出。
- identity key = `identityGeneration + conversationId`。退出、换号、401、路由切换必须取消旧请求/流并丢弃晚回包。
- canonical 协议无 token delta。最终正文仅来自规范 `message.created`；`turn.completed` 只判定终态。
- UI 不展示工具参数、输出、内部 step 或完整推理。`tool.*` 仅映射成短活动提示。
- `eventSeq`、`lastEventSeq`、`acceptedEventSeq` 全程保留十进制字符串；比较时用 `BigInt`，不得转 `Number`。
- 一个 conversation 同时仅一个 active turn。`TURN_IN_PROGRESS` 保留草稿，不创建第二个请求键。
- capability selectors 当前不在 canonical turn DTO 中。首版必须明确禁用并提示“当前持久会话暂未支持能力组合”，不得静默丢弃选项。
- Work 模式、GIS、旧 `/tasks` transport、KB 页面结构不在本轮重构范围。
- 每个 Task：先写失败测试，再实现，再跑定向测试，最后 commit。通过后再进入下一 Task。

## Baseline Gate（已完成）

- [x] 后端 `main@114830a` 合入 `session`。
- [x] 解决 async auth 与 session runtime 冲突。
- [x] 推送 `origin/session@c45f990`。
- [x] 验证：unified auth 11/11；conversation unit 18/18；events 23/23；lifecycle 28/28；compat 18/18；server 13/13；crash 7/7；API typecheck 通过。
- [x] 前端 worktree 从 `origin/main@dab3ca7` 创建，分支 `codex/daily-canonical-session`。

## Task 1：Task 7 — Daily Chat/History 改用全局身份

**Files:**

- Create: `src/features/chat/session/use-daily-session-auth-bridge.ts`
- Create: `src/features/chat/session/use-daily-session-auth-bridge.test.tsx`
- Create: `src/components/chat/daily-session-auth-notice.tsx`
- Create: `src/components/chat/daily-session-auth-notice.test.tsx`
- Modify: `src/app/chat/page.tsx`
- Modify: `src/app/chat/chat-route.test.tsx`
- Modify: `src/app/history/history-page-client.tsx`
- Modify: `src/app/history/history-page.test.tsx`
- Modify: `src/components/chat/daily-session-history.tsx`
- Modify: `src/components/chat/daily-session-history.test.tsx`
- Modify: `src/components/chat/daily-session-view.tsx`
- Modify: `src/components/chat/daily-session-view.test.tsx`
- Modify: `src/features/chat/transports/daily-session-client.ts`
- Modify: `src/features/chat/transports/daily-session-client.test.ts`
- Delete: `src/features/chat/session/daily-session-auth-provider.tsx`
- Delete: `src/features/chat/session/daily-session-auth-provider.test.tsx`
- Delete: `src/components/chat/daily-session-auth-gate.tsx`
- Delete: `src/components/chat/daily-session-auth-gate.test.tsx`

- [ ] 写 bridge 测试：`authenticated` 暴露 `identityGeneration/invalidate`；`demo` 禁止 Daily 请求；身份代际变化让旧数据不可见。
- [ ] 写 route/history 测试：页面不再挂 `DailySessionAuthProvider/Gate`，不再出现 Daily 专用登录/退出 UI。
- [ ] 实现 `useDailySessionAuthBridge()`：只包装 `useAuth()`，不保存副本；仅 authenticated 允许请求；401 仅在 authenticated 状态调用 `invalidate()`。
- [ ] 实现 `DailySessionAuthNotice`：demo 显示“需完整登录”；anonymous/checking/error 继续由根 `AuthBoundary` 处理。
- [ ] Daily History/View 改用 bridge 的 `identityGeneration` 与 `onAuthRequired`。
- [ ] 从 Daily client public interface 删除 `getAuthStatus/login/logout` 及其测试；全局 auth client 成为唯一认证调用方。旧 auth DTO 可在 Task 2 生成契约切换时删除。
- [ ] 删除页面级 Provider/Gate 及其测试。确认仓库无 `useDailySessionAuth`、`DailySessionAuthProvider`、`DailySessionAuthGate` 引用。
- [ ] 运行：

```powershell
pnpm test -- src/features/chat/session/use-daily-session-auth-bridge.test.tsx src/components/chat/daily-session-auth-notice.test.tsx src/app/chat/chat-route.test.tsx src/app/history/history-page.test.tsx src/components/chat/daily-session-history.test.tsx src/components/chat/daily-session-view.test.tsx src/features/chat/transports/daily-session-client.test.ts
pnpm typecheck
```

- [ ] Commit：`refactor(auth): move daily session pages to global identity`

## Task 2：固定并生成 conversation.v1 客户端契约

**Files:**

- Create: `src/features/chat/conversation/contracts/schema/conversation.v1.json`
- Create: `src/features/chat/conversation/contracts/schema/conversation.v1.lock.json`
- Create: `src/features/chat/conversation/contracts/generated/schemas.ts`
- Create: `src/features/chat/conversation/contracts/generated/operations.ts`
- Create: `src/features/chat/conversation/contracts/generated/index.ts`
- Create: `scripts/conversation-schema-lock.ts`
- Create: `scripts/conversation-schema-lock.test.ts`
- Create: `scripts/openapi-zod-generator.ts`
- Create: `scripts/openapi-zod-generator.test.ts`
- Create: `scripts/conversation-client-generator.ts`
- Create: `scripts/conversation-client-generator.test.ts`
- Create: `scripts/generate-conversation-client.ts`
- Create: `scripts/check-conversation-client.ts`
- Create: `scripts/verify-conversation-schema.ts`
- Modify: `scripts/kb-client-generator.ts`
- Modify: `package.json`
- Modify: `src/features/chat/transports/daily-session-contract.ts`
- Modify: `src/features/chat/transports/daily-session-contract.test.ts`

- [ ] 从 `DSI@c45f990` 复制原始 `api/openapi/conversation.v1.json`；禁止手改 JSON。
- [ ] lock 固定：repository `DSI`、source path、source commit、contract id `conversation.v1`、version `0.1.2`、operation count `18`、SHA-256。
- [ ] 先写 schema lock 失败测试：hash/version/operation count/path/local `$ref` 漂移必须失败。
- [ ] 从 KB generator 抽取共享 `openapi-zod-generator.ts`，再补 conversation 使用的 `oneOf/anyOf/allOf/discriminator/const`；禁止复制两套 JSON-Schema renderer。KB 生成结果必须零漂移。
- [ ] SSE 不由 OpenAPI generator 自动解析。只生成 `ConversationPublicEventSchema`，流帧解析留给 Task 3。
- [ ] 对 `ConversationSequence` 追加前端 refine：PostgreSQL bigint 上限；对已知 message content 做判别校验；未知 kind 仍允许安全降级展示。
- [ ] `daily-session-contract.ts` 改为生成契约的窄 re-export；删除旧 pinned-to-`098201a` 手写 DTO 和 Daily 专用 auth DTO。
- [ ] 新增 scripts：

```json
{
  "generate:conversation-client": "tsx scripts/generate-conversation-client.ts",
  "check:conversation-client": "tsx scripts/check-conversation-client.ts",
  "verify:conversation-schema": "tsx scripts/verify-conversation-schema.ts"
}
```

- [ ] 运行：

```powershell
pnpm test -- scripts/openapi-zod-generator.test.ts scripts/conversation-schema-lock.test.ts scripts/conversation-client-generator.test.ts src/features/chat/transports/daily-session-contract.test.ts
pnpm generate:conversation-client
pnpm check:conversation-client
pnpm verify:conversation-schema
pnpm check:kb-client
pnpm typecheck
```

- [ ] Commit：`build(chat): pin conversation v1 contract`

## Task 3：Canonical HTTP、SSE、错误码、cancel client

**Files:**

- Modify: `src/features/chat/transports/daily-session-client.ts`
- Modify: `src/features/chat/transports/daily-session-client.test.ts`
- Create: `src/features/chat/transports/conversation-sse.ts`
- Create: `src/features/chat/transports/conversation-sse.test.ts`
- Reuse: `src/features/chat/transports/fetch-sse-stream.ts`
- Modify: `src/features/chat/transports/fetch-sse-stream.test.ts`

目标接口：

```ts
interface DailySessionClient {
  listConversations(input?, signal?): Promise<ConversationList>;
  createConversation(input, signal?): Promise<CreatedConversation>;
  loadSnapshot(conversationId, signal?): Promise<ConversationSnapshot>;
  loadMessages(conversationId, cursor, signal?): Promise<ConversationMessagePage>;
  renameConversation(conversationId, input, signal?): Promise<ConversationMetadata>;
  submitTurn(conversationId, input, signal?): Promise<AcceptedConversationTurn>;
  listEvents(conversationId, input, signal?): Promise<ConversationEventPage>;
  streamEvents(conversationId, input, signal?): AsyncIterable<ConversationPublicEvent>;
  cancelTurn(conversationId, turnId, signal?): Promise<CancelledConversationTurn>;
}
```

- [ ] 先写 client 测试：turn 202、events 分页、cancel 200/202、same-origin Cookie、Origin 由 BFF/浏览器处理、AbortSignal 生效。
- [ ] 移除 client 内 `getAuthStatus/login/logout`。认证只归全局 auth client。
- [ ] 修复 `mapHttpError`：合法 envelope 必须保留后端 code/requestId；状态码仅作 envelope 不合法时 fallback。覆盖 `TURN_IN_PROGRESS`、`IDEMPOTENCY_CONFLICT`、`RESYNC_REQUIRED`、`CONVERSATION_EXECUTION_DISABLED`。
- [ ] `streamEvents` 使用 fetch，不用原生 `EventSource`：需检查 headers 前 HTTP JSON 错误、携带 `afterSeq`，手动恢复时可带 conversation-scoped `Last-Event-ID`。
- [ ] `streamEvents` 实现为 async generator。HTTP/解析错误可能在首次迭代而非创建 iterable 时抛出；controller 必须包住 `for await` 捕获。
- [ ] SSE 校验：忽略注释；只接受 named event；`event` 必须等于 payload.type；`id` 必须等于 `<conversationId>:<eventSeq>`；每个 data 用生成的 `ConversationPublicEventSchema` 解析。
- [ ] EOF/网络断开抛稳定 `STREAM_DISCONNECTED`；不要生成 `answer.done` 或假 terminal。
- [ ] 运行：

```powershell
pnpm test -- src/features/chat/transports/daily-session-client.test.ts src/features/chat/transports/conversation-sse.test.ts src/features/chat/transports/fetch-sse-stream.test.ts
pnpm typecheck
```

- [ ] Commit：`feat(chat): add canonical conversation client and sse`

## Task 4：Canonical 投影、恢复、乐观消息

**Files:**

- Create: `src/features/chat/session/daily-conversation-reducer.ts`
- Create: `src/features/chat/session/daily-conversation-reducer.test.ts`
- Create: `src/features/chat/session/use-daily-conversation.ts`
- Create: `src/features/chat/session/use-daily-conversation.test.tsx`
- Modify: `src/features/chat/session/daily-session-adapter.ts`
- Modify: `src/features/chat/session/daily-session-adapter.test.ts`

投影规则：

| Input | State effect |
| --- | --- |
| snapshot | 安装 metadata、规范 message map、active turn、watermark S |
| historical `/events` 0..S | 只恢复已加载 message 对应 turn/tool 状态，不重复追加 snapshot 消息 |
| `message.created` | 按 messageId upsert；按 ordinal 排序；回执可用 userMessageId 绑定 pending send |
| `turn.queued/started/cancelling` | 更新 active turn；旧回执不得让状态倒退 |
| `tool.started/completed` | 更新一行安全 activity、完成步骤数；不得结束 turn |
| `turn.completed` | terminal success；等待/保留规范 assistant message，不拼接 delta |
| `turn.failed/interrupted` | terminal error/stop；保留 user message；不伪造 assistant message |
| metadata/lifecycle events | 更新标题/状态/归档；deleted 关闭流并清当前路由状态 |

- [ ] reducer 红测：乱序到达但 seq 有序应用、重复事件去重、seq gap 拒绝、回执/事件先后两种顺序不重复 user message、terminal 不回退。
- [ ] pending send 结构至少含 `clientRequestId/content/status/userMessageId?`。网络结果未知时保留原 key；显式重试复用同 key。
- [ ] 恢复流程：snapshot → REST 从 0 分页至 S 恢复历史状态 → stream 从 S。REST 批次超过 S 时缓存未来帧，不能跳过。
- [ ] gap：从最后 applied seq 调 `listEvents` 补读；仍 `RESYNC_REQUIRED` 时最多重新 snapshot 一次。再次失败则保留可读消息、标记“历史执行状态待确认”，停止无限循环。
- [ ] SSE 断开：停止本地流，显示“连接已中断”；不自动 cancel、不自动 rerun。用户点“重新连接”后从 applied cursor 恢复。
- [ ] 手动重连只允许使用同一 identity/conversation 的“投影 + applied cursor”组合；只有孤立 cursor 时必须重新 snapshot。单列测试覆盖刷新后不得从 local cursor 盲接。
- [ ] `submit()`：无 conversation 时先以稳定 create key 创建；更新 URL 后，以独立稳定 turn key 提交；`TURN_IN_PROGRESS` 保留草稿。
- [ ] `cancel()`：仅对当前 active turn 调 canonical cancel；queued→interrupted，running→cancelling；等待持久 terminal 事件确认。
- [ ] 所有异步回包检查 `{identityGeneration, conversationId, controller epoch}`。
- [ ] 运行：

```powershell
pnpm test -- src/features/chat/session/daily-conversation-reducer.test.ts src/features/chat/session/use-daily-conversation.test.tsx src/features/chat/session/daily-session-adapter.test.ts
pnpm typecheck
```

- [ ] Commit：`feat(chat): project and recover canonical conversations`

## Task 5：Daily Chat/History UI 接线

**Files:**

- Modify: `src/app/chat/page.tsx`
- Modify: `src/app/chat/chat-route.test.tsx`
- Modify: `src/components/chat/daily-session-view.tsx`
- Modify: `src/components/chat/daily-session-view.test.tsx`
- Modify: `src/components/chat/daily-session-history.tsx`
- Modify: `src/components/chat/daily-session-history.test.tsx`
- Modify: `src/components/chat/composer.tsx`
- Modify: `src/components/chat/chat-page.test.tsx`
- Verify/Modify: `src/features/chat/transports/create-transport.ts`
- Modify: `e2e/chat-mock.spec.ts`
- Reuse: `src/components/chat/message-list.tsx`
- Reuse: `src/components/chat/activity-line.tsx`

- [ ] `DailySessionView` 接收可选 `conversationId`。无 ID 显示 GPT 风格空态；首次发送成功后回调 `onConversationResolved(id)`，route replace 为 `/chat?mode=daily&conversation=<id>`。
- [ ] 首次 create 后 route replace 不得销毁正在 submit/stream 的 controller；用 pending route conversation guard，测试 URL catch-up 后不重复 snapshot/turn。
- [ ] 默认 `/chat?mode=daily` 与 daily 历史会话走 canonical controller；不再走旧 `projects-new` `/tasks` transport。Work 仍走 Xiaozhi transport。
- [ ] 保留非 production 且 `NEXT_PUBLIC_E2E_SCENARIOS=1` 时的显式 `scenario=completed|stopped|disconnected|failed` mock override；`chat-mock.spec.ts` 必须继续通过。不得让测试开关进入 production。
- [ ] 历史页“新对话”只跳 `/chat?mode=daily`，不提前制造空 DB 会话。保留列表、分页、改名。
- [ ] UI 只展示规范 user/final assistant 正文。一行活动提示示例：queued“正在准备…”、started“正在处理…”、tool.started“正在使用工具…”、cancelling“正在停止…”。不展示 tool payload。
- [ ] 扩展 `Composer` capability 状态：daily canonical 中 selectors 可见但 disabled，显示“当前持久会话暂未支持能力组合”；Work/旧 mock 行为不变。
- [ ] 发送期间停止按钮调用 canonical cancel。断线后显示“重新连接”，不显示“重新生成”避免重复执行。
- [ ] 历史页点击会话 → 可继续发送第二轮；刷新 → snapshot 恢复同一 conversation。
- [ ] 运行：

```powershell
pnpm test -- src/app/chat/chat-route.test.tsx src/components/chat/daily-session-view.test.tsx src/components/chat/daily-session-history.test.tsx src/components/chat/chat-page.test.tsx
pnpm exec playwright test e2e/chat-mock.spec.ts
pnpm typecheck
pnpm lint
```

- [ ] Commit：`feat(chat): wire daily ui to canonical sessions`

## Task 6：KB Task 6 已完成，仅回归（Task 1 后可与 Task 2–5 并行）

**Status:** 主体已在 `main@dab3ca7` 完成。本轮不重做 KB UI/bridge。

**Files:**

- Verify: `src/features/knowledge/use-kb-auth-bridge.ts`
- Verify: `src/features/knowledge/use-kb-auth-bridge.test.tsx`
- Verify: `src/components/knowledge/kb-auth-notice.tsx`
- Verify: `src/app/knowledge/page.tsx`
- Verify: `src/app/knowledge/[id]/page.tsx`
- Modify only if regression found: corresponding tests/bridge code

- [ ] 测试 authenticated KB 401 → 全局 `invalidate()`；demo/checking 的预期 401 不误退出。
- [ ] 测试 KB 403 只显示权限/Origin 错误，Global Auth 保持 authenticated。
- [ ] 测试 Daily 401 与 KB 401 汇入同一个 AuthProvider，identityGeneration 只由全局身份变化驱动。
- [ ] 测试 demo：KB/Daily 均显示能力提示；Skill/MCP 等允许页面仍可访问。
- [ ] 运行：

```powershell
pnpm test -- src/features/knowledge/use-kb-auth-bridge.test.tsx src/providers/auth-provider.test.tsx
pnpm check:kb-client
pnpm verify:kb-schema
```

- [ ] 若无需代码修改，不建空 commit；在最终验收记录中标记“regression only”。

## Task 7：登录/401/退出/换号/demo 跨页面 E2E

**Files:**

- Create: `e2e/fixtures/canonical-conversation-backend.mjs`
- Replace/Modify: `e2e/daily-session-j1.spec.ts`
- Modify: `playwright.daily-session.config.ts`
- Modify: `scripts/daily-session-j1-smoke.mjs`
- Modify: `scripts/daily-session-j1-smoke.test.mjs`
- Create: `docs/session/2026-11-11-daily-canonical-session-acceptance.md`

- [ ] mock backend 覆盖：全局 auth、两账号、conversation CRUD、turn receipt、REST events、named SSE、cancel、KB 401/403。SSE 帧必须含 comment、event、id、data。
- [ ] `playwright.daily-session.config.ts` 使用两个 `webServer`：先启动 fixture（固定测试端口），再以 `AGENT_API_ORIGIN=<fixture origin>` 启动 Next；两者都设置 `reuseExistingServer:false`，测试结束由 Playwright 回收。
- [ ] E2E 1：anonymous → 全局登录 → Daily Chat/History/KB 无第二次登录。
- [ ] E2E 2：首轮发送 → URL 写入 conversation → 活动提示 → 最终正文；第二轮继续；刷新/历史跳转仍是同一会话。
- [ ] E2E 3：运行中 cancel → cancelling/interrupted；无伪造 assistant 正文。
- [ ] E2E 4：SSE 断开 → 手动重新连接 → 从最后 cursor 恢复；不重复 turn/model/message。
- [ ] E2E 5：任一受保护页面 401 → 全局登录页；Daily/History/KB 旧用户数据全部消失。
- [ ] E2E 6：403 只显示页面错误；不退出。
- [ ] E2E 7：退出 A → 登录 B；A 会话、pending send、KB 数据不可见；B 不能读取 A conversation。
- [ ] E2E 8：demo 能访问壳页，但 Daily/KB 显示完整登录提示，不发受保护请求。
- [ ] 更新真实 smoke：增加 create→turn→events/SSE→terminal→snapshot→cancel/隔离；缺 env 返回 SKIP，不能记 PASS。
- [ ] 运行：

```powershell
pnpm test
pnpm test:e2e:daily-session
pnpm typecheck
pnpm lint
pnpm build
```

- [ ] Commit：`test(e2e): cover unified auth canonical session flow`

## Task 8：真实后端联调与交付门禁

**Backend runtime:**

```dotenv
DSI_CONVERSATION_MODE=enabled
DSI_CONVERSATION_LEGACY_ENABLED=0
DSI_ALLOWED_ORIGINS=http://127.0.0.1:3103
```

**Frontend runtime:**

```dotenv
AGENT_API_ORIGIN=http://127.0.0.1:3001
NEXT_PUBLIC_AGENT_API_BASE=/agent-api
```

- [ ] 确认仅一个 agent-api instance；PostgreSQL/Redis/Xiaozhi/model 配置沿现有环境；不要把 token 写进前端 env。
- [ ] 确认 Next/nginx 透传 Cookie、Origin、`Last-Event-ID`、状态码、`text/event-stream`，并关闭 SSE buffering。
- [ ] 运行后端门禁：

```powershell
pnpm --filter @datasourceintelligence/shared build
pnpm --dir api run ts-check
pnpm --dir api run test:unified-auth
$env:SESSION_TEST_DATABASE_URL='postgresql://<test-user>:<test-pass>@127.0.0.1:5432/dsi_session_test_frontend_e2e'
pnpm --dir api run test:conversations
```

- [ ] `SESSION_TEST_DATABASE_URL` 必须指向本机、一次性、命名匹配 `dsi_session_test_*` 的 DB。测试前创建，`finally` 强制删除；禁止使用业务库或仅设置 `DATABASE_URL`。

- [ ] 运行前端真实 smoke 与 Playwright；记录 backend SHA `c45f990`、frontend SHA、contract hash、环境矩阵、未运行项。
- [ ] 验收：首轮/第二轮/刷新/历史跳转/取消/手动重连/401/403/退出/换号/demo 全部有证据。
- [ ] 更新 README：Daily canonical 已启用；旧 `/tasks` 仅作非 canonical/演示兼容，不再描述为 Daily 主链路。
- [ ] Commit：`docs(chat): record canonical session acceptance`

## Final Review Focus

- Auth：无第二套登录、无前端 token、401/403 语义正确、换号无晚回包污染。
- Protocol：生成契约 pin 到 `c45f990`；错误 code 不丢；SSE named event/id/seq 校验严格。
- Recovery：snapshot 水位、历史补读、gap/resync、手动重连均不重跑模型、不重复消息。
- UI：只展示最终正文；活动提示短且无敏感内容；capability 选项不被静默忽略。
- Scope：Work、GIS、KB UI、旧 demo 行为无非预期回归。
