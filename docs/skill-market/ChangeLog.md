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
