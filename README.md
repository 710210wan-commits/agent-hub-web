# 智能体平台前端

面向桌面 Web 的独立 UI 壳。统一展示对话、知识库、Skill、MCP 与平台设置；GIS 入口通过新 tab 打开现有老前端 Cesium 首页。当前阶段以前端结构和可替换展示槽位为主，不修改 `projects_new`。

## 技术栈

- Next.js 16 / React 19 / TypeScript 5
- Tailwind CSS 4 + 原生 CSS
- Vitest / Testing Library / Playwright
- pnpm 9，Node.js 20+

## 本地开发

安装依赖：

```bash
corepack pnpm@9.0.0 install --frozen-lockfile
```

默认使用确定性 mock 流：

```bash
corepack pnpm@9.0.0 dev
```

连接 `projects_new`：

```bash
NEXT_PUBLIC_CHAT_TRANSPORT=projects-new AGENT_API_ORIGIN=http://127.0.0.1:3001 corepack pnpm@9.0.0 dev
```

Windows PowerShell 运行：

```powershell
$env:NEXT_PUBLIC_CHAT_TRANSPORT='projects-new'
$env:AGENT_API_ORIGIN='http://127.0.0.1:3001'
corepack pnpm@9.0.0 dev
```

连接 Xiaozhi 办公模式 BFF：

```powershell
$env:XIAOZHI_API_ORIGIN='http://127.0.0.1:5050'
$env:XIAOZHI_API_KEY='<local-yxkey-secret>'
$env:XIAOZHI_WORK_AGENT_SLUG='default-chatbot'
corepack pnpm@9.0.0 dev
```

上述三个变量仅供 Next.js 服务端 Route Handler 使用。浏览器始终请求同源 `/api/work-agent/*`，不会直接访问 Xiaozhi，也不会收到 API Key。

访问地址：

```bash
http://localhost:3000
```

GIS 导航默认通过新 tab 打开 `http://localhost:5000` 的老前端完整首页；老前端在 `projects_new` 根目录使用 `pnpm dev`，其现有开发端口为 5000。

### Xiaozhi 办公模式最小联调

启动顺序：

1. 启动 PostgreSQL 与 Redis。聊天、SSE、停止和历史会话不要求 RAG、向量 DB 或 sandbox。
2. 在 Xiaozhi 仓库根目录分别启动 API 与 Worker；两者都用进程环境注入 `DEEPSEEK_API_KEY`。
3. 为联调用户创建启用的 `yxkey_` API Key，只写入 Agent Hub 服务端环境变量 `XIAOZHI_API_KEY`。
4. 配置本节列出的 Agent Hub 环境变量，再启动前端。

```powershell
# Xiaozhi API terminal
$env:DEEPSEEK_API_KEY='<local-secret>'
.\backend\.venv\Scripts\python.exe .\scripts\dev\run_native_api.py

# Xiaozhi Worker terminal
$env:DEEPSEEK_API_KEY='<local-secret>'
.\backend\.venv\Scripts\python.exe .\scripts\dev\run_native_worker.py

# Agent Hub terminal
$env:XIAOZHI_API_ORIGIN='http://127.0.0.1:5050'
$env:XIAOZHI_API_KEY='<local-yxkey-secret>'
$env:XIAOZHI_WORK_AGENT_SLUG='default-chatbot'
corepack pnpm@9.0.0 dev
```

联调地址与模式映射：

| 项目 | 地址/后端 |
|---|---|
| Xiaozhi health | `http://127.0.0.1:5050/api/system/health` |
| Agent Hub | `http://127.0.0.1:3000`（可用 `--port 3100` 改端口） |
| 日常模式 | `projects_new` canonical Session，经 `/agent-api/conversations/*`；新对话、历史、多轮、SSE、取消与恢复已接入 |
| 办公模式 | Xiaozhi，浏览器只访问同源 `/api/work-agent/*` |
| 办公历史 | `/history?mode=work` |
| 办公会话 | `/chat?mode=work&conversation=<xiaozhi-thread-id>` |

日常模式以 canonical Conversation/Turn/Event 为唯一会话链路。旧 `/tasks` 只保留给非 canonical 兼容入口和固定 demo；Agent Hub Daily 不用它创建或恢复历史会话，也不以 `localStorage` 作为会话事实源。

当前 `XIAOZHI_API_KEY` 代表一个 shared-demo-user。所有访问者共享该用户的办公会话列表；它只适合内网联调/低风险演示，不提供登录、权限或用户隔离。统一认证接入后必须替换为服务端用户身份映射。

停止顺序：在 Agent Hub、Worker、API 三个终端分别按 `Ctrl+C`；确认 3000/3100、5050 不再监听后，再按基础设施项目自己的 Compose 命令停止 PostgreSQL/Redis。不要删除共享 volume。

