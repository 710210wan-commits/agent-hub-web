# Skill Creator 与 Skill Market 新前端更新日志

> 记录范围：从 Skill Creator + Skill Market 接入 `agent-hub-web` 的设计批准开始。
>
> 起始提交：A-01 所在提交。
>
> 维护方式：按日期正序追加；每项简要记录关联 Plan、对应模块序号、问题和修改方案。存在对应模块时，Git 提交使用 `<type>(<module-id>): <description>`；仅完成方案、尚未修改生产代码的事项必须明确标注，不得与已落地功能混淆。

## 2026-11-05

### 1. 批准日常模式 Skill Creator + Skill Market 完整生命周期设计

提交：`c3d954d`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`A-01`（更新并批准新前端 Skill 绑定设计）

#### 问题

- 新前端绑定设计只把 Skill 定义为 fixture 驱动的最小资源占位，明确排除资源编辑流程。
- 原设计没有覆盖作者工作台、Creator、审核、发布、安装、独立 BFF、跨仓 Schema 和 Runtime 准入。
- `daily` 与 `work` 的 Skill Market 后端边界没有形成可验收约束。

#### 修改方案

- 将 `mode=daily` 的 Skill 页面扩展为 Skill 广场、作者工作台、Creator、审核、发布和安装完整生命周期。
- 将 `mode=work` 冻结为未接入占位：不发送 Skill Market 请求，不回退到日常后端，不复用 daily 状态。
- 明确同源 BFF、HMAC Principal、Schema 生成、运行时校验、受保护名称和 daily Runtime 准入规则。
- 将批准后的扩展设计写入 `docs/skill-market/2026-10-27-agent-hub-web-design.md`，原始 V1 绑定设计保持不变；生产代码仍以关联 Plan 为实施门禁。

### 2. 增加 Skill Market 服务端目标与请求门禁

提交：`104e6f2`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T7`（来源细化模块 `B-01`）

#### 问题

- 新前端尚无 daily 后端唯一目标配置，也没有阻止 work、任意目标和越界路径进入后续代理的统一门禁。

#### 修改方案

- 新增服务端专用 `SKILL_MARKET_DAILY_ORIGIN`，在 Next 启动/构建边界校验必填项、HTTP(S) 协议和纯 Origin 格式。
- 仅允许 `daily` 解析到固定目标；`work`、非法 mode、目标覆盖、绝对 URL、编码路径和未登记 Skill Market operation 均在上游调用前失败。
- 本模块只提供 B-01 目标与路径门禁；Principal 签名和实际 BFF 转发分别留给 B-02、B-03。

## 2026-11-06

### 3. 增加 Skill Market Principal 签名适配

提交：`838cea3`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T7`（来源细化模块 `B-02`）

#### 问题

- 新前端 BFF 尚不能按后端冻结的规范建立可信 Principal，且必须防止浏览器提供身份、角色、权限、作用域或 Secret。

#### 修改方案

- 新增服务端单操作员 Principal 配置，校验 Secret 长度、身份、角色和列表字段，并在启动/构建边界 fail closed。
- 按 `skill-market-principal-v1` 对最终 HTTP 方法和 `originalUrl` 生成六个 Header，固定向量与后端 I-01 基线一致。
- 增加过期及方法、路径、身份、角色、managed scenarios、permissions 篡改测试；错误不包含 Secret、签名原文或业务路径。

### 4. 增加同源 Skill Market BFF 代理

提交：`215dc73`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T7`（来源细化模块 `B-03`）

#### 问题

- 浏览器尚无独立同源入口安全转发 Skill Market 请求，JSON、204、下载、超时和取消语义也没有统一边界。

#### 修改方案

- 新增 `/api/skill-market/[...path]` Node.js Route Handler，复用 B-01 目标门禁和 B-02 Principal 签名，不复制业务 DTO 或生命周期逻辑。
- 流式转发请求与响应，保留 JSON 状态、204 和下载的类型、文件名、长度、hash；清理 hop-by-hop、Cookie、Host、Origin 和客户端 Principal Header。
- 增加可配置超时、客户端取消传播及稳定的 502/504/499 网关错误；work、非法 mode 和目标覆盖保持零上游请求。

### 5. 固定跨仓 Skill Market Schema

提交：`8d9e4fa`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T6`（来源细化模块 `B-04`）

