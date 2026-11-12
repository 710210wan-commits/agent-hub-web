# 智能体平台前端设计说明

日期：2026-10-27
目标仓库：`S:\Projects\agent-hub-web`
状态：已批准；2026-11-05 批准纳入日常模式 Skill Creator + Skill Market 完整生命周期；2026-11-11 批准纳入单用户 Work Skill Market / Editor

## 1. 意图

建设独立、简洁、可扩展的智能体 Web 前端。首页采用 GPT 类对话体验，让用户进入系统即可提问；左侧直接展示主要能力入口。平台负责统一外壳、导航、设计 token、基础控件、状态体验、对话交互与扩展协议；各能力可独立调整信息架构和展示形式，但不得自行形成与新前端割裂的视觉语言。

AgentLoop 是普通对话的隐式运行底座，不作为用户可选能力。Workflow 暂不进入首版。

## 2. 首版目标

- 桌面 Web 优先，默认浅色、中文界面。
- 提供日常、办公两种独立模式；导航一致。
- 提供 GPT 类新对话、动作提示、正文流式展示、停止与继续 UI。
- 左侧提供 GIS 工作台、知识库、Skill、MCP 管理入口。
- 知识库、MCP 页面继续使用可替换的最小资源管理模板。
- Skill 页面在 `mode=daily` 接入 Skill 广场、作者工作台、Creator、审核、发布和安装完整生命周期。
- Skill 页面在 `mode=work` 接入 Xiaozhi 现有 Skill Market 与已安装 Skill 管理编辑器，通过独立同源 BFF 工作，不请求或回退到日常 Skill Market。
- 设置页预留模型、评测、API 三个入口。
- 前端可切换 mock transport 与现有 `projects_new` transport。
- 项目独立构建、测试、容器化部署。

## 3. 非目标

- 不实现 Workflow。
- 不修改 `S:\Projects\projects_new`。
- 不在 Skill 模块内新建认证体系；Work Skill 复用现有统一登录的 HttpOnly DSI Session，并继续由 Xiaozhi 对固定操作员账号执行最终资源权限判断。
- 不实现真实会话持久化。
- 知识库和 MCP 不实现资源编辑流程；Skill 的编辑、审核、发布和安装流程按本文 Skill 扩展设计实施。
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
- `/skills/[id]?mode=daily|work`
- `/skills/mine?mode=daily`
- `/skills/creator?mode=daily[&draftId=...]`
- `/skills/drafts/new?mode=daily`
- `/skills/drafts/[id]?mode=daily`
- `/skills/review?mode=daily`
- `/skills/manage?mode=daily`
- `/mcp?mode=daily|work`
- `/settings?section=model|evaluation|api&mode=daily|work`
- `/knowledge/[id]`、`/mcp/[id]`：仅返回导航与内容插槽；`/skills/[id]` 按 mode 分别进入 daily 详情或 Work Editor

缺失或非法 `mode` 回退到 `daily`。

## 6. 日常与办公

两种模式使用相同布局、组件和左侧导航。除 Skill 模块外，首版可见差异仅为：

- 欢迎语
- 三个示例问题
- 默认知识库、Skill、MCP 选择

切换模式进入另一套独立上下文，不修改当前会话的模式、工具或权限边界。未来模式隔离、默认加载和额外办公工具由配置与后端能力补全。

Skill 模块的模式边界已经冻结：

- `mode=daily` 只通过新前端同源 BFF 访问服务端白名单中的日常 Skill Market 后端。
- `mode=work` 只通过独立同源 `/api/work-skills/*` BFF 访问 Xiaozhi 白名单中的 `/api/skills/*` 与 `/api/system/skills/*`；不得调用 daily `/api/skill-market/*`。
- `mode=work` 不得显示或复用 daily 的缓存、草稿、Creator、审核、发布、安装或 Runtime 状态；`mode=daily` 同样不得显示或复用 Work 的安装草稿、文件编辑和权限状态。
- query key、请求生命周期、选择、弹窗和 mutation 状态必须按 mode 隔离；模式切换时中止旧请求并清除离开模式的临时页面状态。
- Work 首版采用单用户固定操作员模式：一个 Agent Hub 部署对应一个 `XIAOZHI_API_KEY` 所属账号，不宣称支持多用户 `can_manage`、共享范围或文件权限隔离。
- Work BFF 必须先使用请求中的 `dsi_app_session` 在服务端验证完整统一登录态；anonymous、demo、失效会话和认证服务不可用均 fail closed，且不得调用 Xiaozhi。

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

知识库、MCP 共用最小模板：

- 页面标题与说明
- 搜索
- 少量筛选
- 新建入口
- 默认卡片列表
- loading、empty、error 插槽

