# 统一登录态前端实施计划（agent-hub-web 侧）

日期：2026-11-10
状态：Task 1 已完成（25a91c0 + d3842be，已推送 origin/codex/unified-auth-kb-bridge）；其余待实施
设计基线：《Agent Hub 统一登录态与知识库桥接设计》（2026-11-10，已确认）
责任范围（2026-11-10 15:44 与同事确认）：**全局统一登录（AuthProvider/登录边界/侧栏身份）+ 知识库页面收口**，均由 LL579 负责。Work BFF 会话校验、DSI 桥接层由他人负责。
分支：`codex/unified-auth-kb-bridge`（前后端同名，远端已建立）。

## 目标

一次登录全站生效：日常对话、历史会话、知识库、办公模式共用同一个 DSI Session（`dsi_app_session` HttpOnly Cookie）；未登录时全站只渲染统一登录页；侧栏显示真实 xiaozhi 用户并可统一退出。

## 外部依赖（他人交付）

| 依赖 | 交付方 | 影响的 Task |
|---|---|---|
| DSI 桥接层 `/api/kb/*` 两步上传（设计 §6.3） | DSI 负责人 | Task 5 |
| Work BFF 会话校验 + 同源校验（设计 §5.3） | Work BFF 负责人 | 不在本计划 |

`GET /auth/xiaozhi-status` 契约已在 DSI 现网存在（daily-session J1 已消费），Task 2 开工前再实测一次响应字段。

## 全局约束

- 浏览器永远不接触 xiaozhi Token / API Key。
- 401 → `auth.invalidate()` → 全局回登录页；403 → 页面内提示，不清登录态。
- KB 所有浏览器请求显式 `credentials: "same-origin"`。
- 沿用 TDD：先失败测试后实现；完成前跑 lint + typecheck + 全量单测。
- 只动认证与知识库范围；不碰 Skill Market、MCP、Work 模式代码。

---

## Task 1：KB 契约钉版修正与错误信封适配 ✅ 已完成

提交 `25a91c0` + `d3842be`，已推送。内容：从 DSI@0ce83e1 重新钉版、重新生成契约、`kb-api.ts` 适配框架错误信封 `{ code, message, data, details }`、补 `check:kb-client` 漂移检查、契约/生成物 LF 行尾固定、17 个新测试。

## Task 2：全局 AuthProvider（真实实现）✅ 已完成

提交 `3933629`（2026-11-10，未推送）。13 个新测试，全量 376 测试 + lint + typecheck 通过。

**文件**：改 `src/providers/auth-provider.tsx`（替换 demoUser）；新增 `src/features/auth/global-auth-client.ts`。

**内容**：
- 状态机 `checking | anonymous | demo | authenticated | error`，含 `identityGeneration`（登录/退出/失效时递增）。
- `demo`（演示态）：经 `/auth/login mode:"sms"` 建立的基础 session，或 `/auth/xiaozhi-status` 返回 `enabled:false` 的 session。面向"无 xiaozhi 环境的同事开发/演示"场景（2026-11-10 与 LL579 确认）。demo 态下 Skill/MCP/办公/设置正常；知识库与对话页由页面内引导提示（后端硬约束，不拦路由）。
- 接口：`login(username, password)`、`loginDemo()`、`logout()`、`retry()`、`invalidate()`、`user`（真实 displayName/uid）。
- 挂载时 `GET /auth/xiaozhi-status` 恢复登录态；401/`AUTH_REQUIRED` → anonymous；网络错误 → error。
- 平移 `DailySessionAuthProvider` 的并发保护（operation/abort/generation）。

**测试（先写）**：状态迁移全路径（含 anonymous↔demo↔authenticated）、并发竞态、invalidate 递增代次、401 vs 网络错误分流。

## Task 3：AuthBoundary + 统一登录页 ✅ 已完成

提交 `5e00bd4`（2026-11-10，未推送）。9 个新测试，全量 385 测试 + lint + typecheck 通过。

**文件**：`src/app/layout.tsx`、`src/components/auth/auth-boundary.tsx`（新）、`src/components/auth/login-page.tsx`（新）、`src/app/globals.css`（auth 样式）