#### 问题

- 新前端缺少可离线重建、可追溯且不依赖后端浮动分支的正式 Schema 输入。

#### 修改方案

- 将 `DSI-agent-loop@7ba2dc6821feb3054eebe955038e81a8a9fd6577` 的 `skill-market.v1.json` 字节级固定到前端仓库，记录版本 `1.0.0`、来源路径、28 个 operation 和 SHA-256。
- 新增离线校验命令和漂移测试；字节、版本、hash、来源元数据或 Skill Market 路径范围不符时 fail closed。
- 构建和校验只读取前端仓库内固定制品，不读取本机后端目录或网络分支。

### 6. 生成 Skill Market 前端契约

提交：`3019c3a`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T6`（来源细化模块 `B-05`）

#### 问题

- 固定 Schema 尚未生成前端可直接使用的精确类型和运行时校验器，手写 DTO 会造成跨仓漂移。

#### 修改方案

- 新增 `generate:skill-market-client`，从 B-04 固定制品生成 40 个组件及 28 个 operation 的请求体、路径参数、查询参数和响应 Zod 契约。
- 生成物记录来源 commit、契约版本、Schema hash 和固定生成器版本并纳入版本控制；`check:skill-market-client` 检查漏生成或手改漂移。
- 测试覆盖删除后完整恢复、非法响应拒绝、签名 Header 隔离和禁止导入后端源码或 monorepo shared 包。

### 7. 冻结 Skill Market 信任边界测试矩阵

提交：`2d29e38`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T7`（来源细化模块 `H-01`）

#### 问题

- 浏览器、BFF、日常后端、Artifact Store、数据库和 Runtime 的可信字段、鉴权、授权和审计点尚未形成统一矩阵。
- Origin/Principal 注入、重放、过期签名、跨 scope、跨 mode 和缓存泄漏虽有分散测试，但缺少可追溯的威胁到证据映射。

#### 修改方案

- 新增信任边界矩阵，明确每一层的可信/非可信输入、鉴权点、授权点和审计责任。
- 将七类威胁映射到现有自动化负向测试或明确人工步骤，并标明 H-03、B-06、H-04/I-05 和 K-04/K-05 的后续责任。
- H-01 聚焦边界和证据，不在前端复制后端权限规则，也不提前宣称日志扫描或 API client 缓存门禁完成。

### 8. 建立统一 Skill Market 前端错误模型

提交：`dc446cf`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T2/T6`（来源细化模块 `H-02`）

#### 问题

- 前端尚不能安全解码 I-06 的稳定错误 code、diagnostics 和 requestId，也无法区分认证、权限、不存在、冲突、校验和网关超时。
- 错误体验缺少持久状态和恢复动作，422 diagnostics 无法定位到 Creator/Draft 等业务区域。

#### 修改方案

- 固定 `DSI-agent-loop@076c4951bd0adb97b104e82f595b099c691a4226` 的兼容 v1 Schema 并重新生成类型/Zod 契约。
- 新增 `SkillMarketError` 解码与安全文案映射，未知 code 或非法 envelope 不展示后端原始消息，并保留排障 ID。
- 新增持久错误组件，按 401/403/404/409/422/504 提供不同说明和恢复动作，diagnostics 可标记业务区域、字段和行号。

### 9. 建立 Skill Market API client 与 ViewModel 边界

提交：`25b9523`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T6`（来源细化模块 `B-06`）

#### 问题

- 生成契约尚未接入统一请求边界，非法响应可能流入页面映射。
- 取消、超时、错误、下载和 mutation 缺少统一处理，`work` 需在 client 层阻断。

#### 修改方案

- 新增 operation 驱动的 API client，先校验请求和响应，再调用 ViewModel adapter。
- 统一取消、超时、错误解码、下载校验和 mutation 结果；`work` 在 fetch 前 fail-closed。
- query key 包含 mode、资源类型和资源标识，并固定契约文件 LF 行尾。

### 10. 收口 Skill Market 日志与敏感信息检查