负责人可在统一设计语言内选择卡片、表格、看板或其他适合的信息展示形式。详情页和编辑流程可按业务需要扩展，但必须继续使用新前端已有的页面宽度、间距、字号、颜色、边框、按钮、表单、卡片和 loading/empty/error 状态模式。

详情页首版只提供返回导航和内容插槽。

### 10.1 Skill 模块扩展

Skill 不再沿用只读 fixture 和详情占位，而是在 `mode=daily` 提供以下页面能力：

- Skill 广场：展示日常统一 Catalog 中的内置和已发布市场 Skill，支持名称、描述、工具搜索及分类筛选。
- “我的”：展示与当前服务端 Principal 关联的草稿、发布或安装状态，不用浏览器本地状态推断所有权。
- 作者工作台：草稿列表、ZIP/目录上传、编辑、删除、revision conflict 和提交审核。
- Skill Creator：基本信息、Requirement Interview、Spec 确认、Tool Resolution、Bundle 生成、Validator diagnostics、Smoke Test 和保存草稿。
- 审核：Submission 证据、Trigger Test、审核意见、通过、驳回和删除待审核项。
- 发布管理：Publication、Artifact 下载、安装、启用、停用、下架和创建新修订。

`mode=work` 提供 Xiaozhi 现有能力的等价换肤，不复用 daily Creator 生命周期：

- Work Skill Market：搜索、推荐/内置/上传分组、`SKILL.md` 居中预览、启停、上传、远程仓库安装、全局搜索安装和批量删除。
- Work Skill Editor：从已安装 Skill 的预览弹窗进入，提供代码管理、生效范围、依赖管理三个页签，以及导出和删除。
- 安装保持 prepare → 草稿确认/取消两阶段；Creator 仅指已安装 Skill 的管理编辑器，不增加从空白创建、Requirement Interview、审核或发布流程。
- 按钮区域、左右顺序、分组顺序、页签顺序、弹窗 footer 和危险操作确认与原 Xiaozhi Vue 页面保持一致；允许变化仅限 Agent Hub 外壳、设计 token 和响应式适配。

App Router 页面保持薄。daily 业务继续放在现有 contract、api、catalog、authoring、creator、review、publication 和共享组件中；Work 业务独立放在 `src/features/skills/work/`，不得把两套后端领域模型强行合并。API DTO、运行时校验、错误转换和 UI ViewModel 分离；daily Creator 使用显式步骤状态机，Work Editor 按文件、设置和依赖职责拆分，不能重新形成超大单文件页面。

Skill 模块的交互与视觉一致性是绑定约束：

- 优先复用 `AppShell`、`page-heading`、资源卡片、返回链接、按钮、表单、徽标和共享状态组件，不为 Skill 另建一套全局样式或设计 token。
- 新样式只服务于 Catalog、Draft、Creator、Review 和 Publication 等必要业务结构，其颜色、圆角、间距、排版和交互反馈必须与新前端其他页面保持一致。
- 长流程可增加步骤导航、diagnostics 和 Evidence 等业务组件，但不得复制 shell、导航、通用状态页或基础表单控件。
- 每个 Skill 前端 Task 完成前都要与对话、知识库、MCP 和设置页做同屏视觉自审；发现不一致时优先复用/抽取现有前端模式，不以 Skill 业务特殊为由扩展独立风格。

### 10.2 Skill 后端与契约边界

- daily 新前端只访问 `DSI-agent-loop` 公开的 `/api/skill-market` 契约，不读取后端源码、本地文件系统、旧 `/api/skills` 或旧 Skill BFF。
- 新前端新增同源 `/api/skill-market/[...path]` BFF；BFF 只负责目标白名单、HMAC Principal、请求转发、超时和响应边界校验，不复制领域逻辑。
- 浏览器不能提交上游 Origin、可信用户、角色、权限或 managed scenarios；后端仍是身份和权限的最终权威。
- HMAC Secret 只存在于服务端环境变量，不进入 `NEXT_PUBLIC_*`、客户端 bundle、日志或错误响应。
- 后端版本化 OpenAPI/JSON Schema 是 Skill 跨仓 DTO 的唯一事实源；新前端据此生成 TypeScript 类型和运行时校验器，生成物禁止手工修改。
- 下载必须保留 `Content-Type`、`Content-Disposition` 和 `X-Content-Sha256`；JSON、上传、204、4xx/5xx 和取消语义不得被 BFF 改写成另一套业务协议。
- Work 新增独立同源 `/api/work-skills/[...path]` BFF，只允许已登记的 method + path + query 组合访问 Xiaozhi 现有 Skill 接口；不得扩大现有聊天 `/api/work-agent/*` 代理。
- Work BFF 只复用 server-only `XIAOZHI_API_ORIGIN` 与 `XIAOZHI_API_KEY`。浏览器提交的 Authorization、Host、Cookie 和其他私有凭据不得转发到 Xiaozhi；`dsi_app_session` 只发送给 DSI 会话验证接口。
- Work BFF 必须支持 JSON、multipart 上传和 ZIP 流式下载，保留安全的状态码、`Content-Type` 与 `Content-Disposition`，并清洗上游错误和响应头。
- Work DTO 以已冻结的 Xiaozhi 接口 fixture 和最小防御性运行时解析为边界；本期不要求修改 Xiaozhi 或新增其 OpenAPI/Schema。

