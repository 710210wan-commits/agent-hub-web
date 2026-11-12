# Development Plan：Work Skill Market / Editor 前端实施

> 状态：已批准
>
> 批准日期：2026-11-11
>
> 批准依据：用户明确要求实施 Task 0；绑定设计已同步批准单用户 Work Skill Market / Editor。
>
> 实施仓库：`D:\0 ysq文件\agent-hub-web`
>
> 只读事实源：`D:\0 ysq文件\20261104_xiaozhi-offline-deploy`

## 1. Authority and supersession

- 绑定设计：`docs/skill-market/2026-10-27-agent-hub-web-design.md`。
- daily 既有计划：`D:\0 ysq文件\DSI-agent-loop\docs\plans\2026-11-05-skill-market-frontend-migration.md`，继续只治理 `mode=daily`。
- 本计划只治理 `mode=work`，并仅在 Work 范围内取代 daily 既有计划及历史测试中的“Work 保持无请求占位”约束。
- 本计划不放宽 daily 的公开契约、HMAC Principal、生命周期、Catalog 或 Runtime 规则。
- 原型与接口分析来源：
  - `D:\0 ysq文件\20261104_xiaozhi-offline-deploy\docs\2026-11-11_skill-workspace-prototype-and-implementation-plan.md`
  - `D:\0 ysq文件\20261104_xiaozhi-offline-deploy\docs\2026-11-11_agent-hub-web-sync-feasibility-review.md`
  - `D:\0 ysq文件\20261104_xiaozhi-offline-deploy\prototype\skills-work`

## 2. Goal

在不修改 Xiaozhi 后端、数据库和存储模型的前提下，把 Xiaozhi 现有 Skill Market 与已安装 Skill 管理编辑器接入 Agent Hub：

- `/skills?mode=work` 提供搜索、推荐/内置/上传分组、预览、启停、上传、远程安装、草稿确认和批量删除。
- `/skills/[slug]?mode=work` 提供代码管理、生效范围、依赖管理、导出和删除。
- Work 只访问独立同源 `/api/work-skills/*` BFF；daily 继续只访问 `/api/skill-market/*`。
- 首版按“一个部署、一个固定 Xiaozhi 操作员账号”验收，不宣称多用户身份隔离。
- 功能、入口、状态转换、按钮区域与顺序对齐原 Xiaozhi Vue 页面；视觉适配 Agent Hub。

## 3. Non-goals

- 不修改 `D:\0 ysq文件\20261104_xiaozhi-offline-deploy` 中的后端、数据库、路由或权限模型。
- 不修改 `D:\0 ysq文件\DSI-agent-loop` 的 daily Skill Market 契约或实现。
- 不实现多用户 DSI → Xiaozhi 身份桥接。
- 不实现从空白表单创建 Skill、Requirement Interview、Bundle 生成、审核或发布流程。
- 不把 Work API 合并到 daily client，不扩大 `/api/work-agent/*`，不建立开放代理。
- 不在生产失败时回退到原型数据、fixture 或 mock 响应。

## 4. Frozen product and interaction contract

### 4.1 Navigation

1. `/skills?mode=work` 直接显示 Work Skill Market，不增加 Market/Creator 顶部切换。
2. 点击已安装卡片打开居中 `SKILL.md` 预览弹窗。
3. 点击“去管理”进入 `/skills/[slug]?mode=work`。
4. 详情页“返回”回到 `/skills?mode=work`。

### 4.2 Required order

| 区域 | 顺序或位置 |
| --- | --- |
| Market 工具栏 | 左侧搜索；右侧依次为批量管理、远程安装、上传 Skill、刷新 |
| 批量工具栏 | 全选、反选、清空、批量删除 `(n)`、退出管理；完全替换普通工具栏 |
| 分组 | 推荐、内置、上传的；批量模式隐藏推荐 |
| 卡片操作 | 推荐为 `+`；已启用为勾选且悬停显示 `−`；禁用为 `+` |
| 预览弹窗 | 标题/来源在左、启停在右；卸载在左，关闭/去管理在右 |
| 远程安装 | 按仓库拉取、全局搜索发现；取消在左，解析并确认在右 |
| 草稿确认 | 来源、解析项、生效范围；取消、确认添加 |
| 详情顶栏 | 返回在左，名称/状态居中，导出/删除在右 |
| 详情页签 | 代码管理、生效范围、依赖管理 |
| 文件树操作 | 新建文件、新建目录、刷新；编辑器在右 |
| 设置 | 启用状态在前、生效范围在后；保存设置在右 |
| 依赖 | 工具、MCP、Skill；更新依赖在右 |

上述顺序必须有结构测试，不得只依赖视觉截图。

## 5. Security and deployment contract