本轮非目标：统一认证与多用户隔离、RAG/知识库、sandbox Skill、刷新后 active run 恢复、动态 Skill/MCP 选择、附件与产物、历史搜索/删除/重命名。

## 环境变量

| 变量 | 可见范围 | 默认值 | 说明 |
|---|---|---|---|
| `NEXT_PUBLIC_CHAT_TRANSPORT` | 浏览器 | 开发 `mock`；生产 `projects-new` | `mock` 或 `projects-new`；生产显式设为 `mock` 会失败 |
| `NEXT_PUBLIC_AGENT_API_BASE` | 浏览器 | `/agent-api` | 只允许 same-origin 相对路径 |
| `NEXT_PUBLIC_LEGACY_FRONTEND_URL` | 浏览器 | 开发 `http://localhost:5000`；生产必填 | 老前端完整首页的 HTTP(S) 地址，不允许内嵌账号密码 |
| `AGENT_API_ORIGIN` | 服务端 | 空 | 开发/Next 代理上游；不会进入浏览器包 |
| `XIAOZHI_API_ORIGIN` | 服务端 | 空 | Xiaozhi API 的纯 HTTP(S) origin，不允许凭据、路径、查询或 fragment |
| `XIAOZHI_API_KEY` | 服务端 | 空 | `yxkey_` 凭据；只由 BFF 注入上游 `Authorization`，不得使用 `NEXT_PUBLIC_*` |
| `XIAOZHI_WORK_AGENT_SLUG` | 服务端 | 空 | 办公模式固定 Agent slug；BFF 会覆盖浏览器提交的 Agent 值 |

浏览器请求 `/agent-api/*`。Next 开发代理可通过 `AGENT_API_ORIGIN` 转发；云端建议由同域网关直接转发，示例见 `deploy/nginx.example.conf`。

## 验证

```bash
corepack pnpm@9.0.0 lint
corepack pnpm@9.0.0 typecheck
corepack pnpm@9.0.0 test
corepack pnpm@9.0.0 test:e2e:daily-session
corepack pnpm@9.0.0 test:e2e
corepack pnpm@9.0.0 build
```

Xiaozhi 后端相关回归在其 `backend` 目录运行。测试依赖位于独立 `test` group；Windows 应用控制可能阻止 `pytest.exe` shim，因此统一使用模块入口：

```powershell
uv run --group test python -m pytest test/unit/test_auth_utils.py test/integration/api/test_apikey_router.py test/unit/services/test_agent_run_service.py test/unit/storage/test_conversation_repository.py -q
```

## 容器

```bash
docker build --build-arg NEXT_PUBLIC_LEGACY_FRONTEND_URL=https://gis.example.com -t agent-hub-web .
docker run --rm -p 3000:3000 agent-hub-web
```

`NEXT_PUBLIC_LEGACY_FRONTEND_URL` 是构建时公开地址；生产容器构建必须传入实际老前端 HTTP(S) 地址，不能使用客户的 localhost。

镜像运行 Next standalone 输出，使用非 root 用户。真实部署需让网关把 `/agent-api/` 路由到 `projects_new`，并关闭 SSE buffering。

## 当前边界

- AgentLoop 是对话隐式基底，不作为用户开关。
- Workflow 暂不纳入首版。
- GIS 不提供新版内部页面；点击导航后在新 tab 打开老前端 Cesium 首页。
- 日常新对话、历史、多轮、SSE、取消与恢复使用 `projects_new` canonical Session；确定性浏览器测试使用 fixture，真实联调使用双用户 smoke；无 `localStorage` 会话事实源。
- Xiaozhi 办公 BFF 首版使用单一演示用户 API Key。接入办公历史页后，所有演示访问者会看到同一用户的办公会话；这不是权限隔离。
- 知识库、Skill、MCP 支持 UI 多选和消息级快照；当前真实后端尚未消费这些选项，因此真实模式会阻止带选择的提交。
- 流式正文只显示最终可见内容；活动状态只显示安全的短描述，不展示内部推理。
- 两套真实后端均支持停止；办公模式会同时停止浏览器读取并请求 Xiaozhi cancel。当前不支持续写；断流后由用户手动重新生成。
- 模型、评测、API、详情、创建、附件均为明确的待接入槽位。

## 后续接入点

- 统一认证接入后，在 `/api/work-agent/*` BFF 中把固定 `XIAOZHI_API_KEY` 替换为当前用户的服务端身份映射，并按用户隔离 thread；浏览器侧仍只使用同源接口。
- 各能力负责人替换资源列表、详情和操作槽位
- `projects_new` 合并稳定后补齐 selection schema、恢复与 steer
- 云端域名、TLS、观测与网关策略

当前仓库仅本地 Git，未配置远端。