### 10.3 Skill 安全和 Runtime 规则

- 日常 Catalog 与日常 Runtime 使用同一来源、作用域、可见性、名称规范化和安装准入规则。
- 市场 Skill 不得与受保护内置 Skill 同名；提交、发布、安装和 Runtime 四个边界均拒绝冲突，本期不提供管理员覆盖入口。
- 历史同名项必须显式显示为不可安装、不可运行，不能静默覆盖内置 Skill。
- 已审核、已发布、安装并启用到 `daily` 且制品有效、名称不冲突的市场 Skill 自动进入日常 Runtime。
- 停用 Installation、下架 Publication 或制品/hash 校验失败后，Skill 退出新请求的可发现和可执行集合。
- 前端不展示完整内部 Prompt、内部思维链、敏感 observation 或密钥。
- Work 的 Xiaozhi API Key 只能存在于服务端环境变量，不得进入客户端 bundle、浏览器请求、日志或错误响应；BFF 必须在读取上传体和调用 Xiaozhi 前完成 DSI Session 校验。
- Work 以 Xiaozhi 返回的 `can_manage`、`source_type` 和资源状态为权威；`can_manage === false` 仅可查看，内置 Skill 不可删除且生效范围只读，批量删除上限为 50。
- Work 单用户部署要求统一登录账号与 `XIAOZHI_API_KEY` 所属账号一致；若未来要求多用户身份隔离，必须另行批准 DSI 到 Xiaozhi 的服务端身份桥接，不得在前端模拟。

### 10.4 Skill 状态和错误体验

- 页面和长操作覆盖 loading、empty、error、refreshing、pending、失败、重试和防重复提交。
- 发布并启用必须区分“发布成功”和“安装启用成功”；安装失败时保留 Publication，并允许只重试安装。
- 前端优先按稳定结构化错误 code 映射体验，同时兼容后端保留的 `error` 文本。
- 401/403、404、409、422 和网关超时具有不同说明及恢复动作；422 diagnostics 必须保留结构化详情。
- 本期不按角色拆分前端入口；后端对 author、reviewer、admin、scenario_admin 执行最终授权。
- Work 收到 DSI 401、`enabled: false` 或会话校验不可用时，显示重新登录或服务不可用提示，不得降级到固定 API Key 继续请求；上传、安装、启停、保存和删除必须防重复提交。

### 10.5 实施进展（2026-11-09）

- Catalog、广场、详情和“我的 Skill”（C-01～C-05）已由 `f7b0e31`、`ad55fe0`、`f579c50`、`c8a9048` 实现。
- Draft 作者工作台（D-01～D-04）已由 `0f9893a` 实现；Creator（E-01～E-06）已由 `2557f21` 实现。
- 审核、Trigger Test 和发布衔接（F-01～F-04）已由 `13375f6` 实现；ChangeLog 由 `8ce144b` 回填。
- Publication、Artifact、Installation 管理和权限/作用域负向体验（G-01～G-05、H-04）已由 `d0a637c` 实现，入口为 `/skills/manage?mode=daily`，详情为 `/skills/manage/[id]?mode=daily`。
- Artifact 下载保存前同时校验实际字节 SHA-256、`X-Content-Sha256` 和 Publication content hash；任何不一致均显示持久错误且不保存文件。
- 当前公开契约允许 `scenario|agent` 类型但没有 authorized agent target 或 Installation 列表接口；为避免浏览器扩大 managed scope 或虚构安装明细，当前页面只开放固定 `scenario:daily`，不读取 URL/自由表单中的 scope。后端仍是权限和作用域的最终权威。
- K-03～K-08 已收口测试与交付门禁：真实 Docker PostgreSQL + Artifact Store + Catalog/Runtime 生命周期验证 enable、disable 和 withdraw 退出；两仓独立 release gate、production build、Schema/生成物、敏感数据扫描均通过。新前端全量 Vitest 346/346、Playwright 21 passed/1 个缺少真实小智密钥的外部用例 skipped。K-07 使用 API/旧前端/新前端三个 production 进程比较同一 14 项 Catalog，验证旧四个 Skill 页面、work 零请求以及双向停机隔离；证据位于 `docs/skill-market/evidence/2026-11-09-parallel-run.json`。兼容矩阵和 Runbook 已冻结发布顺序与独立回滚，本轮未执行生产发布或数据库变更。

