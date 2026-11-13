# Skill Creator 与 Skill Market 新前端更新日志

> 记录范围：从 Skill Creator + Skill Market 接入 `agent-hub-web` 的设计批准开始。
>
> 起始提交：A-01 所在提交。
>
> 维护方式：按日期正序追加；每项简要记录关联 Plan、对应模块序号、问题、修改方案、代码变更和真实提交号。不得写“本次提交”，并须在 Push、Pull Request 或 Merge 前补齐。存在对应模块时，Git 提交使用 `<type>(<module-id>): <description>`；仅完成方案、尚未修改生产代码的事项必须明确标注，不得与已落地功能混淆。

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

- 将 Skill 从 fixture 驱动的占位资源扩展为 daily 模式下的完整生命周期，范围覆盖发现、创作、审核、发布、安装和 Runtime 准入；页面只负责流程编排，业务状态继续以后端返回为准。
- work 模式保持未接入占位，不能请求或回退到 daily 后端；跨仓数据通过固定 Schema 和同源 BFF 传递，Principal、受保护名称及 Runtime 准入均在可信边界处理。

#### **代码变更：**

1. 更新 `docs/skill-market/2026-10-27-agent-hub-web-design.md`，补充 daily Skill 广场、作者工作台、Creator、审核、发布、安装和 Runtime 准入的完整信息架构与状态边界。
2. 在设计中冻结 work 模式零请求、零回退和 daily/work 状态隔离规则，避免办公模式复用日常模式的数据或权限。
3. 明确同源 BFF、HMAC Principal、固定 Schema、运行时校验和受保护名称的跨仓责任分工。
4. 本条仅批准并落盘设计文档，未修改生产代码；后续实现继续受关联 Plan 各模块门禁约束。

### 2. 增加 Skill Market 服务端目标与请求门禁

提交：`104e6f2`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T7`（来源细化模块 `B-01`）

#### 问题

- 新前端尚无 daily 后端唯一目标配置，也没有阻止 work、任意目标和越界路径进入后续代理的统一门禁。

#### 修改方案

- 以单一 server-only Origin 作为 daily Skill Market 的唯一上游，浏览器和请求参数都不能覆盖目标地址；请求路径只能由已登记 operation 解析产生。
- 配置和路径校验采用 fail closed：work、非法 mode、绝对 URL、编码绕过或未知 operation 均在发起网络请求前失败，避免把 BFF 变成开放代理。

#### **代码变更：**

1. 新增 `src/config/skill-market-targets.ts`，读取并校验 `SKILL_MARKET_DAILY_ORIGIN`，要求值为 HTTP(S) 纯 Origin，且仅允许 `daily` 解析到该目标。
2. 在 `next.config.ts` 的启动/构建边界执行配置校验，并在 `.env.example` 增加 server-only 配置示例。
3. 为目标覆盖、绝对 URL、编码路径、未知 operation、非法 mode 和 work 模式增加上游前置拦截。
4. 新增 `src/config/skill-market-targets.test.ts`，验证合法目标和所有 fail-closed 分支，确保失败场景不会产生上游请求。

## 2026-11-06

### 3. 增加 Skill Market Principal 签名适配

提交：`838cea3`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T7`（来源细化模块 `B-02`）

#### 问题

- 新前端 BFF 尚不能按后端冻结的规范建立可信 Principal，且必须防止浏览器提供身份、角色、权限、作用域或 Secret。

#### 修改方案

- 由 BFF 使用 server-only 配置构造并签名单操作员 Principal，浏览器不得提交或覆盖身份、角色、权限、managed scenarios 和 Secret。
- 签名绑定最终 HTTP 方法与 `originalUrl`，并使用冻结的 `skill-market-principal-v1` 格式；配置非法、签名过期或任一字段被篡改时统一拒绝。

#### **代码变更：**

1. 新增 `src/config/skill-market-principal.ts`，校验 Principal Secret、身份、角色、permissions 和 managed scenarios，并生成六个受控签名 Header。
2. 更新 `next.config.ts` 和 `.env.example`，把 Principal 配置纳入启动/构建期校验，同时保持所有字段仅在服务端可见。
3. 按最终 HTTP 方法和 `originalUrl` 生成 `skill-market-principal-v1` 签名，固定向量与后端 I-01 基线对齐。
4. 新增 `src/config/skill-market-principal.test.ts`，覆盖过期以及方法、路径、身份、角色、作用域和权限篡改，并断言错误不泄漏 Secret、签名原文或业务路径。

### 4. 增加同源 Skill Market BFF 代理

提交：`215dc73`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T7`（来源细化模块 `B-03`）

#### 问题

- 浏览器尚无独立同源入口安全转发 Skill Market 请求，JSON、204、下载、超时和取消语义也没有统一边界。

#### 修改方案

- 为 Skill Market 建立独立同源 BFF，浏览器只访问本站 `/api/skill-market`；BFF 负责目标门禁、Principal 注入和传输语义，不复制后端 DTO 或生命周期规则。
- 请求和响应采用流式转发，保留 JSON、204 和 Artifact 下载语义；同时清理不可信 Header，并统一处理超时、客户端取消和上游故障。

#### **代码变更：**

1. 新增 `src/app/api/skill-market/[...path]/route.ts`，提供 Node.js Route Handler，并复用 B-01 目标门禁和 B-02 Principal 签名。
2. 新增 `src/features/skills/api/gateway.ts` 与 `src/config/skill-market-gateway.ts`，实现请求/响应流式转发、可配置超时和取消传播。
3. 清理 hop-by-hop、Cookie、Host、Origin 及客户端伪造的 Principal Header；下载响应保留 Content-Type、文件名、长度和 hash。
4. 将超时、上游失败和客户端取消稳定映射为 504、502 和 499；work、非法 mode 和目标覆盖继续保持零上游请求。
5. 新增 `src/features/skills/api/gateway.test.ts`，覆盖 JSON、204、下载、Header 清理、超时、取消和负向门禁。

### 5. 固定跨仓 Skill Market Schema

提交：`8d9e4fa`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T6`（来源细化模块 `B-04`）

#### 问题

- 新前端缺少可离线重建、可追溯且不依赖后端浮动分支的正式 Schema 输入。

#### 修改方案

- 将后端 OpenAPI/JSON Schema 以来源 commit、契约版本和 SHA-256 三重钉定到前端仓库，前端构建只消费本地固定制品。
- 任何字节、版本、来源元数据、hash 或允许路径范围漂移都应立即失败，避免开发机上的后端目录、网络分支或浮动 main 影响构建结果。

#### **代码变更：**

1. 新增 `src/features/skills/contracts/schema/skill-market.v1.json`，固定 `DSI-agent-loop@7ba2dc6821feb3054eebe955038e81a8a9fd6577` 的 v1 Schema 和 28 个 operation。
2. 新增 `skill-market.v1.lock.json`，记录来源仓库、commit、路径、版本和 SHA-256，作为可审计锁文件。
3. 新增 `scripts/skill-market-schema-lock.ts` 与 `scripts/verify-skill-market-schema.ts`，离线验证字节、版本、hash、来源元数据和 Skill Market 路径范围。
4. 新增 `scripts/skill-market-schema-lock.test.ts`，覆盖 Schema 或锁文件被修改时的 fail-closed 行为。
5. 更新 `package.json`、`pnpm-lock.yaml` 和 `tsconfig.json`，注册校验命令及脚本运行依赖。

### 6. 生成 Skill Market 前端契约

提交：`3019c3a`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T6`（来源细化模块 `B-05`）

#### 问题

- 固定 Schema 尚未生成前端可直接使用的精确类型和运行时校验器，手写 DTO 会造成跨仓漂移。

#### 修改方案

- 由 B-04 固定 Schema 单向生成 TypeScript 类型和 Zod 运行时校验器，页面与 API client 不再维护手写 DTO。
- 生成过程必须离线、确定且可重复；生成物记录完整来源信息，并通过重新生成后 diff 检查阻止漏提交或人工修改。

#### **代码变更：**

1. 新增 `scripts/skill-market-client-generator.ts` 和 `scripts/generate-skill-market-client.ts`，从固定 Schema 生成 40 个组件及 28 个 operation 的请求、路径、查询和响应契约。
2. 生成 `src/features/skills/contracts/generated/index.ts`、`operations.ts` 和 `schemas.ts`，同时记录来源 commit、契约版本、Schema hash 和生成器版本。
3. 新增 `scripts/check-skill-market-client.ts`，通过离线重新生成和 diff 检查识别漏生成或手改漂移。
4. 新增生成器与生成契约测试，覆盖删除后恢复、非法响应拒绝、签名 Header 隔离，以及禁止导入后端源码或 monorepo shared 包。
5. 更新 `package.json` 和 `pnpm-lock.yaml`，注册 `generate:skill-market-client` 与 `check:skill-market-client` 命令。

### 7. 冻结 Skill Market 信任边界测试矩阵

提交：`2d29e38`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T7`（来源细化模块 `H-01`）

#### 问题

- 浏览器、BFF、日常后端、Artifact Store、数据库和 Runtime 的可信字段、鉴权、授权和审计点尚未形成统一矩阵。
- Origin/Principal 注入、重放、过期签名、跨 scope、跨 mode 和缓存泄漏虽有分散测试，但缺少可追溯的威胁到证据映射。

#### 修改方案