提交：`11cb96d`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T7`（来源细化模块 `H-03`）

#### 问题

- BFF 缺少字段白名单化的统一审计日志，异常细节、上传内容或 Principal 数据存在被误记的风险。
- 尚无自动门禁检查构建产物、Source Map、客户端资产和 `NEXT_PUBLIC_*` 中的 Secret、上游 Origin 或 Principal 配置。

#### 修改方案

- BFF 只记录 method、受控 path、status、duration 和安全 requestId；异常、Secret、Origin、上传/Prompt 和完整 Principal 不进入日志或网关错误。
- 过滤不安全的上游 requestId，避免通过响应 Header 或审计事件把敏感值带给浏览器或日志。
- 新增 `check:skill-market-sensitive-data`，扫描生产构建、Source Map、客户端资产、示例配置和实际构建环境，并用 canary 值执行负向测试。

## 2026-11-07

### 11. 建立 Skill Catalog 数据模型与页面状态

提交：`f7b0e31`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T8`（来源细化模块 `C-01`）；本次同步完成来源细化模块 `B-04` 的 Schema 重钉。

#### 问题

- 前端固定 Schema 仍停留在 I-06 时点的 `1.0.0`（`0ce61e0a`），未包含 I-04 统一 Catalog 在 `1.1.0` 中新增的 `source`、`status: available|conflict` 与 `availability`，C-01 需要的来源和冲突状态无法从契约中表达。
- Catalog 页面此前只有 `skillFixtures` 占位，没有显式表达来源、修订、作用域、加载场景、分类、工具、安装状态和冲突状态的 ViewModel，也没有 `idle/loading/success/empty/error/refreshing` 页面状态。

#### 修改方案

- 将固定制品升级为 `DSI-agent-loop@f8b6ad021547158acbd68181a78a13bf2bc1d92c` 的 `skill-market.v1@1.1.0`（SHA-256 `49d3a134485a714362e50ae92288fb85ce830b225862472846798dbd325c372e`，28 个 operation），重新生成类型与运行时校验器，并同步钉版断言与版本漂移测试。
- 新增 `CatalogItemViewModel`/`SkillCatalogViewModel` 和 `getSkillCatalog` adapter：显式表达来源（内置/市场，兼容旧响应按 `market` 字段确定性推断）、修订、加载场景、分类、工具、安装状态（`built-in-active`/`enabled`/`installable`/`blocked`）与冲突状态；ViewModel 不包含 Prompt 字段，不猜测或补造响应中不存在的数据。
- 新增 Catalog 页面状态机：首载 `loading`、有数据 `success`、零结果 `empty`、失败 `error`、刷新 `refreshing`；刷新与刷新失败均保留已有结果，错误为非阻断展示。
- 新增 `useSkillCatalog` hook：`daily` 自动加载、单飞防重复刷新、加载结果按 generation 防止过期回写、`work` 模式零请求。
- 验证：C-01 聚焦测试 27/27、前端全量测试 211/211、typecheck、lint、生成契约漂移检查、production build 和 canary 敏感信息扫描通过。

### 12. 迁移 Skill 广场列表、搜索与筛选

提交：`ad55fe0`

