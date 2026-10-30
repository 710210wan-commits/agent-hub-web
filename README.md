# 智能体平台前端

面向桌面 Web 的独立 UI 壳。统一展示对话、GIS、知识库、Skill、MCP 与平台设置。当前阶段以前端结构和可替换展示槽位为主，不修改 `projects_new`。

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

Windows PowerShell：

```powershell
$env:NEXT_PUBLIC_CHAT_TRANSPORT='projects-new'
$env:AGENT_API_ORIGIN='http://127.0.0.1:3001'
corepack pnpm@9.0.0 dev
```

## 环境变量

| 变量 | 可见范围 | 默认值 | 说明 |
|---|---|---|---|
| `NEXT_PUBLIC_CHAT_TRANSPORT` | 浏览器 | 开发 `mock`；生产 `projects-new` | `mock` 或 `projects-new`；生产显式设为 `mock` 会失败 |
| `NEXT_PUBLIC_AGENT_API_BASE` | 浏览器 | `/agent-api` | 只允许 same-origin 相对路径 |
| `AGENT_API_ORIGIN` | 服务端 | 空 | 开发/Next 代理上游；不会进入浏览器包 |

浏览器请求 `/agent-api/*`。Next 开发代理可通过 `AGENT_API_ORIGIN` 转发；云端建议由同域网关直接转发，示例见 `deploy/nginx.example.conf`。

## 验证

```bash
corepack pnpm@9.0.0 lint
corepack pnpm@9.0.0 typecheck
corepack pnpm@9.0.0 test
corepack pnpm@9.0.0 test:e2e
corepack pnpm@9.0.0 build
```

## 容器

```bash
docker build -t agent-hub-web .
docker run --rm -p 3000:3000 agent-hub-web
```

镜像运行 Next standalone 输出，使用非 root 用户。真实部署需让网关把 `/agent-api/` 路由到 `projects_new`，并关闭 SSE buffering。

## 当前边界

- AgentLoop 是对话隐式基底，不作为用户开关。
- Workflow 暂不纳入首版。
- GIS 只有独立工作台占位，不包含地图引擎。
- 历史会话为 fixture；无 localStorage、鉴权或持久化。
- 知识库、Skill、MCP 支持 UI 多选和消息级快照；当前真实后端尚未消费这些选项，因此真实模式会阻止带选择的提交。
- 流式正文只显示最终可见内容；活动状态只显示安全的短描述，不展示内部推理。
- 当前真实后端支持停止，不支持续写。断流后由用户手动重新生成；服务端任务可能仍在运行。
- 模型、评测、API、详情、创建、附件均为明确的待接入槽位。

## 后续接入点

- 统一认证与会话服务
- 各能力负责人替换资源列表、详情和操作槽位
- `projects_new` 合并稳定后补齐 selection schema、恢复与 steer
- GIS 负责人选型轻量地图引擎并替换具名槽位
- 云端域名、TLS、观测与网关策略

当前仓库仅本地 Git，未配置远端。