- 用一份可追溯矩阵明确浏览器、BFF、daily 后端、Artifact Store、数据库和 Runtime 各自信任什么、在哪里鉴权授权、由谁审计。
- 矩阵只描述边界与验证证据，不把后端权限规则复制到前端，也不把尚未完成的日志扫描、缓存门禁或生命周期 E2E 标记为已交付。

#### **代码变更：**

1. 新增 `docs/skill-market/2026-11-06-skill-market-trust-boundary-matrix.md`，逐层记录可信输入、非可信输入、鉴权点、授权点和审计责任。
2. 将 Origin/Principal 注入、重放、过期签名、跨 scope、跨 mode、Artifact 篡改和缓存泄漏七类威胁映射到自动化测试或人工验证步骤。
3. 在矩阵中标注 H-03、B-06、H-04/I-05 和 K-04/K-05 的后续责任与证据状态，避免将计划项误记为已完成。
4. 本条仅新增边界文档，没有修改生产代码或前端权限判断。

### 8. 建立统一 Skill Market 前端错误模型

提交：`dc446cf`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T2/T6`（来源细化模块 `H-02`）

#### 问题

- 前端尚不能安全解码 I-06 的稳定错误 code、diagnostics 和 requestId，也无法区分认证、权限、不存在、冲突、校验和网关超时。
- 错误体验缺少持久状态和恢复动作，422 diagnostics 无法定位到 Creator/Draft 等业务区域。

#### 修改方案

- 以 I-06 稳定错误 code、diagnostics 和 requestId 为唯一可展示错误边界，前端不直接渲染后端自由文本。
- 已知状态提供针对性的恢复动作；未知 code、非法 envelope 或敏感消息退化为安全通用文案，同时保留经过校验的排障 ID。

#### **代码变更：**

1. 更新固定 Schema 和锁文件到 `DSI-agent-loop@076c4951bd0adb97b104e82f595b099c691a4226`，并重新生成 `contracts/generated` 下的类型与 Zod 契约。
2. 新增 `src/features/skills/contracts/error.ts`，实现 `SkillMarketError` 解码、安全文案映射和 requestId/diagnostics 归一化。
3. 新增 `src/features/skills/components/skill-market-error-state.tsx`，按 401、403、404、409、422 和 504 展示不同说明与恢复动作。
4. 让 422 diagnostics 能定位到 Creator、Draft 等业务区域以及具体字段和行号，未知或非法错误不展示后端原始消息。
5. 增加错误契约、生成契约和错误组件测试，并同步更新信任边界矩阵中的 H-02 证据。

### 9. 建立 Skill Market API client 与 ViewModel 边界

提交：`25b9523`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T6`（来源细化模块 `B-06`）

#### 问题

- 生成契约尚未接入统一请求边界，非法响应可能流入页面映射。
- 取消、超时、错误、下载和 mutation 缺少统一处理，`work` 需在 client 层阻断。

#### 修改方案

- 把请求参数、响应体、错误、取消、超时和下载语义集中到 operation 驱动的 API client，页面不能绕过运行时 Schema 直接消费原始 JSON。
- client 只向 ViewModel adapter 传递已校验结果；query key 必须包含 mode 和资源身份，work 模式在调用 fetch 前直接失败。

#### **代码变更：**

1. 新增 `src/features/skills/api/client.ts`，按 operation 校验路径、查询、请求体和响应，再把结果交给 ViewModel adapter。
2. 在 client 中统一处理 AbortSignal、超时、`SkillMarketError` 解码、下载响应和 mutation 返回值；work 模式在 fetch 前 fail closed。
3. 新增 `src/features/skills/contracts/view-models.ts`，定义页面可消费的稳定 ViewModel 边界，避免组件直接依赖生成 DTO。
4. 规范 query key，使其包含 mode、资源类型和资源标识，阻止 daily/work 或不同资源之间复用缓存。
5. 新增 `src/features/skills/api/client.test.ts`，覆盖请求/响应校验、非法响应、取消、错误、下载、mutation 和 work 零请求；通过 `.gitattributes` 固定契约文件 LF 行尾。

### 10. 收口 Skill Market 日志与敏感信息检查

提交：`11cb96d`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T7`（来源细化模块 `H-03`）

#### 问题

- BFF 缺少字段白名单化的统一审计日志，异常细节、上传内容或 Principal 数据存在被误记的风险。
- 尚无自动门禁检查构建产物、Source Map、客户端资产和 `NEXT_PUBLIC_*` 中的 Secret、上游 Origin 或 Principal 配置。

#### 修改方案

- BFF 审计日志采用字段白名单，只记录排障所需的 method、受控 path、status、duration 和安全 requestId；异常对象、业务内容及 Principal 明细一律不记录。
- 对生产构建、Source Map、客户端资产和环境变量增加自动扫描，用 canary 负向测试证明 Secret、上游 Origin 和 Principal 配置不会进入浏览器产物。

#### **代码变更：**

1. 新增 `src/features/skills/api/security-audit.ts`，定义 Skill Market 审计事件白名单和安全 requestId 规则。
2. 更新 `src/features/skills/api/gateway.ts` 与 BFF Route Handler，过滤不安全的上游 requestId，并阻止异常、Secret、Origin、上传内容、Prompt 和完整 Principal 进入日志或错误响应。
3. 新增 `scripts/skill-market-sensitive-data.ts` 与 `scripts/check-skill-market-sensitive-data.ts`，扫描生产构建、Source Map、客户端资产、示例配置和实际构建环境。
4. 新增 `scripts/skill-market-sensitive-data.test.ts` 和 gateway 安全测试，以 canary 值验证敏感信息泄漏会使门禁失败。
5. 更新 `package.json`，注册 `check:skill-market-sensitive-data` 命令供本地和后续 CI 使用。

## 2026-11-07

### 11. 建立 Skill Catalog 数据模型与页面状态

提交：`f7b0e31`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T8`（来源细化模块 `C-01`）；本次同步完成来源细化模块 `B-04` 的 Schema 重钉。

#### 问题

- 前端固定 Schema 仍停留在 I-06 时点的 `1.0.0`（`0ce61e0a`），未包含 I-04 统一 Catalog 在 `1.1.0` 中新增的 `source`、`status: available|conflict` 与 `availability`，C-01 需要的来源和冲突状态无法从契约中表达。
- Catalog 页面此前只有 `skillFixtures` 占位，没有显式表达来源、修订、作用域、加载场景、分类、工具、安装状态和冲突状态的 ViewModel，也没有 `idle/loading/success/empty/error/refreshing` 页面状态。

#### 修改方案

- 将固定契约升级到包含统一 Catalog 语义的 v1.1.0，并在生成 DTO 与页面之间增加专用 ViewModel，所有来源、状态、场景和安装信息都必须由响应确定。
- Catalog 加载使用显式状态机和 generation 防过期回写；刷新保留已有数据，work 模式不创建请求，也不复用 daily 的数据或状态。

#### **代码变更：**

1. 将固定制品升级为 `DSI-agent-loop@f8b6ad021547158acbd68181a78a13bf2bc1d92c` 的 `skill-market.v1@1.1.0`，更新 Schema、锁文件、钉版断言和 `contracts/generated` 生成物。
2. 新增 `src/features/skills/contracts/catalog-view-model.ts`，实现 `CatalogItemViewModel`、`SkillCatalogViewModel` 和 `getSkillCatalog` adapter，显式映射来源、修订、场景、分类、工具、安装与冲突状态。
3. ViewModel 不包含 Prompt；旧响应仅按已有 `market` 字段做确定性来源兼容，不猜测契约未提供的数据。
4. 新增 `src/features/skills/catalog/catalog-state.ts`，定义 `idle/loading/success/empty/error/refreshing` 状态及保留旧数据的刷新规则。
5. 新增 `src/features/skills/catalog/use-skill-catalog.ts`，实现 daily 自动加载、单飞刷新、generation 防过期回写和 work 零请求。
6. 增加 Schema、ViewModel、状态机和 hook 测试；验证 C-01 聚焦测试 27/27、全量测试 211/211、typecheck、lint、契约漂移检查、production build 和敏感信息扫描通过。

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

- 用 C-01 的统一 Catalog 完全替换 `/skills` fixture，搜索与筛选只作用于已加载快照，不触发新的后端查询，也不改变后端稳定顺序。
- 搜索采用 NFKC 规范化并预建索引；空目录与零结果分开表达。模式切换时取消在途请求并清空状态，确保 daily 数据不会出现在 work 模式。

#### **代码变更：**

1. 将 `src/app/skills/page.tsx` 改为薄路由组合，daily 渲染 `SkillCatalogPlaza`，work 只显示未接入占位且不实例化数据请求。
2. 新增 `catalog-filter.ts`，对名称、描述和工具建立 NFKC 搜索索引，并组合分类、来源、可用/冲突状态筛选，同时保持后端稳定顺序。
3. 新增 `skill-catalog-card.tsx` 与 `skill-catalog-plaza.tsx`，展示来源、安装状态、冲突徽标、修订号、工具数和加载场景，并区分空目录、零搜索结果、持久错误和非阻断刷新状态。
4. 新增 `browser-client.ts` 并绑定默认浏览器 `fetch`，修复 Chrome `Illegal invocation`；分类在刷新后失效时自动复位为全部分类。
5. 审查修复 `daily → work` 的 generation 失效、AbortController 取消和状态清理，并将 `loadedByScenarios` 明确映射为 scenario scope，不推断 agent scope。
6. 增加 filter、plaza、state、hook、client 单测及 `e2e/skill-catalog.spec.ts`，覆盖 daily 加载、组合筛选和 work 零请求；同步 Playwright server-only 配置。
7. 更新 `AGENTS.md` 的 Skill 权威关系；验证聚焦测试 58/58、全量测试 233/233、Playwright 11/11、typecheck、lint、生成物检查、production build 和敏感信息扫描通过。

