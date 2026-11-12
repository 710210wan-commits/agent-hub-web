# Agent Hub Skill Market 部署与回滚 Runbook

> 适用范围：K-06～K-08；新前端 `agent-hub-web` 独立构建、部署、健康检查和回滚。
>
> 后端与旧前端的发布顺序、兼容矩阵和并行运行证据以 `DSI-agent-loop/docs/skill-market/2026-11-09-skill-market-release-runbook.md` 为准。

## 1. 运行时边界

- 新前端只通过同源 `/api/skill-market/*?mode=daily` 访问日常 Skill Market。
- `SKILL_MARKET_DAILY_ORIGIN` 必须指向 API 的纯 Origin，本地默认为 `http://127.0.0.1:3001`，不是新前端的 `3000`。
- 新前端不得请求旧 `/api/skills`、旧 Skill BFF 或旧页面；`mode=work` 不得产生 Skill Market 请求。
- 新旧前端只共享后端公开 API/Schema 和同一数据，不共享源码、构建产物、进程或部署单元。

## 2. Server-only 环境变量

| 变量 | 要求 |
| --- | --- |
| `SKILL_MARKET_DAILY_ORIGIN` | 必填纯 HTTP(S) Origin，不含路径/凭据/查询/fragment |
| `SKILL_MARKET_GATEWAY_HMAC_SECRET` | 必填，至少 32 字符，由 Secret Manager 在运行时注入 |
| `SKILL_MARKET_PRINCIPAL_ID` | 单操作员部署的受信 ID |
| `SKILL_MARKET_PRINCIPAL_ROLES` | `author,reviewer,admin,scenario_admin` 的有序子集 |
| `SKILL_MARKET_PRINCIPAL_MANAGED_SCENARIOS` | 本期固定包含 `daily` |
| `SKILL_MARKET_PRINCIPAL_PERMISSIONS` | 可为空；不得由浏览器提交 |
| `SKILL_MARKET_BFF_TIMEOUT_MS` | 1000～120000，默认 30000 |
| `NEXT_PUBLIC_LEGACY_FRONTEND_URL` | 公开的旧前端 HTTP(S) Origin，构建时固定 |
| `AGENT_API_ORIGIN` | 日常 Agent API Origin，用于 `/agent-api/*` rewrite |

HMAC Secret 不得使用 `NEXT_PUBLIC_*`，不得写入镜像 ARG、日志或错误响应。Docker builder 中的 `build-validation-only-*` 仅用于执行 fail-closed 配置校验，不是运行时 Principal；容器启动时必须注入真实 server-only 值。

## 3. K-06 独立验证

```powershell
$env:NEXT_PUBLIC_CHAT_TRANSPORT='projects-new'
$env:NEXT_PUBLIC_AGENT_API_BASE='/agent-api'
$env:NEXT_PUBLIC_LEGACY_FRONTEND_URL='http://127.0.0.1:5000'
$env:AGENT_API_ORIGIN='http://127.0.0.1:3001'
$env:SKILL_MARKET_DAILY_ORIGIN='http://127.0.0.1:3001'
$env:SKILL_MARKET_GATEWAY_HMAC_SECRET='<32-plus-character-release-gate-secret>'
$env:SKILL_MARKET_PRINCIPAL_ID='release-gate-operator'
$env:SKILL_MARKET_PRINCIPAL_ROLES='author,reviewer,admin,scenario_admin'
$env:SKILL_MARKET_PRINCIPAL_MANAGED_SCENARIOS='daily'
$env:SKILL_MARKET_PRINCIPAL_PERMISSIONS=''
pnpm run verify:skill-market:release
```

该命令依次验证 Schema/lock/生成物、数据库与旧前端隐藏依赖、lint、typecheck、全量 Vitest、全量 Playwright、production build 和构建产物敏感信息扫描。任一步非零退出均禁止发布。

## 4. K-07 并行运行

先完成两仓 production build，再在新前端仓库执行：

```powershell
$env:DSI_AGENT_LOOP_ROOT='D:\0 ysq文件\DSI-agent-loop'
$env:SKILL_MARKET_PARALLEL_EVIDENCE_PATH='docs/skill-market/evidence/2026-11-09-parallel-run.json'
pnpm run test:skill-market:parallel
```

脚本使用独立端口同时启动 API、旧前端 production server 和新前端 production server，比较两个 BFF 返回的 Catalog 身份/修订/状态；浏览器记录证明新前端不请求旧 Origin 或 `/api/skills`。脚本随后停止旧前端并复验新前端，重启旧前端后停止新前端并复验旧前端。

2026-11-09 本地演练已通过：Catalog 14 项一致；旧 `/skills`、`/skills/mine`、`/skills/review`、`/skills/manage` 通过；旧停新存、新停旧存均为 true。版本、Build ID、请求和 Catalog 记录见 [`evidence/2026-11-09-parallel-run.json`](./evidence/2026-11-09-parallel-run.json)。证据中的 `dirty: true` 如实表示演练发生在收口提交前，不应作为洁净生产制品声明。

## 5. 构建、健康检查与 smoke

```powershell
docker build `
  --build-arg NEXT_PUBLIC_LEGACY_FRONTEND_URL=https://legacy.example.com `
  --build-arg AGENT_API_ORIGIN=http://agent-api:3001 `
  -t agent-hub-web:<git-sha> .
```

运行容器时通过 Secret/Config 注入第 2 节变量。健康检查与 smoke：

1. `GET /skills?mode=work` 返回 200，页面加载 Work Skill Market（Work 后端不可用或未登录时展示其自带错误态），访问日志中无 `/api/skill-market/` 请求。
2. `GET /api/skill-market/catalog?mode=daily` 返回 200 且通过运行时 Schema 校验。
3. `GET /skills?mode=daily` 可展示与旧前端一致的市场 Publication ID/revision/status。
4. 运行时日志不包含 HMAC Secret、Principal Header 或业务 Prompt。

## 6. 发布与回滚门禁

1. 先发布向后兼容的 API，不执行 Skill Market Schema/migration/历史数据回写。
2. 使用旧前端完成 Catalog、Draft、Review、Publication/Installation 关键回归。
3. 校验后端 Schema 版本/SHA 与新前端 lock/生成物匹配。
4. 发布新前端并执行 daily smoke、work 零请求和 K-07 隔离检查。
5. 保留旧前端流量和镜像；本期不删除、不下线。

回滚条件：

- 新前端 Critical/Major：只回滚新前端镜像/流量，API 和旧前端不动。
- API Critical/Major：先停止新前端流量，再回滚到仍满足旧契约的 API 版本；若该 API 不包含新 Schema，同步回滚新前端。
- 禁止通过修改 Publication hash、回写历史数据或删除 Artifact 来“修复”发布。
- 回滚后重复第 5 节 smoke，并记录版本、时间、原因、操作人和资源 ID/revision/hash/status。
