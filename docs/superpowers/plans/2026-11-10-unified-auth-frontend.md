# 知识库页面前端实施计划（agent-hub-web 侧，统一登录专项）

日期：2026-11-10
状态：待 LL579 审批；审批后在隔离 worktree 实施
设计基线：《Agent Hub 统一登录态与知识库桥接设计》（2026-11-10，已确认）
责任范围：**仅知识库页面（`/knowledge`、`/knowledge/[id]`）及其 API 封装 `src/lib/kb-api.ts`**。
全局 AuthProvider / AuthBoundary / 侧栏身份 / Work BFF 由他人负责，本计划只声明依赖，不实现。

## 目标

知识库页面接入全局统一登录态，删除页面级独立登录；API 封装对齐 DSI 桥接层最终契约（新错误信封、上传路径、嵌入模型必选）；修正已发现的契约钉版错位。

## 外部依赖（他人交付，本计划被阻塞的入口）

| 依赖 | 交付方 | 影响的 Task |
|---|---|---|
| 全局 `AuthProvider` + `useAuth()`（含 `invalidate()`） | 认证主线负责人 | Task 3 |
| DSI 桥接层 `/api/kb/*` 字段冻结（`0ce83e1` 已冻结错误信封；上传两步式 §6.3 待实现） | DSI 负责人 | Task 2、Task 4 |

**若外部依赖未就绪，Task 1（契约修正与信封适配）可独立完成并先行交付。**

## 全局约束

- 浏览器永远不接触 xiaozhi Token / API Key。
- KB 所有浏览器请求显式 `credentials: "same-origin"`。
- 401 → 调全局 `auth.invalidate()`；403 → 页面内权限提示，不清登录态。
- 沿用 TDD：先失败测试后实现；完成前跑 lint + typecheck + 全量单测。
- 保留 PR #5 已交付的知识库 UI 与交互，不重写页面。

---

## Task 1：KB 契约钉版修正与错误信封适配（可先行，无外部依赖）

**背景**：当前工作区未提交的契约改动钉的是信封改造前的旧快照（lock 的 `sourceCommit`/`sha256` 与 DSI main 不一致），且 `kb-api.ts` 仍按旧信封 `{ success, error }` 分类错误。

**文件**：`src/features/knowledge/contracts/schema/*`、`scripts/kb-schema-lock.ts`、`scripts/generate-kb-client.ts`、`src/lib/kb-api.ts`

**内容**：
1. 从 DSI `origin/main`（含 `0ce83e1`）重新复制 `api/openapi/kb.v1.json`，更新 lock 的 `sourceCommit` 与 `sha256`。
2. 重跑 `generate:kb-client`，确认生成物与新契约一致。
3. 补 `check:kb-client` 漂移检查脚本并挂入 `package.json`（对齐 `check:skill-market-client` 先例）。
4. `kb-api.ts` 的 `classifyFailure` 改为解析新信封 `{ code, message, data, details }`；`kbUnavailable` 从 `details` 读取；401 不再由 KB 页面自行处理（见 Task 3），此处仍保留 `unauthorized` 分类供 invalidate 钩子识别。

**测试（先写）**：新信封 401/403/404/409/422/503(kbUnavailable)/502/504 全部分类用例；生成物漂移检测用例（删除生成物可完整重建、手改生成物被检出）。

## Task 2：上传路径与建库表单对齐桥接契约

**前置**：DSI 桥接层实现 §6.3 两步上传。

**文件**：`src/lib/kb-api.ts`、`src/app/knowledge/page.tsx`（建库表单）

**内容**：
1. 上传改为 `POST /api/kb/databases/:kbId/documents`，`parent_id` 进查询参数，multipart 只含 `file`；上传后不自动解析/入库（沿用页面现有手动按钮）。
2. 新建 Milvus 库表单移除"自动"嵌入模型选项，`embedding_model_spec` 必选；模型列表为空时阻止提交并提示"请先配置嵌入模型"。

**测试**：请求路径/参数与桥接契约一致；空模型列表不发送创建请求。

## Task 3：知识库页面接入全局登录态（依赖认证主线）

**前置**：全局 `AuthProvider` 已合入 main 或同分支可用。

**文件**：`src/app/knowledge/page.tsx`、`src/app/knowledge/[id]/page.tsx`、`src/lib/kb-api.ts`、`src/components/knowledge/kb-login-gate.tsx`（删除）

**内容**：
1. **删除** `KbLoginGate` 组件与 `loginKbSession()`；页面不再自渲染登录卡片。
2. KB 请求收到 401 → 调全局 `auth.invalidate()`，由全局边界回登录页；403 显示"权限不足"页面内提示。
3. 所有 KB 请求补 `credentials: "same-origin"`。
4. 移除"过渡方案：DSI 会话登录"相关文案。

**测试**：401 触发全局失效（页面不自行渲染登录卡）；403 不误退出；未登录时页面不渲染业务数据（全局边界行为）。

## Task 4：契约测试与 E2E 收尾

**内容**：
- kb 契约生成器/锁/信封适配的单测补齐（密度对齐 skill-market）。
- Playwright：未登录访问 `/knowledge` 只见统一登录页；登录后知识库列表/详情可用；退出后 KB 页面立即不可访问。
- 对照设计 §9 中知识库相关条目（5、6、7、9、11）逐项核对。

## 交付顺序

```text
Task 1（可立即开工）
Task 2（等 DSI 桥接层 §6.3 落地）
Task 3（等全局 AuthProvider 就绪）
Task 4（收尾，依赖前全部）
```

## 明确不做（本计划外）

- 全局 AuthProvider / AuthBoundary / 统一登录页 / 侧栏身份 / Work BFF 校验（认证主线，他人负责）。
- DSI 桥接层实现（projects_new/DSI 仓库）。
- Push / PR / Merge（需 LL579 单独授权）。

## 风险

| 风险 | 缓解 |
|---|---|
| 桥接层字段与现有 `kb-api.ts` 结构有出入 | Task 2 开工前逐字段 diff，出入先记录上报，不静默适配 |
| 认证主线延期导致 Task 3 阻塞 | Task 1/2 先交付；Task 3 改动面小，可快速跟进 |
| 契约修正（Task 1）与在途未提交改动混杂 | Task 1 第一件事就是把工作区现有契约改动整理提交，再在其上修正 |