- 浏览器不能持有或提交 Xiaozhi API Key。
- 每个 Work BFF 请求必须先读取 `dsi_app_session`，在服务端调用 DSI `/auth/xiaozhi-status` 验证完整登录态。
- 只有 `enabled: true` 的完整登录态可以继续；anonymous、demo、失效会话、缺少 Cookie、认证超时和认证服务不可用全部 fail closed。
- 会话校验必须发生在读取上传体和调用 Xiaozhi 之前。
- Cookie 只发送给 DSI 会话接口；不得发送到 Xiaozhi。
- 浏览器传入的 Authorization、Host、Origin、Cookie、转发头和私有凭据全部丢弃。
- 校验通过后，BFF 使用 server-only `XIAOZHI_API_ORIGIN` 和 `XIAOZHI_API_KEY` 调用固定上游。
- BFF 使用显式 method + path + query 白名单，支持 JSON、multipart 和 ZIP 流式响应，不接受绝对 URL 或浏览器指定 Origin。
- 日志和错误不得包含 API Key、Cookie、Authorization、上传内容、文件内容或完整上游错误对象。
- 部署者必须保证统一登录账号与 `XIAOZHI_API_KEY` 所属 Xiaozhi 账号是同一个固定操作员。

## 6. Frozen upstream capability map

| 体验 | Xiaozhi 接口 |
| --- | --- |
| 列表 | `GET /api/system/skills` |
| 预览 | `GET /api/system/skills/{slug}/file?path=SKILL.md` |
| 启停 | `PUT /api/system/skills/{slug}/enabled` |
| 上传解析 | `POST /api/skills/import/prepare` |
| 仓库列表 | `POST /api/skills/remote/list` |
| 全局搜索 | `POST /api/skills/remote/search` |
| 远程解析 | `POST /api/skills/remote/prepare` |
| 安装确认 | `POST /api/skills/install-drafts/{draft_id}/confirm` |
| 安装取消 | `DELETE /api/skills/install-drafts/{draft_id}` |
| 批量删除 | `POST /api/system/skills/delete-batch` |
| 文件树/读取 | `GET /api/system/skills/{slug}/tree`、`GET /api/system/skills/{slug}/file` |
| 新建/更新/删除节点 | `POST/PUT/DELETE /api/system/skills/{slug}/file` |
| 依赖选项/保存 | `GET /api/system/skills/dependency-options`、`PUT /api/system/skills/{slug}/dependencies` |
| 生效范围 | `PUT /api/system/skills/{slug}/share-config` |
| 导出/删除 | `GET /api/system/skills/{slug}/export`、`DELETE /api/system/skills/{slug}` |

实施前用真实后端源码和 fixture 再核对参数、响应与错误结构；若事实源与表格冲突，先更新本计划，不猜测兼容。

### 6.1 共享范围选择器的实施范围

- 冻结白名单**不含** `GET /api/departments` 与 `GET /api/auth/users/access-options`；原 Vue `ShareConfigForm` 的部门多选、指定多用户面板在本期没有目录数据源，不可完整复刻，不得通过扩大白名单绕过该限制。
- 本期共享范围 UI 为单选形态，选项按上游 `allowed_access_levels`（`GET /api/system/skills` 响应与安装草稿 `default_share_config` 均已携带）过滤，提交语义：
  - `user`：提交 `{ access_level: "user", user_uids: 载入的原配置 user_uids }`，单用户模式下展示为"仅自己"。草稿初值取后端预填的 `default_share_config.user_uids`。
  - `department`：提交 `{ access_level: "department", department_ids: 载入的原配置 department_ids }`，展示为"所在部门"。草稿初值取后端预填的 `default_share_config.department_ids`。
  - `global`：提交 `{ access_level: "global", department_ids: [], user_uids: [] }`。
- 合并保留规则：后端保存路径会强制把操作员自己的 uid / 部门追加进配置，但前端仍须原样提交载入的 `user_uids` / `department_ids`，保留本期 UI 无法展示的条目，不得因界面降级缩小他人可见范围。
- 内置 Skill 生效范围只读，展示固定 `global`；`can_manage === false` 时设置页整体只读。
- 若未来需要真正的多部门/多用户选择面板，必须先按第 10 节停止条件更新本计划与白名单，再实施。

## 7. Target architecture

```text
Browser
  -> /api/work-skills/*
  -> DSI Session verification
  -> allowlisted Work Skill proxy
  -> Xiaozhi /api/skills/* or /api/system/skills/*
```

建议文件：

