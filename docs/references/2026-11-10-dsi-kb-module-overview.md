# DSI 知识库模块代码梳理

日期：2026-11-10
代码基线：DSI 仓库 main（kb/auth 相关最新提交 `0ce83e1`「知识库 OpenAPI 契约生成 + 错误响应统一为框架信封」，经 PR #6 合入）
前端配套：agent-hub-web `codex/unified-auth-kb-bridge` 分支 Task 1 已按此基线钉版契约（`kb.v1.json` sha256 61a62bc5…）

---

## 1. 总体架构

```text
浏览器（agent-hub-web）
  │  /agent-api/* → Next rewrites → DSI:3001
  ▼
DSI（Express，api/src/agent-index.ts）
  ├─ /auth/*        登录、登出、会话状态（modules/auth/routes.ts）
  ├─ /api/kb/*      知识库 HTTP 接口（modules/kb/）
  │     ├─ 检索组：routes.ts（复用 agent 工具链）
  │     └─ 管理组：admin.ts（薄桥接转发 xiaozhi）
  ▼  xiaozhiFetch / fetch + Bearer token
xiaozhi:5050（/api/knowledge/*、/api/auth/*）
```

核心原则：**浏览器永远接触不到 xiaozhi token**。token 存在 DSI 内存 session 里，浏览器只持有 HttpOnly Cookie `dsi_app_session`。

---

## 2. 认证与会话（modules/auth/）

### 2.1 端点清单（`routes.ts`）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/login` | 账号密码登录。KB 开启时走 `loginXiaozhiWithCredentials` 换 xiaozhi token 并建完整 session；`mode:"sms"` 或 `DSI_KB_ENABLED=false` 时建基础 session（无 token，响应带 `kbUnavailable: true`） |
| POST | `/auth/xiaozhi-login` | 已登录 session 补充/切换 xiaozhi 账号（需已有 DSI session） |
| POST | `/auth/xiaozhi/exchange-code` | OAuth 授权码换 token（备用入口） |
| GET | `/auth/xiaozhi-status` | 登录态探针：校验 session 内 token 仍有效（调 xiaozhi `/api/auth/me`），uid 漂移或 401/403 时**直接撤销 session 并清 Cookie**。返回 `{ enabled, xiaozhiUrl, user? }` |
| GET | `/auth/me` | 当前 session 公开用户信息（`{ user: { id, displayName, sessionExpiresAt } }`） |
| POST | `/auth/logout` | 撤销 session + 清 Cookie |

写操作（login/logout 等）都过 `requireSameOrigin`：非 GET 请求要求 Origin/Referer 与 host 同源（或命中 `DSI_ALLOWED_ORIGINS`），否则 403。

### 2.2 Session 模型（`session.ts`）

- 内存 `Map<sessionId, DsiAppSession>`（生产可换 Redis）；字段含 `xiaozhiUserId`、`verifiedSubject`（校验过的稳定 uid）、`displayName`、`xiaozhiToken`、双 TTL。
- 双 TTL：绝对期 8h（`DSI_SESSION_TTL_SECONDS`），空闲 30min（`DSI_SESSION_IDLE_TTL_SECONDS`，每次请求刷新 `lastSeenAt`）。
- Cookie：`HttpOnly; SameSite=Lax; Path=/`；`Secure` 仅在 production 或显式 `DSI_SESSION_COOKIE_SECURE` 时开启。
- 未登录时 `requireDsiSession` 返回 **401 + `{ error: "DSI session required" }`**——注意这是唯一的非信封错误结构（前端 `kb-api.ts` 已针对它做例外处理）。
- 换账号/重新登录会先撤销旧 session 再下发新 Cookie。

### 2.3 token 传递（shared/xiaozhiTokenStore.ts）

- 登录后 token 存 session（`DsiAppSession.xiaozhiToken`）。
- KB 接口处理时通过 `runWithXiaozhiToken(token, fn)` 放入 AsyncLocalStorage，下游工具链/桥接调用用 `getAuthToken()` 无参取到当前用户 token——**并发请求之间靠 AsyncLocalStorage 隔离，不会串号**。
- 另有一份按 userId 的全局 `tokenStore`（Map），目前主要供 agent 工具链使用。

---

## 3. 知识库接口（modules/kb/，挂载于 `/api/kb`）

共 23 个操作，操作清单真源在 `httpContractBaseline.ts`，OpenAPI 契约由 `openapi.ts` 从 zod schema（`contracts.ts`）生成，即前端钉版的 `kb.v1.json`。

### 3.1 检索组（`routes.ts`，复用 agent 工具链）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/kb/search` | 跨库检索：前缀剥离 → 语义路由 → 多路召回 RRF 融合 → TEI 精排（可熔断降级）→ 三级过滤 → 多样性配额。空结果返回 `success:true, results:[]`（不是错误） |
| GET | `/api/kb/databases` | 库列表（等价 KnowledgeBaseList 工具） |

这两个接口**不是简单转发**：直接构建 `KnowledgeBaseSearch/List` 工具实例执行，HTTP 层只做参数校验和结果包装。

### 3.2 管理组（`admin.ts`，薄桥接 xiaozhi）

字典类：

| 方法 | 路径 | xiaozhi 目标 |
|---|---|---|
| GET | `/chunk-presets` | `/knowledge/chunk-presets`（分块策略下拉） |
| GET | `/models/embedding` | `/system/model-providers/models/v2?model_type=embedding`（嵌入模型下拉） |