### 13. 完成 Skill Catalog 详情、我的 Skill 与场景隔离

提交：`c8a9048`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T8`（来源细化模块 `C-03～C-05`）

#### 问题

- Skill 详情页仍使用占位数据，无法从广场稳定进入同一 Catalog 项的真实详情。
- 缺少按当前 Principal 聚合草稿、已启用市场 Skill 和可安装 Skill 的“我的 Skill”页面。
- Skill Market 路由和组件需要在 work 模式下零请求，并在列表、详情往返时保持 daily 模式和筛选上下文。

#### 修改方案

- 详情、广场和“我的 Skill”统一消费同一 Catalog ViewModel，详情通过稳定 Catalog ID 定位，不再读取 fixture 或在页面层补造字段。
- mode 与筛选上下文编码进 URL，保证列表—详情往返可恢复；“我的 Skill”仅聚合当前 Principal 的草稿与 Catalog 状态，work 模式在组件边界直接停止。

#### **代码变更：**

1. 新增 `src/app/skills/[id]/page.tsx` 和 `skill-catalog-detail.tsx`，按 Catalog ID 加载真实详情，展示来源、修订、安装/冲突状态、工具、场景和作用域。
2. 新增 `src/app/skills/mine/page.tsx`、`skill-mine.tsx` 与 `use-skill-mine.ts`，并行加载统一 Catalog 和当前 Principal 草稿。
3. 新增 `skill-mine-view-model.ts`，将数据明确分为“我创建”“已安装/启用”和“可用未安装”，不虚构 Installation 明细。
4. 新增 `catalog-navigation.ts`，把 mode、搜索和筛选状态编码到 URL；卡片、广场和详情统一使用该导航规则。
5. 在详情和“我的 Skill”组件边界阻断 work 请求，并增加导航、详情、分组与模式隔离测试。
6. 更新 Skill 页面样式；验证聚焦测试 25/25、全量单测 239/239、typecheck 和 lint 通过。

### 14. 完成草稿上传、编辑、修订冲突与提交审核

提交：`0f9893a`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T8`（来源细化模块 `D-01～D-04`）

#### 问题

- 作者无法从“我的 Skill”进入真实草稿，也缺少 ZIP/目录上传、文件与元数据编辑、删除和提交审核流程。
- 并发编辑时需要使用服务端 revision 检测冲突，且 409 不能自动覆盖本地编辑。

#### 修改方案

- 以稳定 Draft ID 和服务端 revision 作为作者工作台的资源身份及乐观并发边界；本地编辑、服务端快照和脏状态分开保存。
- 上传、保存、删除和提交都采用单飞防重。409 冲突不得自动覆盖本地内容，只能由用户显式重载权威版本后继续处理。

#### **代码变更：**

1. 新增 `src/app/skills/drafts/new/page.tsx`、`drafts/[id]/page.tsx` 和 `skill-draft-create.tsx`，提供 ZIP 与保留相对路径的目录上传入口。
2. 新增 `draft-files.ts`，规范化浏览器文件选择结果，并处理等待、取消、重试和重复提交。
3. 新增 `authoring-view-model.ts`，将服务端快照、当前编辑、revision、diagnostics 和只读状态映射为稳定编辑模型。
4. 新增 `skill-draft-editor.tsx`，保存时携带 `expectedRevision`；409 保留本地内容并提供显式重载，不自动覆盖。
5. 提交前展示 revision、文件数和未解决 diagnostics；删除与提交均单飞，提交成功后切换为只读状态。
6. 更新“我的 Skill”草稿入口和全局样式，增加文件、ViewModel、编辑器及列表集成测试；验证聚焦测试 9/9、全量单测 246/246、typecheck 和 lint 通过。

### 15. 完成 Skill Creator 全流程

提交：`2557f21`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T8`（来源细化模块 `E-01～E-06`）

#### 问题

- Creator 缺少从需求访谈、Spec 确认、Tool Resolution 到 Bundle 生成的连续工作流。
- Validator diagnostics、Smoke Evidence 和保存草稿没有统一的步骤状态与失败恢复，容易把未确认数据误当作可提交结果。

#### 修改方案

- 用显式状态机串联需求分析、Spec 确认、工具解析、Bundle 生成、Validator、Smoke 和保存草稿，任何前进动作都必须与当前步骤及后端响应匹配。
- Validator diagnostics 是结构化硬结果；Smoke 区分建议用例与真实运行证据，缺失证据不能显示为通过。work 模式继续零请求，并复用作者工作台的草稿资源。

#### **代码变更：**

1. 新增 `src/app/skills/creator/page.tsx` 与 `skill-creator.tsx`，提供从需求访谈到草稿保存的 Creator 页面。
2. 新增 `creator-state.ts`，定义 Requirement Analyze/Revise/Confirm、Tool Recommend/Confirm、Bundle Generate、Validate、Smoke 和 Save 的步骤、事件及前进条件。
3. 新增 `creator-adapters.ts`，把生成契约响应映射为需求、工具风险/权限、Bundle、Validator diagnostics 和 Smoke Evidence 视图模型。
4. Creator 区分 Smoke 建议用例与实际运行证据，缺失证据不显示为通过；work 模式在操作边界保持零请求。
5. 更新“我的 Skill”和草稿编辑入口，复用既有表单、组件与设计 token，并补充 Creator 状态机、交互和入口测试。
6. 验证聚焦测试 9/9、全量单测 251/251、typecheck 和 lint 通过；本轮未运行 build 或 Playwright。

### 16. 完成审核、Trigger Test 与发布衔接

提交：`13375f6`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T8`（来源细化模块 `F-01～F-04`）

#### 问题

- 新前端缺少由当前 Principal 后端授权的审核队列、Submission 证据详情和修订绑定的 Trigger Test。
- 审核意见、通过、驳回、删除待审核项以及 approved 后发布/发布并启用尚未接入真实契约。

#### 修改方案

- 审核队列不在前端按角色或权限二次过滤，只呈现后端为当前 Principal 返回的 Submission；所有证据都绑定 Submission 与 revision。
- Trigger、批准、驳回、删除和发布分别呈现自己的状态与失败恢复；发布并启用是两个可观察结果，目标 scope 固定为 `scenario:daily`。

#### **代码变更：**

1. 新增 `src/app/skills/review/page.tsx`、`review/[id]/page.tsx`、`skill-review-queue.tsx` 和 `use-review-queue.ts`，接入后端授权后的 Submission 队列。
2. 新增 `review-view-model.ts` 与 `review-evidence.tsx`，按运行时 Schema 展示 Requirement、Definition、revision diff、Tool、Validator、Smoke Evidence 和审核历史；缺失项明确标记“后端未提供”。
3. 新增 `skill-review-detail.tsx`，展示预置 Trigger 用例、结果摘要和服务端历史；运行操作单飞，刷新后重新查询且不跨 Submission/revision 复用结果。
4. 接入审核检查、评语、批准、驳回和不可撤销删除；409 保留当前视图并要求重新加载后端权威状态。
5. approved 状态支持“仅发布”和“发布并启用”，scope 固定为 `scenario:daily`，分别展示 Publication 与 Installation 结果并阻止重复发布。
6. 更新广场、“我的 Skill”和全局样式入口，增加队列、ViewModel 和详情交互测试；验证聚焦测试 5/5、全量单测 256/256、typecheck 和 lint 通过，本轮未运行 build 或 Playwright。

### 17. 完成 Publication、Artifact 与 Installation 管理

提交：`d0a637c`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T12`（来源细化模块 `G-01～G-05、H-04`）

#### 问题

- 新前端尚无 Publication 列表/详情、Artifact 完整性下载、daily 安装启停、下架和创建新修订入口。
- 发布并启用发生部分成功后，缺少只重试 Installation 的合法补救路径；URL 或自由表单也不能被用于扩大 managed scope。

#### 修改方案

- 将 Publication、Artifact 和 Installation 建模为相关但可独立恢复的资源：发布成功而启用失败时，只允许重试 Installation，不能重复创建 Publication。
- Artifact 下载在保存前完成响应头、实际字节和 Publication hash 三方校验；所有安装 mutation 固定为 `scenario:daily`，URL 或表单不能扩大 managed scope。

#### **代码变更：**

1. 新增 `src/app/skills/manage/page.tsx`、`manage/[id]/page.tsx`、`skill-publication-list.tsx` 和 `skill-publication-detail.tsx`，组合 Publication 管理接口与统一 Catalog。
2. 新增 `publication-view-model.ts` 和 `use-publications.ts`，区分最新、历史、withdrawn、名称冲突、daily 已启用与未启用；契约未提供 Installation 列表时不虚构明细。
3. 新增 `artifact-download.ts`，经同源 BFF 下载制品，读取 `Content-Disposition`/`Content-Type`，计算实际字节 SHA-256，并与 `X-Content-Sha256` 和 Publication content hash 三方比对。
4. Installation mutation 固定发送 `scenario:daily`，不读取 URL scope；历史、下架、冲突或 Catalog 不可见项不显示为可安装。
5. 发布并启用部分成功后跳转 Publication 详情，只重试 `setInstallationStatus`；下架要求二次确认，创建新修订保留来源 Publication 和历史 Artifact。
6. 更新审核结果、作者工作台和广场入口；增加 Publication、Artifact hash、403 和 scope 注入测试，确认前端不新增角色判断且最终授权仍由后端决定。
7. 验证聚焦测试 9/9、全量单测 263/263、typecheck 和 lint 通过；本轮未运行 build 或 Playwright。

## 2026-11-09

### 18. 完成 J-01/J-02 数据库边界与既有数据兼容验证

提交：`0710c2a`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T13`（来源细化模块 `J-01、J-02`）