```text
src/app/api/work-skills/[...path]/route.ts
src/server/xiaozhi/skills-proxy.ts
src/server/xiaozhi/skills-proxy.test.ts
src/features/skills/work/
  api.ts
  contracts.ts
  work-skills-page.tsx
  skill-card.tsx
  skill-preview-dialog.tsx
  remote-install-dialog.tsx
  install-draft-dialog.tsx
  skill-editor.tsx
  skill-file-editor.tsx
  skill-settings.tsx
  skill-dependencies.tsx
```

文件名可按现有仓库结构微调，但职责和 daily/Work 隔离不可改变。

## 8. Execution tasks

- [x] Task 0：批准绑定设计与实施计划
- [x] Task 1：冻结 Work 接口契约
- [x] Task 2：实现独立安全 BFF
- [x] Task 3：实现 Work Skill Market
- [x] Task 4：实现 Work Skill Editor
- [x] Task 5：接入路由并证明模式隔离
- [x] Task 6：最终验证与交付

### Task 0：批准绑定设计与实施计划

- [x] 更新绑定设计，允许 `mode=work` 接入 Xiaozhi Skill API。
- [x] 明确 daily/Work 后端、路由、状态和缓存隔离。
- [x] 明确单用户固定操作员边界与 DSI Session 门禁。
- [x] 将本计划登记为 `AGENTS.md` 的 Active Work Skill extension plan。
- [x] 记录批准，不修改生产代码。

### Task 1：冻结 Work 接口契约

**目标文件：**

- Create: `src/features/skills/work/contracts.ts`
- Create: `src/features/skills/work/contracts.test.ts`
- Create: `src/features/skills/work/fixtures/*`

**步骤：**

1. 从 Xiaozhi 现有 router、service 和原 Vue API 封装整理请求/响应 fixture、错误 envelope、上传限制、批量上限和下载响应头。
2. 先写失败测试，覆盖列表、文件树、文件内容、依赖、生效范围和安装草稿的最小运行时解析。
3. 实现最小 DTO 和防御性解析；未知字段允许忽略，缺失关键字段必须失败为安全错误。
4. 固定 confirm/cancel 的准确路径，不增加不存在的能力。
5. 运行聚焦测试和 `pnpm typecheck`。

### Task 2：实现独立安全 BFF

**目标文件：**

- Create: `src/server/xiaozhi/skills-proxy.ts`
- Create: `src/server/xiaozhi/skills-proxy.test.ts`
- Create: `src/app/api/work-skills/[...path]/route.ts`

**步骤：**

1. 先写失败测试：完整会话允许；缺 Cookie、anonymous、demo、失效、认证超时/故障全部零 Xiaozhi 请求。
2. 写失败测试覆盖 method/path/query 白名单、绝对 URL、编码绕过、浏览器目标覆盖和未知路径。
3. 写失败测试覆盖 Header 隔离、Cookie 只发 DSI、API Key 只发 Xiaozhi、日志/错误不泄密。
4. 写失败测试覆盖 JSON、multipart、ZIP 流式下载、204、4xx/5xx、取消与超时。
5. 实现最小 proxy 和薄 Route Handler。
6. 运行聚焦测试、现有 Work Agent BFF 测试、`pnpm lint` 和 `pnpm typecheck`。

### Task 3：实现 Work Skill Market

**目标文件：** `src/features/skills/work/` 下的 API client、页面、卡片与三个弹窗组件。

**步骤：**

1. 先写列表状态和 API client 失败测试，覆盖加载、刷新、空态、错误、取消与 identity generation 变化。
2. 先写组件失败测试，覆盖搜索、三分组、权限、启停、预览和禁用重复提交。
3. 实现列表、搜索、分组、卡片与居中预览弹窗。
4. 先写失败测试后实现上传、远程仓库、全局搜索、安装草稿确认/取消和批量删除。
5. 为工具栏、分组、批量替换和弹窗 footer 写 DOM 顺序测试。
6. 验证 `can_manage === false` 只读、内置不可删除、批量最多 50。

### Task 4：实现 Work Skill Editor

**状态：已完成（2026-11-11）。** 路由接入仍属于 Task 5。

**目标文件：** `skill-editor.tsx`、`skill-file-editor.tsx`、`skill-settings.tsx`、`skill-dependencies.tsx` 及对应测试。

**步骤：**

1. 先写失败测试覆盖文件树、读取、保存、新建文件、新建目录和删除节点。
2. 实现代码管理页签，阻止路径越界、未选择和重复保存。
3. 先写失败测试后实现启用状态、生效范围（UI 与提交语义遵守 §6.1）、依赖选项与保存。
4. 先写失败测试后实现 ZIP 导出、删除和危险操作确认。
5. 覆盖 `can_manage === false`、内置只读、失败恢复和并发状态。
6. 为顶栏三段布局、页签、文件树操作和保存按钮写结构顺序测试。