审查修复：`f579c50`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T8`（来源细化模块 `C-02`）

#### 问题

- `/skills` 页面仍渲染 `skillFixtures` 占位数据，没有接入 C-01 建立的统一 Catalog 数据模型。
- 缺少名称、描述、工具的规范化前端搜索，以及分类、来源、可用/冲突状态的可组合筛选。
- 目录一次加载后若每次键入都重新规范化全部条目，数据量增长时会造成重复重解析。

#### 修改方案

- `/skills` 页面替换为 `SkillCatalogPlaza`：daily 模式经 `useSkillCatalog` 加载统一 Catalog 并渲染列表；work 模式渲染“办公场景暂未接入”占位且不实例化数据请求。
- 新增 `catalog-filter` 纯函数：NFKC 规范化搜索（名称/描述/工具）、分类/来源/冲突状态筛选可组合且保持后端稳定顺序；条目搜索文本在每次目录加载时只规范化一次，键入筛选复用索引，避免重复重解析。
- 卡片显式展示来源（内置 Skill/市场发布）、安装状态（运行中/已启用/可安装/不可用）、名称冲突徽标、修订号、工具数和加载场景。
- 空目录（“Skill 广场暂无内容”）与零搜索结果（“没有符合条件的 Skill”）使用不同文案；加载、持久错误（可重试）、非阻断刷新与刷新失败保留列表的体验接自 C-01/H-02。
- Review 修正：`daily → work` 时使 generation 失效、取消在途请求并清空页面状态；Catalog ViewModel 将后端 `loadedByScenarios` 显式映射为 `scenario` scope，不推断契约未提供的 agent scope。
- Review 修正：绑定默认浏览器 `fetch`，避免 Chrome 将其作为实例方法调用时触发 `Illegal invocation`；刷新后若当前分类已从 Catalog 消失，则复位为全部分类。
- Review 修正：新增 daily Catalog 加载/前端筛选和 work 零请求的 Playwright 覆盖，并为 Playwright 测试服务器提供最小 server-only Skill Market 配置；`/skills` route 保持服务端薄组合边界。
- 文档权威：`AGENTS.md` 已明确 Skill 扩展设计和跨仓 Plan 在 Skill 范围内覆盖旧 V1 占位设计，消除绑定依据冲突；既有 docs-only 历史不重写，后续回填随功能、修复或测试变更提交。
- 验证：C-01/C-02/API client 聚焦测试 58/58，前端全量测试 233/233，Playwright 11/11，typecheck、lint、生成契约漂移检查、production build 和敏感信息扫描通过。

### 13. 完成 Skill Catalog 详情、我的 Skill 与场景隔离

提交：`c8a9048`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T8`（来源细化模块 `C-03～C-05`）

#### 问题

- Skill 详情页仍使用占位数据，无法从广场稳定进入同一 Catalog 项的真实详情。
- 缺少按当前 Principal 聚合草稿、已启用市场 Skill 和可安装 Skill 的“我的 Skill”页面。
- Skill Market 路由和组件需要在 work 模式下零请求，并在列表、详情往返时保持 daily 模式和筛选上下文。

#### 修改方案

- 详情页改为按 Catalog ID 加载真实数据，展示来源、修订、安装/冲突状态、工具、场景和作用域；不补造后端未返回的字段。
- 新增 `/skills/mine`，并行加载统一 Catalog 和当前 Principal 草稿，明确分组“我创建”“已安装/启用”和“可用未安装”。
- 将 mode 及列表筛选编码到导航 URL；work 模式在组件边界直接显示占位且不创建请求，daily 列表和详情共用统一 adapter 语义。
- 验证：聚焦测试 25/25、前端全量单测 239/239、typecheck 和 lint 通过。

### 14. 完成草稿上传、编辑、修订冲突与提交审核

提交：`0f9893a`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T8`（来源细化模块 `D-01～D-04`）

#### 问题

- 作者无法从“我的 Skill”进入真实草稿，也缺少 ZIP/目录上传、文件与元数据编辑、删除和提交审核流程。
- 并发编辑时需要使用服务端 revision 检测冲突，且 409 不能自动覆盖本地编辑。

#### 修改方案

- 新增草稿创建与详情路由，列表使用稳定草稿 ID；支持 ZIP 和保留相对路径的目录选择，并提供等待、取消、重试与防重。
- 草稿编辑维护服务端快照、当前编辑和脏状态，保存携带 `expectedRevision`；409 保留本地内容并提供显式重载。
- 提交前展示 revision、文件数和未解决 diagnostics；删除与提交均单飞，提交成功后草稿转为只读。
- 验证：聚焦测试 9/9、前端全量单测 246/246、typecheck 和 lint 通过。

### 15. 完成 Skill Creator 全流程

提交：`2557f21`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T8`（来源细化模块 `E-01～E-06`）

#### 问题

- Creator 缺少从需求访谈、Spec 确认、Tool Resolution 到 Bundle 生成的连续工作流。
- Validator diagnostics、Smoke Evidence 和保存草稿没有统一的步骤状态与失败恢复，容易把未确认数据误当作可提交结果。

#### 修改方案

