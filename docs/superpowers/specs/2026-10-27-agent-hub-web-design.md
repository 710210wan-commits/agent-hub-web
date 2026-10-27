# 智能体平台前端设计说明

日期：2026-10-27  
目标仓库：`S:\Projects\agent-hub-web`  
状态：reviewer 已检查，待用户最终批准；批准前不创建正式项目

## 1. 意图

建设独立、简洁、可扩展的智能体 Web 前端。首页采用 GPT 类对话体验，让用户进入系统即可提问；左侧直接展示主要能力入口。平台负责统一外壳、导航、对话交互与扩展协议，各能力负责人以后可独立替换页面展示形式和视觉风格。

AgentLoop 是普通对话的隐式运行底座，不作为用户可选能力。Workflow 暂不进入首版。

## 2. 首版目标

- 桌面 Web 优先，默认浅色、中文界面。
- 提供日常、办公两种独立模式；导航一致。
- 提供 GPT 类新对话、动作提示、正文流式展示、停止与继续 UI。
- 左侧提供 GIS 工作台、知识库、Skill、MCP 管理入口。
- 知识库、Skill、MCP 页面使用可替换的最小资源管理模板。
- 设置页预留模型、评测、API 三个入口。
- 前端可切换 mock transport 与现有 `projects_new` transport。
- 项目独立构建、测试、容器化部署。

## 3. 非目标

- 不实现 Workflow。
- 不修改 `S:\Projects\projects_new`。
- 不实现真实登录、权限或统一认证。
- 不实现真实会话持久化。
- 不实现资源编辑流程。
- 不安装 Cesium、MapLibre 或其他地图引擎。
- 不实现深色主题、移动端专项体验、多语言运行时。
- 不实现模型、评测、API 的真实配置协议。
- 不承诺现有后端能够输出正文 token/delta；后端协议升级另行实施。

## 4. 反目标

- 不复制 `projects_new` 的后端、数据库、Redis、AgentLoop 或旧三栏页面。
- 不让临时 mock/localStorage 变成产品数据协议。
- 不因某项能力尚未实现而把大量条件逻辑写进统一外壳。
- 不在生产环境失败时自动展示 mock 答案。
- 不静默删除、替换或降级用户选择的知识库、Skill、MCP。
- 不绑定 Vercel 或特定云厂商。

## 5. 信息架构

统一左侧导航：

1. 新对话
2. 历史对话
3. GIS 工作台
4. 知识库
5. Skill
6. MCP
7. 设置

AgentLoop 不显示。GIS 工作台独立于普通对话。知识库、Skill、MCP 左侧入口进入资源管理页；对话框中的同名入口仅负责选择和启用资源。

建议路由：

- `/chat?mode=daily|work`
- `/history?mode=daily|work`
- `/gis?mode=daily|work`
- `/knowledge?mode=daily|work`
- `/skills?mode=daily|work`
- `/mcp?mode=daily|work`
- `/settings?section=model|evaluation|api&mode=daily|work`
- `/knowledge/[id]`、`/skills/[id]`、`/mcp/[id]`：仅返回导航与内容插槽

缺失或非法 `mode` 回退到 `daily`。

## 6. 日常与办公

两种模式使用相同布局、组件和左侧导航。首版可见差异仅为：

- 欢迎语
- 三个示例问题
- 默认知识库、Skill、MCP 选择

切换模式进入另一套独立上下文，不修改当前会话的模式、工具或权限边界。未来模式隔离、默认加载和额外办公工具由配置与后端能力补全。

## 7. 新对话与对话框

空白页保持极简：中央欢迎语、主输入框、三个轻量示例问题；不放宣传 Banner 或能力介绍卡片。

对话框提供：

- 附件入口占位
- 知识库多选
- Skill 多选
- MCP 多选
- 发送/停止按钮

三类能力统一使用二级复选列表。模式提供默认选择；用户可修改。每条用户消息保存当轮选择快照，下一轮继承为可编辑默认值。