### Task 5：接入路由并证明模式隔离

**状态：已完成（2026-11-11）。** Work Market 与 Editor 已接入批准路由，daily/Work 请求和临时状态隔离已由组件、路由与 E2E 证明。

**目标文件：**

- Modify: `src/features/skills/catalog/skill-catalog-plaza.tsx`
- Modify: `src/features/skills/catalog/skill-catalog-detail.tsx`
- Modify: 必要的薄 App Router 页面与模式测试

**步骤：**

1. 先把现有 Work 占位测试改成新失败验收：Work 渲染新页面且 daily client 零请求。
2. `/skills?mode=work` 挂载 Work Market；`/skills/[slug]?mode=work` 挂载 Work Editor。
3. 保持所有 daily 路由、查询和生命周期行为不变。
4. 测试 daily 不请求 Work BFF，Work 不请求 daily BFF。
5. 测试模式切换中止旧请求并清理选择、弹窗、草稿和页面缓存。

### Task 6：最终验证与交付

**状态：已完成（2026-11-12）。** Work Skill 关键旅程、daily 生命周期、Work Chat/历史、安全门禁、production build 与敏感信息扫描均已完成；真实 Xiaozhi 后端 E2E 因本机未配置临时 API Key 而跳过，已用同源契约 fixture 完成浏览器回归，后端源码保持零改动。

1. 运行 Work 契约、BFF、组件和路由 focused tests。
2. 运行 `pnpm test`、`pnpm lint`、`pnpm typecheck` 和 `pnpm build`。
3. 增加并运行 Playwright：列表、预览、启停、上传、远程安装草稿、批量删除、文件保存、范围、依赖、导出、只读权限。
4. E2E 断言 Market → 预览 → 去管理 → 详情 → 返回的路径和关键控件顺序。
5. 回归 daily Skill 生命周期、Work Chat、历史页以及现有 Skill Market 安全门禁。
6. 扫描客户端构建产物、日志和响应，确认没有 Xiaozhi API Key、Cookie 或私有凭据。
7. 确认 Xiaozhi 和 DSI 仓库 diff 为零；若只读回归需要运行其既有测试，记录命令和结果但不修改源码。

## 9. Acceptance criteria

- Xiaozhi 后端和数据库无代码、配置结构或 Schema 改动。
- `/skills?mode=work` 不再显示占位，完整呈现批准的 Work Market 范围。
- `/skills/[slug]?mode=work` 完成批准的 Editor 范围。
- daily Skill Market、Creator、审核、发布、安装和 Runtime 行为无回归。
- Work 未登录、anonymous、demo、失效会话和认证故障全部在调用 Xiaozhi 前拒绝。
- BFF 不是开放代理；Cookie 不到 Xiaozhi，API Key 不到浏览器。
- 功能路径、按钮区域和顺序与原 Vue 页面一致；视觉 token 与 Agent Hub 一致。
- 管理权限、内置只读、安装草稿、ZIP 下载和批量上限与 Xiaozhi 权威行为一致。
- 1280px 桌面、平板和移动端基础可用。
- focused tests、全量测试、lint、typecheck、Playwright 和 production build 全部通过后才能声明完成。

## 10. Stop conditions

遇到以下情况必须停止对应实现并先更新设计或请求批准：

- 真实 Xiaozhi 接口与冻结 capability map 在路径、权限或状态转换上冲突。
- 完成需求需要修改 Xiaozhi 或 DSI 后端。
- 需要支持多个 Agent Hub 用户映射到不同 Xiaozhi 身份。
- 需要新增空白创建、AI Creator、审核、发布或 Runtime 能力。
- 无法在服务端可靠区分完整登录、anonymous 和 demo。
- 需要让浏览器持有 API Key、Xiaozhi Token 或其他服务端凭据。

## 11. Decision log

| 日期 | 决策 | 状态 |
| --- | --- | --- |
| 2026-11-11 | Work 采用 Xiaozhi 现有 Skill API，daily 保持现有 DSI Skill Market | 已批准 |
| 2026-11-11 | 首版采用单部署、单固定 Xiaozhi 操作员账号 | 已批准 |
| 2026-11-11 | 新建独立 `/api/work-skills/*` BFF，不扩大 `/api/work-agent/*` | 已批准 |
| 2026-11-11 | 完整 DSI Session 才可访问；anonymous、demo、失效和故障均 fail closed | 已批准 |
| 2026-11-11 | 原型绑定功能、导航、控件区域和顺序；Agent Hub 只做视觉换肤 | 已批准 |
| 2026-11-11 | 共享范围 UI 冻结为单选形态：白名单不含部门/用户目录接口，提交保留原配置数组，后端保证操作员在列 | 已批准 |