- 新增显式 Creator 步骤状态机，串联 Requirement Analyze/Revise/Confirm、Tool Recommend/Confirm、Bundle Generate 与草稿保存；所有前进条件都由服务端响应和当前步骤共同约束。
- 展示工具风险、权限、缺失能力与建议，保留结构化 Validator diagnostics；Smoke Test 区分用例建议、运行证据与软门禁，不把缺失证据显示为通过。
- work 模式继续零请求；入口复用“我的 Skill”、草稿编辑和现有页面组件、表单样式及设计 token。
- 验证：聚焦测试 9/9、前端全量单测 251/251、typecheck 和 lint 通过；按当前测试范围未运行 build 或 Playwright。

### 16. 完成审核、Trigger Test 与发布衔接

提交：`13375f6`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T8`（来源细化模块 `F-01～F-04`）

#### 问题

- 新前端缺少由当前 Principal 后端授权的审核队列、Submission 证据详情和修订绑定的 Trigger Test。
- 审核意见、通过、驳回、删除待审核项以及 approved 后发布/发布并启用尚未接入真实契约。

#### 修改方案

- 新增审核队列与详情路由：不在前端按角色过滤，严格使用后端返回的 Submission；Requirement、Definition、revision diff、Tool、Validator、Smoke Evidence 和审核历史按运行时 Schema 解析，缺失证据明确显示“后端未提供”。
- Trigger Test 展示预置用例、结果摘要与服务端历史，运行请求单飞防重并在刷新后重新查询；结果按 Submission ID 与修订语义展示，不跨修订复用。
- 审核检查、评语、批准/拒绝与不可撤销删除均以后端授权和返回状态为准；409 保留当前视图并要求刷新权威状态。
- approved 提交支持“仅发布”和“发布并启用”，目标范围固定显示为 `scenario:daily`；组合操作分别呈现 Publication 与 Installation 结果，发布成功后禁止重复发布。
- 验证：聚焦测试 5/5、前端全量单测 256/256、typecheck 和 lint 通过；按当前测试范围未运行 build 或 Playwright。

### 17. 完成 Publication、Artifact 与 Installation 管理

提交：`d0a637c`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T12`（来源细化模块 `G-01～G-05、H-04`）

#### 问题

- 新前端尚无 Publication 列表/详情、Artifact 完整性下载、daily 安装启停、下架和创建新修订入口。
- 发布并启用发生部分成功后，缺少只重试 Installation 的合法补救路径；URL 或自由表单也不能被用于扩大 managed scope。

#### 修改方案

- 新增 `/skills/manage` 列表与详情：组合 Publication 管理接口和统一 Catalog，区分最新、历史、withdrawn、名称冲突、daily 已启用与未启用状态；当前契约未提供 Installation 列表时不虚构安装明细。
- Artifact 继续经同源 BFF 下载，使用 `Content-Disposition` 文件名并展示 `Content-Type`；保存前计算实际字节 SHA-256，同时比对 `X-Content-Sha256` 和 Publication content hash，任一不一致均中止保存。
- Installation mutation 固定为 `scenario:daily`，不读取 URL 中的 scope 参数；安装/启用/停用显示服务端最后操作结果，历史、下架、冲突或 Catalog 不可见项不显示为可安装。
- 发布并启用部分成功后从审核结果直达 Publication 详情，只执行 `setInstallationStatus`，不会重复创建 Publication。
- 下架前明确说明安装停用与 Runtime 退出并二次确认；创建新修订跳转后展示来源 Publication 和服务端返回的新 revision，不覆盖历史 Artifact。
- H-04 代表性负向体验覆盖 403 明确拒绝与返回路径，以及 URL 注入 `agent/work` scope 仍只能发送 `scenario:daily`；前端未新增角色 UI，最终授权继续由后端决定。
- 验证：聚焦测试 9/9、前端全量单测 263/263、typecheck 和 lint 通过；按当前测试范围未运行 build 或 Playwright。

## 2026-11-09

### 18. 完成 J-01/J-02 数据库边界与既有数据兼容验证