#### 问题

- 新前端尚缺少可执行门禁，无法持续证明 BFF/Feature 只依赖 HTTP 契约而不读取 Skill Market 数据库实现。
- Docker 既有数据包含非 `daily` 的历史 Installation；Catalog ViewModel 曾把任意可运行 scope 都显示成“daily 已启用”。
- 新旧前端对共享 Draft、Submission、Publication、Installation、Artifact 的业务状态缺少同数据集对照证据。

#### 修改方案

- 把“前端不读取数据库实现”从约定升级为可执行门禁，扫描 BFF 与 Skill Feature 对数据库驱动、Schema、表名和后端源码的越界依赖。
- 使用后端只读快照和生成契约对同一批既有数据做投影对照；安装状态只有在 `loadedByScenarios` 明确包含 `daily` 时才能显示为 daily 已启用。

#### **代码变更：**

1. 新增 `scripts/test-skill-market-database-boundary.ts`，扫描 Skill BFF 和 Feature，拒绝数据库驱动、数据库 Schema、表名及实现层依赖。
2. 新增 `scripts/test-skill-market-existing-data.ts`，使用后端只读快照和前端生成契约解析同一批 Docker PostgreSQL 既有数据，并对照旧前端业务投影。
3. 兼容夹具覆盖正常数据、历史修订、withdrawn、disabled、Artifact 缺失以及不落库的历史受保护名称冲突。
4. 修改 `catalog-view-model.ts`，仅在 `loadedByScenarios` 明确包含 `daily` 时显示 daily 已启用；`osint`、`border` 等历史 scope 保留展示但不冒充 daily Installation。
5. 更新 `package.json` 注册数据库边界与既有数据验证命令，并增加 Catalog 映射回归测试。
6. 验证两个脚本、聚焦单测 10/10、全量单测 264/264、typecheck 和 lint 通过；本轮未执行 K-05 生命周期 E2E、build 或 Playwright。

### 19. 完成 K-01/K-02 分层测试与契约生成 CI

提交：`0a7b0c2`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T14`（来源细化模块 `K-01、K-02`）

#### 问题

- Skill Market 前端测试已有覆盖，但缺少按 BFF、组件、契约划分的稳定命令，CI 无法按责任层独立运行。
- 固定 Schema、SHA 锁和生成器已有本地门禁，但仓库没有 CI workflow，手改或漏提交生成物无法在合并前自动阻断。

#### 修改方案

- 按 BFF、组件和契约拆分互不重复的稳定测试入口，使失败能够直接定位到传输边界、页面行为或跨仓契约。
- CI 固定 Node/pnpm 版本并保持离线契约验证：先检查 Schema 锁，再重新生成客户端并检查 diff，最后运行契约和非法响应测试。

#### **代码变更：**

1. 更新 `package.json`，新增 `test:skill-market:bff`、`test:skill-market:components` 和 `test:skill-market:contract` 三个稳定且不重复的测试入口。
2. BFF 层覆盖目标门禁、Principal、gateway 和敏感信息；组件层覆盖 Catalog、作者、Creator、审核和发布交互；契约层覆盖 Schema 锁、生成物、错误与非法响应。
3. 新增 `.github/workflows/skill-market-quality.yml`，固定 Node/pnpm 版本并依次执行安装、Schema 来源/版本/SHA 校验、离线生成、`git diff --exit-code` 和契约测试。
4. CI 不读取本机 DSI 仓库或远端 `main`，确保钉版 Schema 与生成器是唯一构建输入。
5. 验证 BFF 27/27、组件 68/68、契约 43/43、全量 Vitest 264/264、typecheck、lint、Schema 锁及生成物无漂移；本轮未运行 Playwright、build 或 K-03 后续任务。

### 20. 完成 K-03～K-05 关键旅程、安全矩阵与真实生命周期

提交：`0a3ba03`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T13`（来源细化模块 `K-03、K-04、K-05`）

#### 问题

- Draft、Creator、Review、Publication 和安装恢复缺少跨页浏览器级证据，work 零请求和 daily/work 状态隔离也尚未形成完整旅程。
- 现有安全用例分散，缺少稳定命令汇总 BFF、Principal、scope、Artifact/hash、结构化错误与非法响应边界。
- 新前端还没有与真实 PostgreSQL、Artifact Store、Catalog 和 Runtime 的最终闭环证据。

#### 修改方案

- 以三层证据验收生命周期：状态化 Playwright 覆盖用户旅程，安全测试聚合可信边界，真实链路验证 PostgreSQL、Artifact Store、Catalog 和 Runtime 闭环。
- 测试必须覆盖 work 零请求、daily/work 状态隔离、Draft 409 和发布后安装恢复；Trigger 仅使用确定性判定器验证流程，不宣称模型质量。

#### **代码变更：**

1. 新增 `e2e/fixtures/skill-market-api.ts`，提供可变状态的 Skill Market API fixture，支持跨页面共享 Draft、Submission、Publication 和 Installation 状态。
2. 新增 `e2e/skill-market-lifecycle.spec.ts`，覆盖广场/详情/我的、Draft 409、Creator Smoke、Trigger 审核、Publication 启停/下架/修订及发布成功但启用失败后的恢复。
3. 新增 `e2e/skill-market-security.spec.ts`，覆盖 work 零请求、daily/work 状态隔离、Principal/scope 边界、Artifact hash、结构化错误和非法响应。
4. 更新 `package.json`，新增 `test:skill-market:security` 和 `test:e2e:skill-market`；修改 `skill-catalog-detail.tsx`，安全解码含 `:` 的市场 Catalog ID。
5. 后端配套真实 E2E 使用 Docker PostgreSQL、Drizzle service/repository、LocalArtifactStore、Catalog 和 Runtime Provider，事务回滚数据并清理临时文件；设计文档同步记录证据边界。
6. 验证 Playwright 12/12、安全聚焦 44/44、全量 Vitest 341/341、typecheck 和 lint 通过；真实链路保留 ID/revision/hash/状态证据并验证 disable/withdraw 退出，Trigger 不代表模型质量验证。

### 21. 完成 K-06～K-08 双仓门禁、production 并行与回滚方案

提交：阶段实现 `92b4815`；收口提交 `17036ff`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T13、T14`（来源细化模块 `K-06～K-08`）

#### 问题

- 两仓缺少可一键复现的最终 release gate，production build、旧前端关键页面和新旧并行尚无统一证据。
- 新前端必须证明不依赖旧页面、旧 BFF 或 `/api/skills`，并在任一前端停止时保持另一端可用。
- 发布顺序、server-only 环境变量、兼容矩阵、停止条件和数据库不可回写边界尚未形成完整 Runbook。

#### 修改方案

- 用双仓 release gate、production 三进程并行验证和部署 Runbook 证明旧前端、新前端及后端可以独立启动、停止和回滚。
- 新前端不得依赖旧页面、旧 BFF 或 `/api/skills`；证据需要记录 commit/dirty 状态、Build ID、Catalog 和网络请求，同时明确“通过门禁”不等于已经生产发布或切流。

#### **代码变更：**

1. 新增 `scripts/skill-market-independence.ts`、检查入口和测试，扫描新前端对旧页面、旧 BFF、`/api/skills` 及越界实现的依赖。
2. 更新 `package.json`、Skill Market CI、`Dockerfile` 和 `.env.example`，加入双仓 release gate、production build 与 server-only 配置边界。
3. 新增 `scripts/test-skill-market-parallel-run.ts`，启动旧前端、新前端和后端三进程，对比两个 BFF 的同一 14 项 Catalog，并验证旧停新存、新停旧存和 work 零请求。
4. 新增 `docs/skill-market/2026-11-09-skill-market-deployment-runbook.md`，冻结后端兼容优先、旧前端先回归、新前端后发布、停止条件和独立回滚顺序。
5. 将 K-07 证据写入 `docs/skill-market/evidence/2026-11-09-parallel-run.json`，记录 commit/dirty 状态、Build ID、Catalog 与网络请求；同步生命周期 E2E 和设计文档。
6. 验证两仓 release gate、新前端 Vitest 346/346、Playwright 21 passed/1 skipped、build 和敏感信息扫描通过；本轮未执行生产发布、流量切换或数据库变更。

## 2026-11-10

### 22. 补充 Skill 广场直达 Creator 的创建入口

提交：`538ca9e`

分支同步：`584b077`（仅将 `origin/main` 合入 `skill-creator`，不计入本条功能实现）

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T8、T10`（衔接已完成的 Skill 广场与 Creator 流程）

#### 问题

- daily Skill 广场已有发布管理、审核和“我的”入口，但缺少直接进入 Creator 的创建入口；用户需要绕行“我的 Skill”才能开始创建。
- 新入口需要保持 `mode=daily`，并沿用现有页面操作区和全局设计 token，不能引入独立样式体系。

#### 修改方案