现有后端没有附件上传契约。首版保留禁用按钮并提示“待接入”，不打开文件选择器，不产生已选择或已上传状态。

选择项失效、无权限或互相冲突时，发送前阻止提交并显示明确错误。不静默移除或假装已启用。

## 8. 对话运行状态

UI 状态机至少包含：

- `idle`：等待输入
- `submitting`：创建任务
- `working`：显示一条安全、可见的动作说明
- `streaming`：逐段追加最终正文
- `stopped`：保留已有正文，提供继续、重新生成
- `completed`：显示完整正文和来源区
- `disconnected`：中断任务，等待用户手动继续
- `failed`：明确错误，可重试

运行中只展示用户可见动作摘要，不展示内部思维链。正文开始后，动作区域收拢为“已完成 N 个步骤”，可展开查看安全步骤摘要。

目标交互中，断开连接后不自动继续；用户手动继续时从最后完成步骤创建续接任务，不承诺恢复到某个 token 或工具执行中点。Steer 首版不展示，仅保留组件和协议扩展位。

现有真实后端尚不支持 checkpoint/resume：真实模式停止后保留已有内容，只提供“重新生成”，隐藏“继续生成”；mock 模式可完整演示“继续生成”。后端未来提供 resume 契约后再开放真实按钮。

真实断网时，前端立即关闭本地流并 best-effort 调用 abort，但无法保证服务端任务已经停止。界面明确提示“连接已断开，服务端任务可能仍在运行”，且不自动重连。严格的“断网即停”依赖未来后端心跳或租约机制。

## 9. 流式协议与 transport

定义统一前端事件 reducer，上层 UI 不依赖具体后端实现。提供两个 adapter：

### mock

- 本地开发默认。
- 回放确定性 fixture。
- 覆盖动作中、正文 delta、停止、断线、继续、完成、失败。
- 仅用于开发、测试和演示。

### projects-new

- `POST /tasks` 创建真实任务。
- `GET /tasks/:taskId/stream` 接收现有 SSE 生命周期事件。
- `POST /tasks/:taskId/abort` 终止任务。
- 现有后端最终正文可能一次性到达；前端不得伪装成真实 token 流。
- 现有后端尚不消费知识库、Skill、MCP 选择：空选择可正常发送；真实模式下只要存在选择就阻止发送并提示“当前后端尚未接入”。不得传递后再假装选择已生效。mock 模式仍完整演示多选。

未来后端增加 `answer_delta`、`answer_done` 等事件时，只扩展 adapter 与事件映射，不改页面组件。正文 delta 在前端以约 40–80ms 批处理更新，按稳定段落渲染 Markdown，减少抖动。

本地默认 `mock`；环境变量切换 `projects-new`。生产构建必须使用真实 transport；失败时显式报错，禁止回退 mock。

## 10. 资源管理页

知识库、Skill、MCP 共用最小模板：

- 页面标题与说明
- 搜索
- 少量筛选
- 新建入口
- 默认卡片列表
- loading、empty、error 插槽

负责人可替换为卡片、表格、看板或其他视觉形式。统一外壳不约束卡片内容、详情页或编辑流程。

详情页首版只提供返回导航和内容插槽。

## 11. GIS 工作台

首版仅提供：

- 地图画布占位
- 工具栏插槽
- 图层面板插槽
- 状态栏插槽

不安装地图引擎。后续优先评估单独、轻量、按需加载的地图方案；GIS 负责人决定最终引擎与交互。

## 12. 设置

设置页包含二级入口：模型、评测、API。首版全部为简洁占位页和扩展插槽，不定义真实配置结构、密钥存储或保存动作。

## 13. 历史与认证

历史页首版只展示 mock 列表，不写入 `localStorage`。刷新允许重置。真实历史等待后端 session API。

首版不实现登录。预留：