库管理：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/databases` | 新建库（固定 `kb_type:"milvus"`；`embedding_model_spec` 不传时自动取环境变量 `KB_DEFAULT_EMBEDDING_MODEL` 或 xiaozhi 第一个可用嵌入模型） |
| GET | `/databases/:id` | 库详情 |
| PUT | `/databases/:id` | 编辑库（名称/描述/分块策略/自动生成问题开关） |
| DELETE | `/databases/:id` | 删除库 |
| PUT | `/databases/:id/config` | **501 占位**（xiaozhi 侧接口未确认，是唯一未桥接端点） |
| GET | `/databases/:id/sample-questions` | 样例问题列表 |
| POST | `/databases/:id/sample-questions` | 触发 LLM 生成样例问题（超时放宽到 120s） |
| GET | `/databases/:id/query-params` | 检索测试表单的参数定义 |
| POST | `/databases/:id/query-test` | 检索测试（xiaozhi 业务失败是 200+`status:"failed"`，这里归一成 `success:false`） |
| GET | `/databases/:id/export` | 导出 csv/txt/md（xiaozhi 原生导出端点不可用，DSI 侧用「文档列表+逐文档内容」自行组装，分批并发 5） |
| POST | `/databases/:id/folders` | 新建文件夹 |

文档管理：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/databases/:id/documents` | 文档列表（分页 page/page_size≤500、status、parent_id 目录过滤；响应补 `parse_status`/`index_status` 双状态） |
| POST | `/documents` | **两步上传**（multipart，内存暂存 ≤100MB）：Step1 `POST /knowledge/files/upload?kb_id=` 传 MinIO（120s 超时）→ Step2 `POST /knowledge/databases/{kb_id}/documents` 注册入库，显式 `auto_index:true`（解析+入库同一任务完成） |
| POST | `/documents/parse` | 手动解析（适用 uploaded/error_parsing），body `{kb_id, file_ids[]}` |
| POST | `/documents/index` | 手动入库/重建索引（适用 parsed/error_indexed），body `{kb_id, file_ids[], params?}` |
| GET | `/documents/:id/status` | 单文档状态（需 `?kb_id=`；从 xiaozhi `/basic` 的 meta 提取 chunk_count、error） |
| GET | `/documents/:id/content` | 解析内容预览（markdown 全文 + chunks 列表） |
| GET | `/documents/:id/download` | 下载原件（二进制透传，含 Content-Disposition） |
| DELETE | `/documents/:id` | 删除文档（需 `?kb_id=`；xiaozhi 该端点实测可能 405，按错误约定透传） |

### 3.3 桥接层做的三件"翻译"工作

1. **状态映射**：xiaozhi 单状态 `status`（uploaded/parsing/parsed/error_parsing/indexing/indexed/error_indexing）→ 前端双状态 `parse_status`/`index_status`（`mapFileStatus`）。
2. **时间戳补偿**：xiaozhi 0.7.1 的 ORM 把 UTC 裸时间按服务器时区（+08:00）解释，落库早 8 小时。DSI 侧对 `created_at`/`updated_at` 统一 +8h 修正（`fixXiaozhiTimestamp`），前端展示无需再处理。
3. **中文文件名修复**：busboy 按 latin1 误读 UTF-8 multipart 文件名，DSI 侧 latin1→utf8 还原（`decodeMultipartFilename`）。

---

## 4. 错误约定（_shared.ts）

- 业务失败统一框架错误信封 `{ code, message, data: null, details }`（`buildErrorEnvelope`）。
- 状态码映射（`sendKbFailure`）：xiaozhi 上游 4xx → 原码透传并提取 `detail`；timeout → 504；其余 infra → 502；`DSI_KB_ENABLED=false` → 503 + `details.kbUnavailable:true`（`kbGate` 中间件，覆盖检索+管理全部端点）。
- 5xx 的 message 带 `[kind]` 分类前缀（前端 `classifyFailure` 已适配剥离）。
- 服务端纪律：所有失败先 `console.error` 再返回结构化错误。

---

## 5. 配置项（环境变量）

| 变量 | 默认 | 作用 |
|---|---|---|
| `XIAOZHI_API_BASE` | 无（必填，首次调用时才报错） | xiaozhi 服务地址，全项目唯一来源，禁止写死 |
| `DSI_KB_ENABLED` | 开启 | 知识库总开关；关闭时登录降级为基础 session、KB 接口全 503 |
| `DSI_SESSION_TTL_SECONDS` | 28800（8h） | session 绝对有效期 |
| `DSI_SESSION_IDLE_TTL_SECONDS` | 1800（30min） | session 空闲有效期 |
| `DSI_SESSION_COOKIE_SECURE` | 跟随 NODE_ENV | Cookie Secure 标记 |
| `DSI_ALLOWED_ORIGINS` | 空 | 同源检查额外放行的 Origin 列表 |
| `KB_DEFAULT_EMBEDDING_MODEL` | 空 | 新建库默认嵌入模型 spec，未配置时自动取 xiaozhi 第一个可用 |

---

## 6. 与统一登录方案的关系

- 前端正做的全局 AuthProvider（Task 2）消费的就是 `/auth/login` + `/auth/xiaozhi-status` + `/auth/logout` 这一组，契约稳定，无需 DSI 改动。
- 统一登录设计文档中说的"DSI 桥接层"就是 `modules/kb/admin.ts` 这层——目前已经基本落地（22/23 端点真实桥接，仅 `PUT /databases/:id/config` 501 占位）。所以前端 Task 5（两步上传对齐、嵌入模型必选）**不再被阻塞**，可以直接按现有契约做。
- 检索组鉴权在契约文档 §四-1 里仍标"待定"，现状是沿用 DSI session，与统一登录方案一致。