- 在 daily Skill 广场的既有操作区增加一个明确主操作，让用户无需先进入“我的 Skill”即可开始创建。
- 入口复用现有按钮和全局 accent token，固定携带 `mode=daily`；其他管理入口、自动加载行为和 work 模式边界保持不变。

#### **代码变更：**

1. 修改 `skill-catalog-plaza.tsx`，在 daily 广场操作区增加“创建 Skill”主操作，固定跳转 `/skills/creator?mode=daily`。
2. 保留发布管理、审核和“我的 Skill”三个既有入口及顺序，不新增手动刷新或额外请求。
3. 修改 `src/app/globals.css`，复用 `skill-page-action` 并使用全局 accent token 增加主按钮及 hover 状态。
4. 扩展 `skill-catalog-plaza.test.tsx`，覆盖四个操作入口、Creator URL、主操作样式和无手动刷新按钮。

### 23. 收口 Skill 页面操作区与 Creator 高效创建流程

提交：`e9a2288`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T8、T10～T12`（Skill 广场、Creator、审核与发布管理交互收口）

#### 问题

- Catalog 的推断分类在仅复述“内置 Skill/市场发布”来源时与来源筛选重复，URL 中遗留的分类参数还会产生无意义的筛选状态。
- “我的 Skill”、审核队列和发布管理的页面操作区未复用广场按钮样式，并保留了与自动加载/权威状态恢复重复的手动刷新入口。
- Creator 将内部八步状态机完整暴露为八个视觉步骤，确认 Spec、获取推荐、确认工具和生成 Bundle 需要连续机械点击；同时 Smoke 虽定义为 Soft Gate，却阻止用户先保存已通过 Validator 的 Bundle。
- Creator 保存后可直接提交审核，与旧版“Creator 保存草稿、作者工作台负责提交”的职责分工不一致。

#### 修改方案

- 去除与来源一一对应的伪分类和重复刷新入口，统一广场、“我的 Skill”、审核队列和发布管理的操作区样式与自动加载语义。
- Creator 保留内部状态机，但将用户流程压缩为四个阶段并自动串联安全步骤；Smoke 继续是 Soft Gate，Creator 只保存草稿，提交审核回到作者工作台完成。

#### **代码变更：**

1. 修改 `catalog-filter.ts` 和 `skill-catalog-plaza.tsx`：分类与来源一一对应时隐藏分类控件并忽略分类 URL 参数，真实细分类出现后自动恢复。
2. 修改 `skill-mine.tsx`、`skill-review-queue.tsx` 和 `skill-publication-list.tsx`，统一复用广场操作按钮样式并移除列表页手动刷新；错误重试和详情权威刷新保留。
3. 修改 `skill-creator.tsx`，将可见流程归纳为“需求定义、工具与生成、验证、保存与提交”四段；确认 Spec 后自动请求工具推荐，确认工具后自动生成 Bundle。
4. 调整 Creator 门禁：Bundle 无 error 即可保存草稿，未运行 Smoke 明确显示 Soft Gate 但不阻止保存。
5. 移除 Creator 对 Draft submit 的调用，保存成功后跳转/引导到作者工作台，由草稿编辑页承担提交审核职责。
6. 更新 Catalog、Mine、Review、Publication、Creator 单测及生命周期 Playwright 场景；验证聚焦测试 6/6、全量 Vitest 450/450、typecheck、lint 和 diff check 通过，因 `.next/dev/lock` 未重跑 Playwright。

### 24. 对齐 Skill 管理页面与旧前端关键操作

提交：`f527acc`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T8、T9、T11、T12`（Skill 广场、作者工作台、审核、Publication 与 Installation 管理）

#### 问题

- 新前端发布管理仍使用双列跳转卡片，无法像旧前端一样在列表中直接查看 Publication 元数据、下载制品并执行 daily 安装/启用、停用、下架和 withdrawn 新修订操作。
- 审核队列缺少旧前端的作者、修订、Artifact hash、Trigger 次数和冻结审核证据概览；作者工作台缺少醒目的 ZIP/目录上传入口及草稿行内编辑、提交和删除动作。
- Skill 广场没有展示后端权威总数；新增业务区的默认字号与其他资源页不一致，多个详情页仍保留与自动加载和错误恢复重复的手动刷新按钮。

#### 修改方案

- 将发布管理从双列跳转卡片改为单列操作行，让高频管理动作直接出现在列表；审核和作者工作台同步补足旧前端已具备的关键元数据与行内操作。
- 所有状态仍以后端为权威：安装 scope 固定为 daily，Artifact 继续执行三方 hash 校验，写操作成功后自动重新同步而不是依赖手动刷新。

#### **代码变更：**

1. 修改 `skill-publication-list.tsx` 为单列操作行：published 项提供详情、制品下载、安装/启用、停用和二次确认下架；withdrawn 项提供详情、历史制品下载和创建新修订。
2. 保留 `scenario:daily` 固定安装目标以及响应头、实际字节、Publication hash 三方校验；`skill-publication-detail.tsx` 继续承担完整状态与恢复操作。
3. 修改审核队列和详情组件，列表直接展示作者、修订、状态、完整 Artifact SHA-256、Trigger 次数和可折叠冻结证据，详情保留 Trigger、审核、删除和发布操作。
4. 修改 `skill-mine.tsx`，增加醒目的 ZIP/目录上传入口，并为 editing 草稿增加编辑、提交审核和二次确认删除，同时保留三个后端数据驱动分组。
5. 修改 `skill-catalog-plaza.tsx`，在标题旁显示 `catalog.total` 权威总数；搜索和筛选只改变可见条目，不改写总数。
6. 更新 `src/app/globals.css`，统一 Skill 业务区标题、正文和字段标签的字号、字重与行高，并移除 Skill 模块全部手动刷新按钮。
7. 扩展 Catalog、Mine、Publication、Review 组件测试；验证全量 Vitest 460/460、TypeScript strict、全仓 ESLint、diff check 及桌面/窄屏浏览器核验通过，源码扫描无剩余手动刷新按钮。

## 2026-11-11

### 25. 批准单用户 Work Skill Market / Editor 设计与实施计划

提交：39814c9

Plan 文档：`docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`

对应 Plan 模块：`Task 0`

#### 问题

- 已批准的 Skill 绑定设计和 daily 迁移计划仍要求 `mode=work` 保持零请求占位，与新的 Work Skill Market / Editor 目标直接冲突。
- 原型和可行性方案虽已收敛功能、交互和单用户部署边界，但尚未成为 `agent-hub-web` 的绑定权威，不能据此修改生产代码。

#### 修改方案

- 在绑定设计中正式批准 `mode=work` 通过独立 BFF 接入 Xiaozhi 现有 Skill API，并保持 daily 的契约、生命周期和 Runtime 边界不变。
- 用独立 Work 实施计划冻结单用户固定操作员、DSI Session fail-closed、API Key 隔离、功能范围、原型顺序契约和 TDD 交付门禁。

#### **代码变更：**

1. 更新 `AGENTS.md`，登记 mode-specific daily/Work 权威计划及 supersession 规则。
2. 更新 `docs/skill-market/2026-10-27-agent-hub-web-design.md`，取代旧 Work 占位约束，补充路由、BFF、安全、功能与验收边界。
3. 新增 `docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`，形成 Task 1～6 的可执行 TDD 计划和停止条件。
4. 本条仅完成设计与计划批准，没有修改生产代码、测试或任何后端仓库。

### 26. 记录 Work 共享范围选择器的实施范围取舍

提交：39814c9

Plan 文档：`docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`

对应 Plan 模块：`§6.1`

#### 问题

- 冻结的 Work BFF 白名单不含 `GET /api/departments` 与 `GET /api/auth/users/access-options`，原 Vue `ShareConfigForm` 的部门多选、指定多用户面板缺少目录数据源，无法在本期内完整复刻。

#### 修改方案

- 在 Work 计划中冻结本期共享范围 UI 为单选形态：按 `allowed_access_levels` 过滤选项，提交载入的原配置数组；后端保存路径强制追加操作员自己，单用户模式下语义为"仅自己 / 所在部门 / 全局共享"。
- 明确合并保留规则：不得因界面降级缩小已有配置的可见范围；未来需要多选面板时按停止条件先更新计划与白名单。
- 同步把该取舍回写到总体方案 `20261104_xiaozhi-offline-deploy/docs/2026-11-11_skill-workspace-prototype-and-implementation-plan.md` §6.1。

#### **代码变更：**

1. `docs/skill-market/2026-11-11-work-skill-frontend-implementation.md` 新增 §6.1，Task 4 步骤与 Decision log 同步登记。
2. 本条仅澄清已批准范围，不改变能力地图、白名单或 daily 边界。

### 27. Work Skill 接口契约冻结（Task 1）

提交：b4b12fb

Plan 文档：`docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`

对应 Plan 模块：`Task 1`

#### 问题

- `mode=work` 要接入 Xiaozhi 现有 Skill API，但 daily 的生成契约基于另一套后端领域模型，不能复用；前端需要一份以 Xiaozhi 后端源码为事实源的冻结契约，防止实施和回归中悄悄漂移。

#### 修改方案

- 依据 `xiaozhi-offline-deploy` 后端 `skill_router.py`、`service.py` 与 `share_config.py` 冻结 Work 接口契约：列表/文件树/文件内容/依赖选项/生效范围/安装草稿 DTO，防御性解析（未知字段忽略、缺关键字段 fail closed），以及批量删除上限 50、草稿 TTL 3600、slug 模式、上传文件名限制（.zip 或 skill.md 结尾）、confirm/cancel 准确路径。
- 以 13 个 fixture 载荷样本固定请求/响应形态，供 Task 2 BFF 测试复用。