- `AuthProvider`
- 当前用户展示槽
- 请求头注入接口
- 未认证/无权限页面边界

后续统一认证系统负责真实身份、权限和模式隔离。

## 14. 技术方案

与 `projects_new` 对齐：

- Next.js 16.1.1，App Router
- React 19.2.3
- TypeScript 5，strict
- Tailwind CSS 4
- shadcn/ui、Radix UI、Lucide
- `react-markdown`、`remark-gfm`
- pnpm 9
- Node.js >=20.9；容器运行 Node 20

状态策略：React context + reducer 管理外壳、模式和对话流；首版不引入 Redux。服务请求使用原生 `fetch`、`EventSource` 与 adapter。避免直接套用 AI SDK `useChat`，因为现有后端采用“创建任务 + 独立 SSE”协议，强行适配会增加中间层。

测试：Vitest + Testing Library 负责 reducer、adapter、关键组件；Playwright 覆盖主要路由与核心对话状态。

## 15. 建议目录

```text
src/
  app/
    chat/
    history/
    gis/
    knowledge/
    skills/
    mcp/
    settings/
  components/
    shell/
    chat/
    resources/
    states/
    ui/
  config/
    copy.ts
    modes.ts
    navigation.ts
  features/
    chat/
      contracts/
      reducer/
      transports/
      fixtures/
    resources/
  providers/
  styles/
  test/
```

文件按职责拆分。各功能页面只依赖稳定 shell 与 slot 接口。

## 16. 响应式、主题、语言

- 主要验收：1280px 及以上。
- 768–1279px：侧栏可折叠。
- 768px 以下：保证基础可用，不专项打磨；GIS 不加载重型地图。
- 首版浅色主题。色彩、间距、圆角使用 CSS token；只预留深色扩展点。
- 首版仅简体中文。用户文案集中管理；暂不引入 i18n 运行时。
- 产品名暂用“智能体平台”；Logo、名称可配置替换。

## 17. 部署

- Next.js `output: "standalone"`。
- 多阶段 Dockerfile。
- 云厂商无关。
- 浏览器只访问同源地址。
- 开发环境由 Next.js rewrite 代理现有后端。
- 生产由 Nginx/云网关处理 TLS、后端代理、SSE 长连接和禁用缓冲。
- 所有环境差异通过环境变量配置。

## 18. Git

设计批准后创建 `S:\Projects\agent-hub-web`，执行 `git init -b main`。只保留本地仓库与本地提交；不配置 remote、不推送。用户后续提供远端项目地址。

## 19. 首版验收

- 所有约定路由可访问，导航和 query 模式切换正确。
- 新对话空白页、消息态、动作态、流式态、停止态、断线态、完成态可通过 mock fixture 重现。
- 三类能力均可多选、继承并形成消息快照；非法选择阻止发送。
- `projects-new` adapter 可创建任务、连接现有 SSE、终止任务、显示最终正文。
- 历史、GIS、资源详情、设置均保持明确占位，不伪造后端能力。
- 生产配置无法启用 mock fallback。
- 1280px 桌面布局通过视觉检查；中等宽度侧栏可折叠。
- lint、typecheck、unit/component tests、Playwright smoke、production build 全部通过。

## 20. 本设计中的实现方判断

- 采用 query 表示模式，而非路径段。
- 首版不用 AI SDK、Redux、地图引擎或 i18n runtime。
- 真实后端暂不具备 token/delta 正文流时，UI如实显示一次性最终正文。
- 可访问性基础规则、错误边界、loading/empty/error 状态作为 shell 质量要求，不需要业务负责人重复实现。

## 21. 参考

- Next.js 安装与版本要求：https://nextjs.org/docs/app/getting-started/installation
- Tailwind CSS + Next.js：https://tailwindcss.com/docs/installation/framework-guides/nextjs
- pnpm workspace：https://pnpm.io/workspaces
- AI SDK 流协议（仅作协议参考，不作为首版依赖）：https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
