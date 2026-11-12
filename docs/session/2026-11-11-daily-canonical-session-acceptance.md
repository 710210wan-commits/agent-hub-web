# Daily Canonical Session 前端验收记录

## 结论

状态：**Task 8 本地真实后端自动化验收通过；用户人工视觉验收待执行**。

全局登录、Daily/History/KB 身份共享、canonical turn/events/named SSE/cancel、断线恢复、401/403、退出换号和 demo 边界已由独立 fixture 浏览器验收覆盖。另以固定 SHA 的 `projects_new`、Xiaozhi LITE、PostgreSQL/Redis 和两个本地身份完成真实 create→turn→events/SSE→terminal→snapshot→cancel/隔离/刷新 smoke。

本结论只代表本地自动化放行，不代表云端网关、生产数据、负载、故障注入或用户人工视觉验收通过。

## 基线

- 前端分支：`codex/daily-canonical-session`
- 前端 Task 8 前置基线：`439bdd152978ee29ebdf6ea9422868e946c1ca3e`
- 前端真实验收代码：`d7d7a842e2489e76c5c8a7b2518ee5c1b37df73d`
- 后端契约来源：`DSI@c45f990d5afb7d82932958ee4e0bb8bce4d48b48`
- Xiaozhi 身份服务：`db5eda309c5c3b31527dc7e58400dbefd37550ab`（`codex/agent-hub-work-integration`）
- Conversation 契约 SHA-256：`d5bd3ae1b98758366c1e9a6e61f1b6c32cb0502c0739823a6d0e7367fe467472`
- 确定性 fixture origin：`http://127.0.0.1:3203`
- 前端测试 origin：`http://127.0.0.1:3103`
- 记录日期：`2026-11-12`（Asia/Shanghai）

## 验收矩阵

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| anonymous 登录后跨 Daily/History/KB 共用身份 | 通过 | Playwright 场景 1 |
| 首轮创建、URL 写入、活动、最终正文 | 通过 | Playwright 场景 2 |
| 第二轮、刷新、历史跳转保持同一会话 | 通过 | Playwright 场景 2 |
| cancel → interrupted，不伪造 assistant 正文 | 通过 | Playwright 场景 3 |
| SSE 断开后按 cursor 手动恢复，不重跑/重复 | 通过 | Playwright 场景 4 |
| 受保护页面 401 触发全局退出并清空旧数据 | 通过 | Playwright 场景 5 |
| KB 403 仅显示错误，不退出身份 | 通过 | Playwright 场景 6 |
| 退出 A、登录 B 后会话/pending/KB 隔离 | 通过 | Playwright 场景 7 |
| demo 仅显示壳与能力提示，不发受保护请求 | 通过 | Playwright 场景 8 |
| named SSE comment/event/id/data 严格解析 | 通过 | smoke 单测 + fixture E2E |
| 真实 create→turn→events/SSE→terminal→snapshot→cancel/隔离/刷新 | 通过 | `pnpm smoke:daily-session-j1` 退出 0；一次性用户 B 和测试 DB 已删除 |

## 自动化命令

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `pnpm --filter @datasourceintelligence/shared build` | 0 | 后端 shared 构建通过 |
| `pnpm --dir api run ts-check` | 0 | 后端类型检查通过 |
| `pnpm --dir api run test:unified-auth` | 0 | 11/11 通过 |
| `pnpm --dir api run test:conversations` | 0 | 12 组 / 229 项通过；专用测试 DB 已删除 |
| `pnpm test` | 0 | 55 files / 460 tests 通过 |
| `pnpm test:e2e:daily-session` | 0 | Chromium 8/8 通过 |
| `pnpm typecheck` | 0 | 通过 |
| `pnpm lint` | 0 | 通过 |
| `pnpm build` | 0 | 通过；使用仅本次进程的本机占位配置 |
| `pnpm check:conversation-client` | 0 | 生成客户端无漂移 |
| `pnpm verify:conversation-schema` | 0 | C01 `0.1.2`、18 operations、SHA-256 匹配 |
| `pnpm smoke:daily-session-j1`（真实本地链路） | 0 | 双用户全部检查通过 |
| `pnpm smoke:daily-session-j1`（缺 env） | 2 | SKIP（非通过），符合约定 |
| `git diff --check` | 0 | 通过 |

构建占位配置只作用于命令进程，不写入仓库：

```powershell
$env:NEXT_PUBLIC_LEGACY_FRONTEND_URL='http://127.0.0.1:5000'
$env:AGENT_API_ORIGIN='http://127.0.0.1:3001'
$env:SKILL_MARKET_DAILY_ORIGIN='http://127.0.0.1:3999'
$env:SKILL_MARKET_GATEWAY_HMAC_SECRET='test-only-skill-market-hmac-secret-32-bytes'
$env:SKILL_MARKET_PRINCIPAL_ID='daily-session-build'
$env:SKILL_MARKET_PRINCIPAL_ROLES='admin'
pnpm build
```

真实 smoke 需要：

```powershell
$env:DAILY_SESSION_J1_ORIGIN='https://example.invalid'
$env:DAILY_SESSION_J1_USER_A='test-user-a'
$env:DAILY_SESSION_J1_PASSWORD_A='<secret>'
$env:DAILY_SESSION_J1_USER_B='test-user-b'
$env:DAILY_SESSION_J1_PASSWORD_B='<secret>'
pnpm smoke:daily-session-j1
```

脚本使用两个隔离 Cookie jar，不输出凭据/Cookie。缺任一必需变量时必须退出 `2` 并标记 SKIP；不能记为 PASS。

## Task 8 运行矩阵

| 组件 | 本次配置 | 结果 |
| --- | --- | --- |
| Xiaozhi | `127.0.0.1:5050`；LITE_MODE；PostgreSQL/Redis；不启动 Worker/RAG | 登录、`/auth/me`、临时用户创建/删除通过 |
| Agent API | 单实例 `127.0.0.1:3001`；`DSI_CONVERSATION_MODE=enabled`；legacy=0；allowed origin=`http://127.0.0.1:3103` | health、scheduler、真实 Loop 通过 |
| Session DB | 一次性 `dsi_session_test_agenthub_task8_20261112150501`；完整 16 条 migration | smoke 后强制删除并确认不存在 |
| Agent Hub | `127.0.0.1:3103`；`AGENT_API_ORIGIN=http://127.0.0.1:3001`；浏览器 base=`/agent-api` | 无前端 token；同源代理通过 |
| 身份 | 本地管理员 A + 正式管理 API 创建的一次性普通用户 B | Cookie jar 隔离通过；B 已软删除 |

传输证据：真实 smoke 验证 Cookie 会话、REST 状态、`text/event-stream` 与终态；client 单测验证 conversation-scoped `Last-Event-ID`；Playwright 验证断线按 cursor 手动恢复、401/403 和账号切换。本地 Next rewrite 未阻塞 SSE。云端 nginx 的 buffering/header 透传仍须部署时复验。

联调暴露并修复两项前端缺陷：smoke 入口在 `SmokeClient` 声明前执行导致 TDZ；SSE 路径误写为 `/{id}/events/stream`，而 C01 canonical 路径为 `/{id}/stream`。两项均先有失败复现，再补回归测试。

## 范围边界

未修改后端或 Xiaozhi 源码。真实模型、PostgreSQL/Redis、Xiaozhi 身份链路只在本地小流量 smoke 中通过；未验收云端网关、生产权限、并发容量、故障恢复、RAG/知识库外部服务或人工视觉体验。