#### **代码变更：**

1. 新增 `src/features/skills/work/contracts.ts`：冻结 Work Skill 常量、slug/草稿 ID/文件路径构造规则、上传文件名限制、批量上限、草稿 TTL，以及列表、文件树、文件内容、依赖、共享范围、安装草稿、远程发现和批量结果 DTO。
2. 在同一契约模块中建立最小 Zod 运行时解析边界：合法响应转换为严格 TypeScript 类型，未知字段忽略，缺失关键字段、非法枚举、错误 success envelope 和越界路径统一 fail closed；错误响应只提取允许展示的 `detail`/`error` 文案。
3. 新增 `src/features/skills/work/fixtures/` 下 13 个 JSON 样本，覆盖列表、变更、目录树、文件、依赖选项、上传/远程草稿、远程列表/搜索、确认/批量结果、简单成功与错误 envelope。
4. 新增 `src/features/skills/work/contracts.test.ts`，以 41 个用例固定常量、准确接口路径、路径穿越拒绝、所有 fixture 解析和关键字段缺失的负向行为。
5. 验证 Task 1 聚焦测试 41/41、全量 Vitest 554/554、TypeScript strict 与 ESLint 全部通过；未修改 Xiaozhi 后端、数据库或 daily Skill 契约。

### 28. Work Skill 独立安全 BFF（Task 2）

提交：b4b12fb

Plan 文档：`docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`

对应 Plan 模块：`Task 2`

#### 问题

- 浏览器不能持有 Xiaozhi API Key，且新统一登录后匿名/演示态可能直接打 Work Skill BFF 执行写操作；需要独立、可审计、fail closed 的同源代理，而不是扩大聊天 `/api/work-agent/*`。

#### 修改方案

- 新增 `/api/work-skills/*` BFF：每个请求先用 `dsi_app_session` 在服务端调 DSI `/auth/xiaozhi-status` 验证完整登录态（anonymous、demo、失效、缺 Cookie、认证超时/故障全部 fail closed，且先于读上传体与调上游）；通过后才用 server-only `XIAOZHI_API_KEY` 调白名单内的 Xiaozhi 现有接口（19 条 method+path+query 规则，含 path/slug 查询校验）。
- Header 隔离：Cookie 只发 DSI；浏览器 Authorization/Origin/Forwarded 等凭据丢弃；JSON、multipart 上传与 ZIP 流式下载原样透传安全响应头；4xx 提取 FastAPI detail、5xx 泛化，支持取消与超时（60s 上游 / 8s 认证，可调）。

#### **代码变更：**

1. 新增 `src/server/xiaozhi/skills-proxy.ts`：建立 19 条显式 method/path/query 白名单，校验 slug、文件 path、dependency-options 查询与安装草稿路径，并拒绝未知路由、绝对 URL、编码绕过、额外查询参数和浏览器目标覆盖。
2. 在 proxy 中实现 DSI Session 前置门禁：只从请求读取 `dsi_app_session` 并调用 `/auth/xiaozhi-status`；缺 Cookie、anonymous、demo、失效、超时和认证服务故障均在读取请求体或访问 Xiaozhi 前拒绝。
3. 实现请求与响应边界：清除浏览器 Authorization、Cookie、Host、Origin、Forwarded 等不可信 Header，只向 Xiaozhi 注入 server-only API Key；流式转发 JSON、multipart 和 ZIP，保留安全下载头，并处理取消、60 秒上游超时、4xx 安全文案与泛化 5xx。
4. 新增薄路由 `src/app/api/work-skills/[...path]/route.ts`，仅负责读取 server-only 配置并把各 HTTP method 交给 proxy；新增 `work-skills-route.test.ts` 验证 method 委托和配置失败边界。
5. 新增 `src/server/xiaozhi/skills-proxy.test.ts` 的 47 个安全/传输用例；同步扩展 `contracts.ts` 的安全文件路径判断与 `{code,error}` BFF 错误解析。
6. 验证 Task 2 聚焦测试 49/49、既有 Work Agent BFF 测试 34/34、TypeScript strict 与 ESLint 全部通过；没有扩大 `/api/work-agent/*` 或 daily BFF。

### 29. Work Skill Market 前端（Task 3）

提交：0bd0c2f

Plan 文档：`docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`

对应 Plan 模块：`Task 3`

#### 问题

- `/skills?mode=work` 需要在浏览器侧完整复现原 Xiaozhi Skill Market：搜索、推荐/内置/上传分组、居中预览、启停、上传、远程安装、草稿确认和批量删除，并保持按钮区域与顺序契约。

#### 修改方案

- 新增 Work 专用 API client（`/api/work-skills/*` 同源 BFF）、useReducer 列表状态钩子（取消/代际防护、identityGeneration 重载）与推荐安装目录常量（与原 Vue RECOMMENDED_SKILLS 一致）。
- 实现 Market 页面与组件：`work-skills-page`、`skill-card`（含推荐卡片）、`skill-preview-dialog`（react-markdown 渲染 SKILL.md）、`remote-install-dialog`（仓库/全局搜索两页签 + localStorage 历史）、`install-draft-dialog`（来源→解析项→生效范围，§6.1 单选提交语义）、`work-confirm-dialog`。
- 按 §4.2 冻结 DOM 顺序：工具栏、批量模式完整替换、分组顺序、卡片操作位、预览弹窗 footer、草稿与远程弹窗按钮顺序；批量上限 50、`can_manage === false` 只读、内置不可删除/不显示卸载。

#### **代码变更：**

1. 新增 `work-api.ts` 与 `work-api.test.ts`：浏览器只调用 `/api/work-skills/*`，统一解析 JSON/错误、multipart 上传、安装草稿 confirm/cancel、批量删除与 ZIP 文件名；网络、会话失效、4xx/5xx 和 AbortError 具有独立恢复语义。
2. 新增 `use-work-skills.ts` 与测试：用 reducer 管理 idle/loading/success/empty/error/refreshing，单飞刷新、AbortController、请求 generation 和 `identityGeneration` 共同阻止过期数据与跨身份状态回写。
3. 新增 `work-skills-page.tsx`、`skill-card.tsx` 和 `work-recommended.ts`：实现搜索、推荐/内置/上传三分组、启停、普通/批量工具栏替换、全选/反选/清空及最多 50 项批量删除；`can_manage === false` 和内置来源按后端权威状态限制写操作。
4. 新增 `skill-preview-dialog.tsx`：居中渲染 `SKILL.md`，保留标题/来源、启停、卸载、关闭和“去管理”的固定区域与 footer 顺序；Markdown 只作为用户可见内容渲染。
5. 新增 `remote-install-dialog.tsx`、`install-draft-dialog.tsx`、`work-confirm-dialog.tsx`：复现仓库拉取/全局搜索、来源历史、批量选择、prepare → confirm/cancel 两阶段安装、§6.1 范围单选和危险操作确认，并为重复提交设置 pending 门禁。
6. 更新 `src/app/globals.css`，追加隔离的 `work-*` 页面、卡片、弹窗、开关、toast、空态和移动端样式，继续复用 Agent Hub 颜色、边框、圆角和间距 token。
7. 新增 7 个组件/hook 测试文件，覆盖按钮与分组 DOM 顺序、批量模式、预览 footer、远程页签、草稿范围、权限只读、请求取消和错误恢复；Task 3 完成时 Work 聚焦测试 101/101 通过。
8. 页面仅通过 `api`、`identityGeneration` 和 `onManageSkill` 注入，尚未修改 App Router；`mode=work` 路由接入及 daily/Work 切换证明仍明确留给 Task 5。

### 30. Work Skill Editor 前端（Task 4）

提交：`9e3356b`

Plan 文档：`docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`

对应 Plan 模块：`Task 4`

#### 问题

- Work Skill Market 已完成，但“去管理”所需的已安装 Skill 编辑器尚未实现，缺少文件树与文件写入、生效范围、依赖、导出和删除能力。
- Editor 需要保持原 Vue 的顶栏、页签和操作顺序，同时落实路径穿越防护、写操作单飞、内置只读与 `can_manage` 权限边界。

#### 修改方案

- 新增独立 Editor 容器及代码管理、生效范围、依赖管理三个组件；顶栏固定为返回、名称/状态、导出/删除，页签固定为代码管理、生效范围、依赖管理。
- 文件编辑支持树读取、默认加载 `SKILL.md`、保存、新建文件/目录、刷新和危险删除；组件与 API client 双层拒绝越界路径。
- 生效范围遵守计划 §6.1：按 `allowed_access_levels` 单选，切换时保留载入的用户/部门数组，global 清空；内置范围固定 global，只读 Skill 不显示写入口。
- 依赖按工具、MCP、Skill 顺序展示；可管理非内置 Skill 才请求选项和保存，只读/内置直接展示列表响应中的既有依赖，避免调用要求管理权限的接口。

#### **代码变更：**

1. 扩展 `work-api.ts`，增加文件树、节点创建/更新/删除、依赖选项/保存和生效范围 API，并在 fetch 前校验文件路径。
2. 新增 `skill-editor.tsx`、`skill-file-editor.tsx`、`skill-settings.tsx`、`skill-dependencies.tsx` 及对应测试。
3. 更新 `globals.css`，增加 Editor 双栏、顶栏、页签、设置卡、依赖卡和移动端布局。
4. 验证 Work Skill 聚焦测试 114/114、全量 Vitest 676/676、TypeScript strict 与 ESLint 全部通过；Task 5 路由、Task 6 E2E/production build 尚未执行。

