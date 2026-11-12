# Daily Canonical Session 前端验收记录

## 结论

状态：**Task 7 确定性验收通过；真实后端联调待 Task 8**。

全局登录、Daily/History/KB 身份共享、canonical turn/events/named SSE/cancel、断线恢复、401/403、退出换号和 demo 边界已由独立 fixture 浏览器验收覆盖。真实 `projects_new` 双用户环境未配置，本记录不得解释为生产后端验收通过。

## 基线

- 前端分支：`codex/daily-canonical-session`
- 前端 Task 7 前置基线：`b99eeb9`
- 后端契约来源：`DSI@c45f990d5afb7d82932958ee4e0bb8bce4d48b48`
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
| 真实 create→turn→events/SSE→terminal→snapshot→cancel/隔离 | 未执行 | 缺真实 origin 与 A/B 专用凭据；脚本返回 SKIP（退出码 2） |

## 自动化命令

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `pnpm test` | 0 | 55 files / 459 tests 通过 |
| `pnpm test:e2e:daily-session` | 0 | Chromium 8/8 通过 |
| `pnpm typecheck` | 0 | 通过 |
| `pnpm lint` | 0 | 通过 |
| `pnpm build` | 0 | 通过；使用仅本次进程的本机占位配置 |
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

## Task 8 放行条件

1. 启动固定 SHA 的 `projects_new`、单个 agent-api instance 和同源前端代理。
2. 提供两个隔离测试账号，不复用真实个人账号。
3. 验证 Cookie、Origin、`Last-Event-ID`、状态码及 `text/event-stream` 透传，关闭 SSE buffering。
4. 真实 smoke 退出码为 `0`，并记录匿名化环境矩阵、前后端 SHA、命令结果。
5. 完成人工桌面验收后，才可把状态改为真实后端通过。

## 范围边界

本记录只覆盖 Task 7 的前端确定性验收。未修改后端；未宣称真实模型、PostgreSQL/Redis、Xiaozhi、云端网关或生产权限链路通过。