**内容**：
- 根布局 `<AuthProvider><AuthBoundary>`；`anonymous` 只渲染登录页，不渲染 AppShell/导航/业务路由。
- 登录页双入口：账号登录 + "暂不登录，进入演示模式"（调 `auth.loginDemo()`）。
- 登录成功后恢复原目标 URL；`error` 态显示可重试错误。

**测试**：匿名访问 chat/history/knowledge 只见登录页；演示入口进入 demo 态可访问 Skill/MCP 页；登录后回原 URL；error 态不渲染业务数据。

## Task 4：侧栏真实身份与统一退出 ✅ 已完成

提交 `dffb634`（2026-11-10，未推送）。3 个新测试，全量 388 测试 + lint + typecheck 通过。

**文件**：`src/components/shell/sidebar.tsx`、`src/components/shell/topbar.tsx`

**内容**：侧栏用户槽显示真实 `displayName`（替换"演示用户"）；退出按钮调 `auth.logout()`，退出后全站回登录页。

**测试**：authenticated 显示真实用户名；退出后 identityGeneration 递增、页面回登录页。

## Task 5：知识库页面对齐桥接契约

**前置**：DSI 桥接层 §6.3 两步上传落地。

**文件**：`src/lib/kb-api.ts`、`src/app/knowledge/page.tsx`

**内容**：
1. 上传改为 `POST /api/kb/databases/:kbId/documents`（`parent_id` 进查询参数，multipart 只含 `file`）；上传后不自动解析/入库。
2. 新建 Milvus 库表单移除"自动"嵌入模型选项；模型列表为空时阻止提交并提示。
3. 所有 KB 请求补 `credentials: "same-origin"`。

**测试**：请求路径/参数与桥接契约一致；空模型列表不发送创建请求。

## Task 6：知识库页面接入全局登录态

**文件**：`src/app/knowledge/page.tsx`、`src/app/knowledge/[id]/page.tsx`、`src/lib/kb-api.ts`、删 `src/components/knowledge/kb-login-gate.tsx`

**内容**：删除 `KbLoginGate` 与 `loginKbSession()`；KB 401 → `auth.invalidate()`；403 页面内提示；移除"过渡方案"文案。

**测试**：401 触发全局失效；403 不误退出；未登录不渲染业务数据。

## Task 7：对话/历史页面切换到全局认证

**文件**：`src/app/chat/page.tsx`、`src/app/history/history-page-client.tsx`、`src/features/chat/session/*`

**内容**：移除页面级 `DailySessionAuthProvider`/`DailySessionAuthGate`，改用全局 `useAuth()`；历史会话组件改读全局 Hook；迁移既有测试。

**测试**：401 全局失效；既有 J1 场景（恢复/重命名/分页/隔离）回归全绿。

## Task 8：E2E 与验收收尾

对照设计 §9：匿名拦截、一次登录全站生效、退出全站失效、superadmin 可见全部知识库、错误分类、空模型阻止提交等前端可见条目逐项核对；补 Playwright 场景。

## 交付顺序

```text
Task 1 ✅ → Task 2 → 3 → 4（认证主线，立即可做）
Task 5（等 DSI 桥接层）
Task 6（知识库收口，Task 2-4 完成后即可做，早于 Task 5）
Task 7（对话/历史切换，紧随主线）
Task 8（收尾）
```

## 明确不做

- Work BFF 会话校验（他人负责）、DSI 桥接层实现（DSI 仓库）。
- 多用户/RBAC、Redis 持久化 Session、SSO。
- Push / PR / Merge 需 LL579 单独授权（Task 1 已授权并推送）。

## 风险

| 风险 | 缓解 |
|---|---|
| `/auth/xiaozhi-status` 响应字段与假设不一致 | Task 2 开工前先实测 DSI 响应，不一致先上报 |
| 桥接层字段与 `kb-api.ts` 结构有出入 | Task 5 开工前逐字段 diff，出入先记录上报 |
| 现有 daily-session 测试大量引用页面级 Provider | Task 7 同步迁移测试，保持用例语义不变 |