提交：见本条所在提交

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T13`（来源细化模块 `J-01、J-02`）

#### 问题

- 新前端尚缺少可执行门禁，无法持续证明 BFF/Feature 只依赖 HTTP 契约而不读取 Skill Market 数据库实现。
- Docker 既有数据包含非 `daily` 的历史 Installation；Catalog ViewModel 曾把任意可运行 scope 都显示成“daily 已启用”。
- 新旧前端对共享 Draft、Submission、Publication、Installation、Artifact 的业务状态缺少同数据集对照证据。

#### 修改方案

- 新增前端数据库边界检查，扫描 Skill BFF/Feature，拒绝数据库驱动、Schema、表名等实现依赖。
- 使用后端只读快照和生成契约解析同一批 Docker PostgreSQL 既有数据，对照旧前端业务投影；覆盖正常、历史修订、withdrawn、disabled、Artifact 缺失和不落库的历史受保护名称冲突夹具。
- Catalog 只有在 `loadedByScenarios` 明确包含 `daily` 时才显示 daily 已启用；`osint`、`border` 等历史 scope 仍保留展示，但不冒充 daily 安装。
- 验证：兼容与边界脚本通过，聚焦单测 10/10、前端全量单测 264/264、typecheck 和 lint 通过；未执行 K-05 全生命周期 E2E、build 或 Playwright。

### 19. 完成 K-01/K-02 分层测试与契约生成 CI

提交：见本条所在提交

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T14`（来源细化模块 `K-01、K-02`）

#### 问题

- Skill Market 前端测试已有覆盖，但缺少按 BFF、组件、契约划分的稳定命令，CI 无法按责任层独立运行。
- 固定 Schema、SHA 锁和生成器已有本地门禁，但仓库没有 CI workflow，手改或漏提交生成物无法在合并前自动阻断。

#### 修改方案

- 增加 `test:skill-market:bff`、`test:skill-market:components`、`test:skill-market:contract` 三个互不重复的测试入口，领域规则继续留在最低稳定层，上层只验证边界和集成结果。
- 新增独立 Skill Market CI：固定 Node/pnpm 版本，校验 Schema 来源、版本和 SHA，离线重生成 Zod/TypeScript 客户端并执行 `git diff --exit-code`，最后运行契约与非法响应测试；不在构建时读取 DSI 仓库或远端 `main`。
- 实际验证：BFF 27/27、组件 68/68、契约 43/43、全量 Vitest 264/264、typecheck、lint、Schema 锁和生成物无漂移检查全部通过；Playwright、build 与 K-03 以后任务未在本轮执行。

### 20. 完成 K-03～K-05 关键旅程、安全矩阵与真实生命周期

提交：见本条所在提交

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T13`（来源细化模块 `K-03、K-04、K-05`）

#### 问题

- Draft、Creator、Review、Publication 和安装恢复缺少跨页浏览器级证据，work 零请求和 daily/work 状态隔离也尚未形成完整旅程。
- 现有安全用例分散，缺少稳定命令汇总 BFF、Principal、scope、Artifact/hash、结构化错误与非法响应边界。
- 新前端还没有与真实 PostgreSQL、Artifact Store、Catalog 和 Runtime 的最终闭环证据。

#### 修改方案

- 新增状态化 Playwright API fixture、完整生命周期 spec 和安全 spec，覆盖广场/详情/我的、Draft 409、Creator Smoke、Trigger 审核、Publication 启停/下架/修订、部分成功恢复与模式隔离。
- 增加 `test:skill-market:security` 和 `test:e2e:skill-market` 稳定命令；市场 Catalog ID 进入详情页时在边界安全解码，修复含 `:` ID 查找失败。
- 后端新增真实 E2E 脚本，使用 Docker PostgreSQL、Drizzle service/repository、LocalArtifactStore、Catalog 和 Runtime Provider；数据事务回滚且临时文件清理。
- 验证：Playwright 12/12、安全聚焦 44/44、全量 Vitest 341/341、typecheck 和 lint 通过。真实链路保留 ID/revision/hash/状态证据并验证 disable/withdraw 退出。Trigger 使用明示的确定性测试判定器，不代表模型质量验证。

## 后续条目模板

```markdown
### 变更标题

提交：`commit`

Plan 文档：`path/to/plan.md`

对应 Plan 模块：`T1`

#### 问题

- 用户看到的问题或提出的需求。

#### 修改方案

- 采用的设计和关键取舍。
```