### 10.6 Work Skill 扩展批准（2026-11-11）

- 原 Work 零请求占位约束已由本节和 `docs/skill-market/2026-11-11-work-skill-frontend-implementation.md` 明确取代；历史测试与证据仅说明当时基线，不再代表 Work 最终验收要求。
- 本次批准仅改变 `mode=work` 的前端、同源 BFF 和测试范围；daily 的公开契约、HMAC Principal、生命周期和 Runtime 规则保持不变。
- Xiaozhi 后端、数据库和存储模型保持零代码、零结构改动；首版只验收单用户固定操作员模式。

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

统一认证现已由应用级 `AuthProvider`、`AuthBoundary` 和 HttpOnly `dsi_app_session` Cookie 提供。页面边界负责未登录体验，但不能替代服务端 API 鉴权。

Work Skill BFF 必须在服务端用请求 Cookie 调用 DSI 会话状态接口，并只接受完整启用状态；浏览器不读取或转发 Xiaozhi Token。daily Skill Market 继续使用既有 HMAC Principal 边界，两种模式不得互换身份机制。

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
    skills/
      api/
      authoring/
      catalog/
      components/
      contracts/
      creator/
      publication/
      review/
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

### 19.1 Skill 扩展验收

- `/skills?mode=daily` 使用真实日常统一 Catalog，完成广场、详情、我的、Draft、Creator、审核、发布、下载和安装生命周期。
- `/skills?mode=work` 展示 Work Skill Market；`/skills/[slug]?mode=work` 展示已安装 Skill Editor，核心功能、操作路径和控件顺序与原 Xiaozhi Vue 页面一致。
- daily 新 Skill 模块不调用旧前端页面、旧 Skill BFF 或旧 `/api/skills`；Work 只能经独立 `/api/work-skills/*` 白名单 BFF 调用 Xiaozhi Skill 接口，二者不得互相回退或共享业务状态。
- Work 未登录、anonymous、demo、失效会话和认证服务不可用均在调用 Xiaozhi 前拒绝；Cookie 与浏览器凭据不转发到 Xiaozhi，API Key 不进入客户端或日志。
- Work 支持列表、搜索、预览、启停、上传、远程安装、草稿确认、批量删除、文件编辑、生效范围、依赖、导出和删除；只读、内置和批量上限行为与 Xiaozhi 权威响应一致。
- Work 首版按单用户固定操作员模式验收，不宣称多用户隔离；Xiaozhi 后端和数据库无代码或结构改动。
- Catalog 与 Runtime 对受保护名称、作用域、可见性和安装状态结论一致。
- 非冲突市场 Skill 安装并启用到 daily 后可被 Runtime 发现；停用或下架后退出。
- OpenAPI/JSON Schema 导出、前端代码生成和 CI 漂移检查可重复执行。
- 后端和旧前端保持向后兼容，数据库结构和不可变历史数据不变。
- Skill 相关单元、组件、BFF、Playwright、跨仓 E2E、双仓构建和旧前端回归通过。
- Skill 广场、我的 Skill、Draft、Creator、审核和发布页与新前端其他页面共用设计 token、基础控件和状态模式，1280px 桌面布局无独立子产品感。

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

## 22. 变更批准记录

| 日期 | 变更 | 状态 |
| --- | --- | --- |
| 2026-10-27 | Agent Hub Web V1 设计基线 | 已批准并实现 |
| 2026-11-05 | 将日常模式 Skill Creator + Skill Market 完整生命周期纳入绑定设计；work 保持无请求占位 | 已批准，可据此编写跨仓 Development Plan |
| 2026-11-07 | 固化 Skill 模块与新前端其他部分的视觉/交互一致性，同步 Draft/Creator 实际路由 | 已批准 |
| 2026-11-11 | 以单用户固定 Xiaozhi 操作员模式接入 Work Skill Market / Editor，建立独立会话门禁 BFF，并保持 daily 完全隔离 | 已批准；取代此前 Work 无请求占位约束 |

2026-11-05 的 daily 批准继续受其跨仓 Development Plan 约束。2026-11-11 的 Work 批准以 `docs/skill-market/2026-11-11-work-skill-frontend-implementation.md` 为实施计划，后续生产代码必须按其中独立 Task、TDD、测试、评审和交付门禁执行。