### 31. Work Skill 路由接入与模式隔离（Task 5）

提交：`47b3441`

Plan 文档：`docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`

对应 Plan 模块：`Task 5`

#### 问题

- Work Market 与 Editor 此前只能通过注入 props 使用；`/skills?mode=work` 与 `/skills/[slug]?mode=work` 仍显示占位卡，用户无法从路由进入 Work Skill 管理。
- 需要证明 daily/Work 两套后端在同一页面互发零请求，且模式切换时中止旧请求并清理弹窗与选择状态。

#### 修改方案

- `SkillCatalogPlaza` 在 `mode=work` 时挂载 `WorkSkillsPage`，`SkillCatalogDetail` 在 `mode=work` 时挂载 `SkillEditor`；daily 分支保持原有 client、查询参数解析与生命周期不变。
- 路由层经 `useAuth().identityGeneration` 注入并在身份变化时重建 Work 页面与编辑器状态；预览“去管理”跳转 `/skills/[slug]?mode=work`，编辑器返回与删除后回到 `/skills?mode=work`。
- 两个 catalog 组件新增可选 `workApi` 注入（与 daily `client` 同一测试接缝模式），浏览器默认仍走同源 Work BFF。
- 其余 daily 页面（Creator、审核、发布、我的、草稿）继续保留 `SkillMarketWorkPlaceholder`，本次不扩大范围。

#### **代码变更：**

1. 修改 `src/features/skills/catalog/skill-catalog-plaza.tsx`：在 `mode=work` 分支挂载 `WorkSkillsPage`，注入 `identityGeneration` 与可测试的 `workApi`，并把预览弹窗“去管理”导航固定为 `/skills/[slug]?mode=work`；daily 分支仍按原查询参数创建 daily Catalog 页面。
2. 修改 `src/features/skills/catalog/skill-catalog-detail.tsx`：在 `mode=work` 分支挂载 `SkillEditor`，将返回和删除成功统一导航到 `/skills?mode=work`；daily 详情继续使用原 `SkillMarketClient`、drawer 和安装生命周期，不共享 Work API 或状态。
3. 保留 `SkillMarketWorkPlaceholder` 作为 Creator、我的 Skill、Draft、审核和发布管理等 daily-only 路由的 Work 防误入边界；本次只开放批准的 Work Market 与已安装 Skill Editor 两条路由。
4. 重写 `skill-catalog-plaza.test.tsx` 的 Work 验收：覆盖真实 Work 页面渲染、daily client 零请求、daily 模式 Work BFF 零请求、“去管理”目标、身份代际重建，以及 daily ↔ Work 切换时取消在途请求并清除预览/批量选择状态。
5. 扩展 `skill-catalog-detail.test.tsx`：覆盖 Work Editor 渲染、daily client 零请求、返回/删除导航、daily 模式 Work BFF 零请求，以及双向模式切换时清理 Editor 在途加载和临时状态。
6. 更新 `e2e/skill-catalog.spec.ts`，把历史 Work 占位断言替换为 Work Market 搜索框可见且 `/api/skill-market/*` 零请求；更新部署 Runbook 的 smoke 描述，明确 Work 访问独立 `/api/work-skills/*`。
7. 验证 Task 5 聚焦测试 26/26（plaza 18、detail 8）、全量 Vitest 687/687、TypeScript strict 与 ESLint 全部通过；Xiaozhi/DSI 后端零改动，Playwright 全旅程、敏感信息扫描和 production build 明确保留到 Task 6。

## 2026-11-12

### 32. Work Skill 最终验证与交付（Task 6）

提交：`6429dde`

Plan 文档：`docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`

对应 Plan 模块：`Task 6`

#### 问题

- Task 5 完成路由接入后，尚缺覆盖完整 Work Market/Editor 操作链路的 Playwright 验收、Work Chat/历史与 daily 生命周期回归，以及 production build 的 Xiaozhi 凭据泄漏扫描。
- 原敏感信息扫描仅识别 daily Skill Market 配置，不能阻止 `XIAOZHI_API_KEY`、Xiaozhi server-only 配置名或 DSI 会话 Cookie 标记进入客户端产物。

#### 修改方案

- 建立状态化 Work Skill 浏览器 fixture，完整模拟批准的同源 BFF 契约，并以用户可见角色/名称断言 Market → 预览 → 去管理 → 详情 → 返回、安装、批量管理和 Editor 写操作。
- 抽取完整登录态 fixture，供 Work/daily Skill E2E 复用；新增不依赖外部密钥的 Work 历史恢复与继续对话回归，同时保留真实 Xiaozhi 后端测试的显式环境门禁。
- 扩展构建敏感信息扫描：客户端禁止出现 Xiaozhi server-only 配置名和 `dsi_app_session` 标记，构建全域禁止出现实际 Skill Market 密钥和 Xiaozhi API Key 值。

#### **代码变更：**

1. 新增 `e2e/fixtures/work-skills-api.ts` 与 `e2e/work-skills.spec.ts`：覆盖列表、关键控件顺序、预览、启停、上传、远程安装草稿、批量删除、文件保存、生效范围、依赖、ZIP 导出、只读权限，以及 Market → Editor → Market 路径闭环。
2. 新增 `e2e/fixtures/global-auth.ts` 与 `e2e/work-chat-history-regression.spec.ts`，并更新 daily Skill fixture、catalog 与安全用例：统一模拟完整登录态，回归 Work 历史列表、恢复会话、继续发送、daily 生命周期、模式隔离和既有安全门禁。
3. 扩展 `scripts/skill-market-sensitive-data.ts`、对应测试与执行脚本：新增 Xiaozhi/DSI 公共环境名阻断、客户端 server-only 标记扫描，并将 Xiaozhi API Key canary 纳入全构建产物扫描。
4. 验证 Work focused tests 201/201、完整 Vitest 692/692、目标 Playwright 17/17（真实后端用例因无临时 API Key 跳过 1 项）、ESLint、TypeScript strict 与 production build 全部通过；临时 canary 构建扫描未发现密钥、Cookie 或私有配置泄漏。
5. 只读核对 `DSI-agent-loop` 工作树为 clean；Xiaozhi 工作区仅有实施文档勾选，`xiaozhi-offline-deploy` 后端源码、配置结构和数据库 Schema 均无 diff。

### 33. Work Skill BFF 浏览器路径修正（加载失败与批量管理禁用根因）

提交：`e0e9562`

Plan 文档：`docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`

对应 Plan 模块：`Task 6 后续修正`

#### 问题

- 浏览器端把上游 `/api/...` 路径原样拼到 BFF 前缀，发出 `/api/work-skills/api/system/skills`（双 `api` 段），被 Task 2 白名单拒绝；列表请求 404 触发"Work Skill 加载失败"，无可管理 Skill 导致批量管理按钮按设计持续禁用。
- Task 6 的 e2e fixture 使用相同错误路径形状，未能在验收中暴露该缺陷。

#### 修改方案

- `createWorkSkillsApi` 新增 `bffUrl`：剥离 `/api` 前缀访问同源 BFF，并拒绝非 `/api/` 上游路径；契约常量保持冻结。
- e2e fixture 的 install-drafts 与 Skill 子资源正则、spec 的路径断言同步到正确形状。

#### **代码变更：**

1. `work-api.ts` 所有请求（含 ZIP 导出）统一经 `bffUrl` 构造；`work-api.test.ts` 路径断言全部改配。
2. `e2e/fixtures/work-skills-api.ts` 修正 install-drafts、tree/file/enabled/share-config/dependencies/export 匹配；`e2e/work-skills.spec.ts` 三个 endsWith 断言改配。
3. 验证 work-api 聚焦测试全部通过、Work e2e 4/4 通过。

### 34. 对齐老前端 Skill 页面跳转与 Creator 草稿状态保留

提交：`e0e9562`

Plan 文档：`docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`

对应 Plan 模块：`Task 5/6 后续对齐`

#### 问题

- Creator 返回、保存后 URL、我的-草稿编辑、发布-创建新修订的跳转与老前端不一致。
- 保存草稿后 `router.replace` 绑定 draftId，页面把 draftId 传回组件触发草稿恢复 effect，`recoverCreatorState` 重置整个本地状态，"草稿已保存"提示与"前往作者工作台提交审核"入口消失（e2e 捕获）。

#### 修改方案

- Creator 返回链接统一指向 `/skills?mode=daily`；首次保存后 `router.replace` 绑定 `draftId`。
- 我的-草稿编辑与发布-创建新修订统一跳转 `/skills/creator?mode=daily&draftId=...`（修订携带 `sourcePublication`/`revision`）。
- 新增 `savedDraftRef` 记录刚保存的草稿 id，恢复 effect 跳过该 id，避免保存结果被自身覆盖；广场四个入口 href 由测试固定，lifecycle e2e 增加 URL 断言。

#### **代码变更：**

1. `skill-creator.tsx` 返回链接、保存后 URL 绑定与 `savedDraftRef` 门禁；`skill-creator.test.tsx` 新增"URL 绑定不重置已保存状态"用例。
2. `skill-mine.tsx` 草稿编辑链接改指 Creator；`skill-publication-list.tsx` 与 `skill-publication-detail.tsx` 创建新修订改指 Creator。
3. `skill-catalog-plaza.test.tsx` 固定四个入口 href；`e2e/skill-market-lifecycle.spec.ts` 增加保存后与创建修订后的 URL 断言。
4. 验证 Creator 聚焦测试 6/6、全量 Vitest 696/696、lifecycle e2e 通过。

### 35. Skill 审核证据子标题样式统一

提交：`e0e9562`

Plan 文档：`docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`

对应 Plan 模块：`Task 5/6 后续对齐`

#### 问题

- 审核详情页各证据子标题（Definition、Requirement、Revision Diff、Tool 与 Validator、Smoke Evidence、审核历史）及页面自有区块标题需要统一的字体与设计。

#### 修改方案

- 统一使用 `.skill-review-evidence-title`，与 `.creator-section h2` 共享同一条字体规则（14px / 620 / -0.01em / line-height 1.35）。
- 补齐 Trigger Test、审核决定、发布三个裸标题；测试循环断言全部子标题共用类名且保持 H2 语义。

#### **代码变更：**

1. `review-evidence.tsx` 证据区块标题挂载统一类名；`skill-review-detail.tsx` 三个页面自有区块标题补齐同类名。
2. `globals.css` 追加 `.skill-review-evidence-title` 规则；`skill-review-detail.test.tsx` 断言 8 个可靠渲染的子标题样式一致。

### 36. 统一 Skill 子页面返回链接

提交：`e0e9562`

Plan 文档：`docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`

对应 Plan 模块：`Task 5/6 后续对齐`

#### 问题

- 各子页面返回入口不一致：Skill 详情用图标箭头且内容套在扩展槽位面板中，审核队列、发布管理、我的 Skill 没有左上角返回链接（仅有右上角"返回广场"按钮）。

#### 修改方案

- 新增共享 `SkillBackLink`：左上角、灰色 `.back-link`、文本"← "前缀，与 Creator 返回入口完全一致。
- 9 个页面统一接入；移除审核队列、发布管理、我的 Skill 右上角的"返回广场"按钮；Skill 详情弃用 `ResourceDetailSlot`，返回链接改为统一文本箭头并去掉"扩展槽位"占位标签。

#### **代码变更：**

1. 新增 `src/features/skills/components/skill-back-link.tsx` 与单元测试。
2. Creator（含草稿已提交提示页）、审核队列、审核详情、发布管理列表（含错误态）与详情、我的 Skill、草稿编辑/新建、Skill 详情全部接入共享组件。
3. 同步更新 mine、发布、审核队列与 Skill 详情的相关测试断言。
4. 验证全量 Vitest 696/696、目标 Playwright 14/14、TypeScript strict 与 ESLint 全部通过。

## 2026-11-13

### 37. 统一 Daily/Work Skill 卡片、详情与筛选视觉

提交：`de84701`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`、`docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`

对应 Plan 模块：`C-02`、`Work Task 3/4 后续视觉修正`

#### 问题

- Daily Skill 卡片与 Work 的图标语言不一致，点击后仍从右侧展开详情；用户要求保留说明、来源和运行状态的同时改为彩色图标与居中详情。
- Work Skill 预览直接把 `SKILL.md` YAML frontmatter 当正文展示，Markdown 字号、层级、行距和代码样式较粗糙；详情页标题也缺少稳定的 slug 层级。
- Daily 与 Work 操作按钮的主次颜色不一致；Work 通用 hover 选择器优先级高于主按钮，导致蓝色按钮悬停/点击时变成近白或灰色。
- Daily 来源筛选仍使用“内置/市场”，状态筛选只区分“可用/名称冲突”，与卡片展示的“运行中/已启用/可安装/不可用”不一致；两个原生下拉框的选中文字视觉偏左。

#### 修改方案

- 抽取确定性彩色 Skill 图标供 Daily/Work 共用；Daily 保留描述、元信息与状态徽标，并把详情改为带遮罩、焦点恢复和移动端适配的居中弹窗。
- Work 预览渲染前只剥离标准 YAML frontmatter，正文继续由 `react-markdown` + GFM 安全渲染；统一标题、段落、列表、代码、引用、链接与表格层级，并在预览和 Editor 标题区展示 slug。
- Daily/Work 共用蓝色主按钮、白底描边次按钮；补齐 hover/active/disabled 的专用优先级，使异步禁用保持浅蓝而不是退化为灰色。
- 来源筛选复用 `SKILL_SOURCE_LABELS`，状态筛选改为精确匹配 `installState`，并同步 URL 深链白名单；来源/状态控件使用固定箭头、对称内边距和居中文字，保留“查看全部”和清除筛选能力。

#### **代码变更：**

1. 新增 `src/features/skills/components/skill-card-icon.tsx`，并更新 Daily `skill-catalog-card.tsx`、Work `skill-card.tsx` 与 `skill-preview-dialog.tsx` 共用同一套确定性色调图标。
2. 更新 `skill-catalog-drawer.tsx` 与 `globals.css`，把 Daily 详情从右侧抽屉改为居中弹窗，并统一 Daily/Work 标题、slug、正文和响应式排版。
3. 更新 `skill-preview-dialog.tsx`，剥离标准 frontmatter 后再渲染 Markdown；更新 Work Editor 标题层级与按钮主次样式，修复主按钮 hover/disabled 变白或变灰。
4. 更新 `catalog-filter.ts`、`catalog-navigation.ts` 与 `skill-catalog-plaza.tsx`，提供“内置 Skill/市场发布”和“运行中/已启用/可安装/不可用”筛选，按真实安装状态过滤并使用居中的自定义下拉控件。
5. 扩展 Catalog、Work 预览、导航与 E2E 断言；相关组件测试 47/47、最终 Catalog 聚焦测试 32/32、TypeScript strict 与 ESLint 通过。全量 Vitest 756/764，8 个失败均为既有 Conversation Schema 锁文件 SHA-256 漂移；初始卡片/弹窗改动后的 Skill Playwright 6/6 通过，后续按钮颜色与筛选断言因本地浏览器提权未获批准未复跑。Webpack build 完成编译与类型检查后，在静态生成 `/mcp` 时因沙箱目录创建权限 `EPERM` 中止。

### 38. 修复 Skill 跨模式路由与 Conversation 契约行尾漂移

提交：`76f7dea`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`、`docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`

对应 Plan 模块：`C-02`、`Work Task 5 后续路由修正`

#### 问题

- 顶部模式切换此前只替换当前 URL 的 `mode` 参数；从 `/skills/[slug]?mode=work` 切到 Daily 时，会把 Work slug 原样交给 Daily Catalog，因两套后端 ID 空间独立而显示“未找到该 Skill”。Daily 详情、Creator、审核、发布、草稿和“我的 Skill”等子路由反向切到 Work 时存在同类错配。
- Conversation Schema 在 Git 索引中是 LF，但 `.gitattributes` 没有覆盖该目录，Windows 工作区被检出为 CRLF；字节级 SHA-256 因 7,566 个行尾变化而与锁文件不一致，连带造成 3 个 Schema lock 测试和 5 个 client generator 测试失败。

#### 修改方案

- ModeProvider 对 `/skills` 路由建立 daily/work 双槽位会话记忆：首次切到另一模式进入该模式 Skill 主界面，离开前记录当前路径与查询参数，切回时恢复原详情或子页面。非 Skill 页面继续保持原路径只替换 mode 的既有行为。
- 路由记忆只接受同源 `/skills` 相对路径且要求存储值的 mode 与目标模式一致；Work 计划要求清理的弹窗、批量选择、安装草稿、页面缓存和未提交编辑内容仍不跨模式保留。
- 为 Conversation Schema JSON 与生成 TypeScript 增加 `text eol=lf`，并机械规范化本地工作区字节；不修改 Schema 内容、版本、operation 数量或锁文件期望 hash。

#### **代码变更：**

1. 更新 `src/providers/mode-provider.tsx`，增加 Skill 路由识别、安全 sessionStorage 读写、主界面回退和双向恢复；新增 `mode-provider.test.tsx` 覆盖 Work 详情 → Daily 主界面 → Work 详情、Daily Creator → Work 主界面 → Daily Creator，以及非 Skill 页面兼容行为。
2. 更新 `.gitattributes`，固定 `src/features/chat/conversation/contracts/schema/*.json` 与 `generated/*.ts` 使用 LF；规范化后 Schema SHA-256 恢复为锁文件记录的 `d5bd3ae1b98758366c1e9a6e61f1b6c32cb0502c0739823a6d0e7367fe467472`，Git blob 内容未变化。
3. 验证模式切换聚焦测试 34/34、Conversation lock/generator 测试 11/11、全量 Vitest 767/767、TypeScript strict 与 ESLint 全部通过。

## 后续条目模板

```markdown
## YYYY-MM-DD

### 变更标题

提交：`commit`

Plan 文档：`path/to/plan.md`

对应 Plan 模块：`T1`

#### 问题

- 用户看到的问题或提出的需求。

#### 修改方案

- 说明采用的整体设计、关键取舍、边界条件和失败/降级策略。
- 明确哪些状态以后端为准、哪些行为在前端阻断，以及本次不包含的范围。

#### **代码变更：**

1. `path/to/file.ts`：说明新增或修改的具体行为。
2. `path/to/component.tsx`：说明页面、状态或交互变化。
3. `path/to/file.test.ts`：说明新增的测试覆盖和关键负向场景。
4. 验证：列出实际运行的聚焦测试、全量测试、typecheck、lint 或 build 结果；未运行的项目也要明确说明。
```
