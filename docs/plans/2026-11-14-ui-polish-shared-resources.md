# UI 修复与共享资源入口实施计划

> **For agentic workers:** Use superpowers:executing-plans task-by-task; checked steps record actual verification.

**Goal:** 按用户确认顺序完成 1/4/6，再完成 2/3/5；MCP 服务部署及真实模型设置另行处理。
**Architecture:** 保留全局 AuthProvider；只修复登录初值、外壳滚动和展示文案。URL 使用 mode=1/2，内部 AppMode 和后端 scenarioId 仍为 daily/work。仅复用现有 Daily 软删除接口；工作删除经用户确认延期，资源页面共用入口不合并 Skill 后端。
**Tech Stack:** Next.js 16 / React 19 / TypeScript / pnpm / Vitest / Playwright。
**Spec:** 本对话用户已批准的七项评估和顺序；第 5 项已纠正为知识库和 MCP 共享，Skill 维持双场景。
**Approval:** 用户已授权上述动作；本文记录既有决定，不引入新的权限、DB 或部署设计。仅本地提交；未授权本轮 push、PR、merge、线上部署。
**Baseline:** frontend origin/main 3d06094; backend origin/main e425ed1。

## Global Constraints

- 不改已部署服务器、测试账号密码或生产数据。
- 不创建 MCP 服务，不接入模型选择，不改变 Daily/Work Loop 路由目标。
- 不在浏览器源码预填账号密码；保留正常浏览器密码管理器语义。
- 决策=内部 daily=URL 1；工作=内部 work=URL 2；旧 daily/work 链接兼容。
- KB/MCP 统一管理；Skill 仍按后台来源隔离。隐藏资源页模式开关时仍须保留返回对话的上下文。
- 删除复用现有后端软删除；前端确认、错误保留、列表更新、身份失效处理一致。首版不支持恢复删除。
- MCP 资源统一不改变 enabled/health/read-only/显式每轮选择等限制，也不宣称工作 Loop 已接入独立 MCP。

## Review Focus

- 账号空值及失败登录：表单不能无输入提交；错误不重新注入默认密码。
- 长 Skill/MCP 页面与窄屏：用户栏可见，业务内容可完整滚动，移动导航可用。
- 删除异常/换号/活跃会话：失败保留行，401 全局失效；同名会话按 ID 操作。
- URL 兼容：旧链接和数字新链接一致，conversation/draft/过滤条件不能被误改；切模式不能串会话。
- 共享资源入口：去掉模式开关和场景过滤后不误改双后端 Skill 或放宽 MCP 安全条件。

## Tasks

### Task 1 — 清空登录初值（项 1）
Files: src/components/auth/login-page.tsx; src/components/auth/auth-boundary.test.tsx; dependent auth E2E tests.
- [x] 将旧“预填”断言改为初次与失败后空初值/显式输入登录行为，先运行确认旧实现失败。
- [x] username/password 初值改为空，删除默认凭据注释；保留 autocomplete。
- [x] 执行 auth 聚焦测试；检查依赖默认值的测试显式填入测试凭据；自审、提交。

### Task 2 — 修复外壳滚动（项 4）
Files: src/app/globals.css; e2e/shell-layout.spec.ts (new).
- [x] 浏览器测试构造长内容，在 1440x900 / 1280x720 断言用户栏始终在视口，app-content 滚动可到底；先观察失败。
- [x] 外壳明确限制视口高度，业务区独立滚动；侧栏用户区不随业务内容增长，移动菜单可滚动。
- [x] 运行浏览器聚焦回归；自审、提交。

### Task 3 — 决策/工作显示名（项 6）
Files: src/config/copy.ts; mode-related visible strings in src; corresponding assertions in tests.
- [x] 确认切换控件与历史等用户可见文案应为“决策/工作”；保留内部 daily/work 和来源标识。
- [x] 实施集中 copy 与散落场景提示的对应修改；更新因明确文案变更而受影响的断言。
- [x] 模式切换、历史与登录聚焦测试；自审、提交。

### Task 4 — 历史软删除（项 2）
Files: src/features/chat/transports/daily-session-client.ts; src/features/chat/session/daily-session-store.ts; src/components/chat/daily-session-history.tsx; corresponding tests.
Interfaces: DailySessionClient.deleteConversation(id, signal?): Promise<void>; store.deleteConversation(id): Promise<boolean>.
- [x] RED: 按 ID 删除及 204；失败不移除；401 与身份 generation 防串；工作删除不纳入本批。
- [x] 增加请求与状态管理、确认 UI、busy/error；仅复用原生 DELETE /conversations/:id，不改工作网关、后端或数据库。
- [x] 聚焦 Vitest / history E2E；自审、提交。

### Task 5 — URL 数字映射（项 3）
Files: src/config/modes.ts; src/providers/mode-provider.tsx; navigation/session/skill URL builders and affected route parsers/tests.
Interfaces: parseMode accepts 1/2 and legacy daily/work; serializeMode(AppMode): '1'|'2'; withMode emits numeric mode only.
- [x] RED: parseMode('1')='daily'; parseMode('2')='work'; legacy accepted; emitted URLs mode=1/2; preserve other params and hash。
- [x] 更新所有前端 URL 生成及入口解析；内部类型、API/BFF 后端值保持 daily/work；sessionStorage 旧 route 兼容。
- [x] 测试旧链接、深链接、切换后端、刷新与历史跳转；自审、提交。

### Task 6 — 知识库/MCP 共享管理（项 5）
Files: shared shell header/nav; KB routes; src/components/mcp; MCP catalog filtering backend only if required, in separate backend branch.
- [x] RED: KB/MCP 无模式开关；共享资源列表不随对话模式隐藏；Skill 仍按 daily/work 分流。
- [x] KB 继续走同一 Xiaozhi 桥接；共享路由保留导航上下文但不按模式筛资源。MCP 去场景标签过滤/默认语义；已有标签若保留，只作为分类。
- [x] 检查原生 MCP provider 标签 1 限制，与共享目录对齐；保持 enabled/health/read-only/显式选择约束。若需要改变现有鉴权设计或工作 Loop 接入，停止该扩展并记录到未来 MCP 计划。
- [x] 前后端聚焦契约/目录测试；MCP 无真实服务时只验诚实不可用，不假造真实通过；自审、提交。

### Task 7 — 集成验收与交付
- [x] pnpm exec vitest run --maxWorkers=2; pnpm lint; pnpm typecheck; required client checks; pnpm build。
- [x] 已有 mocked fixture E2E + 新布局/删除/数字 URL/共享入口用例；所有测试显式准备登录，不依赖默认账号。
- [x] 全分支独立 AI review，修复 Major/Critical，自审差异；更新证据与提交记录。
- [x] 交付本地分支/提交和未验范围；不 push 或部署。

## Execution Ledger

- 2026-11-14: 读取最新 main，SHA 未变；线上只读复现密码预填和用户栏离屏。复用 clean native frontend worktree，新建 codex/ui-polish-shared-resources；准备 pnpm 依赖及基线验证。

- Task 1: RED 2 failures (default values / empty submit); GREEN auth 23/23; full suite 797/797. No production auth behavior changed beyond blank initial form.

- Task 2: RED Skill footer bottom 1744 > 900; MCP footer bottom 3485.78 > 900. GREEN desktop 1440x900 / 1280x720 plus mobile navigation: 5/5 Playwright. Content scroll reaches final card; account stays in viewport.

- Task 3: RED 4 mode-label/legacy DTO display failures; GREEN 797/797 Vitest and combined navigation/layout/mobile 9/9 Playwright. Public labels decision/work; internal daily/work untouched; legacy scenario names mapped only in display model.

- Ruling (user): 工作删除延期；本批只接原生删除。现有 Work BFF 未验证全局登录，未来开启破坏性 endpoint 前需独立补认证/同源校验。

- Batch A independent review: no Critical/Major; one Minor tablet logout clipping. RED browser assertion reproduces; fixed collapsed account layout, GREEN 7/7 desktop/tablet/mobile layout. Added failed-login empty-field assertion. Lint, typecheck, production build passed before Batch B.

- Task 4 (Daily only): initial RED 9 missing-delete behaviors; GREEN focused 69/69, deletion browser flow 1/1 (cancel confirmation / delete / refresh / old URL 404), typecheck passed. Full suite first had existing 500-entry Skill timing timeout under parallel load; unchanged assertions passed with maxWorkers=2: 809/809. Deleted-ID tombstones prevent old pagination responses resurrecting rows. Work deletion deferred explicitly.

- Task 5: RED 8 URL/parser/mode-switch failures; GREEN 814/814 Vitest (maxWorkers=2), navigation+Skill E2E 7/7 including legacy normalization and distinct Skill backends. URL emits 1/2; backend query modes remain daily/work; mode switching drops conversation/draft only for chat/history.

- Task 6: RED 6 shared-list/header failures. GREEN focused 14/14 + shared-resource/login browser 2/2; earlier navigation/layout other 11 cases passed (new login locator corrected to exclude Next route announcer). Backend branch codex/ui-shared-mcp-catalog @ f0155a9 removes only label=1 scope predicate; 27 capability/Turn + 18 provider/security tests passed on isolated disposable DB; API typecheck passed. Labels preserved as categories. No MCP service or Work runtime added.

- Final independent review: no Critical/Major; two Minor findings (fragment loss during normalization, stale rename error masking delete error) reproduced RED and fixed GREEN, affected tests32/32; re-review confirmed no remaining findings. Typing-only Testing Library locator correction also verified7/7. Pre-fix final full suite818/818; default browser35 pass +1 opt-in real Xiaozhi skip; canonical browser18/18. Final post-review rerun/build pending.


## 最终验收与交接（2026-11-14）

| 范围 | 状态 |
| --- | --- |
| 1 登录初值 | 已清空用户名/密码；浏览器密码管理器正常语义保留 |
| 4 侧栏 | 长页内容独立滚动；桌面与平板用户/退出可见；移动导航回归通过 |
| 6 显示名称 | 决策/工作；内部 daily/work 及后端 API 值未改 |
| 2 历史删除 | 原生已接软删除、确认与错误/身份隔离；用户明确延期工作删除 |
| 3 mode URL | 新URL为1/2，旧链接兼容并归一；query/hash和Skill路由记忆保留；切对话模式清除conversation/draft |
| 5 共享资源 | KB/MCP共享管理且保留导航上下文；Skill继续双后端；MCP标签仅作分类 |
| MCP服务/鉴权、模型设置 | 本轮未实施；无真实MCP服务验收或工作Loop新增MCP能力 |

最终前端冻结版本（审查修正后）：
- 全量 Vitest：94 files / 820 tests passed，maxWorkers=2。
- 默认 Playwright：35 passed，1 skipped（真实 Xiaozhi 需显式 opt-in 与临时API Key，未启用）。
- Canonical Playwright：18 passed；涵盖登录/401/403/换号/demo、SSE/cancel、历史/删除、能力选择快照。
- 两处审查修正：RED均复现；聚焦32 tests passed；fragment真实浏览器1 passed；全量820再次通过。
- lint、typecheck、check:conversation-client、check:kb-client、check:skill-market-client、test:skill-market:independence通过。
- pnpm build通过；check:skill-market-sensitive-data通过（构建时注入一次性测试canary，不使用生产密钥）。
- 最终独立审查及修正后复审：无遗留Critical/Major/Minor。人工验收与远端集成尚待用户后续决定。

后端配套：codex/ui-shared-mcp-catalog @5ae07e8（实现提交f0155a9）。
- 基线e425ed1；仅删除provider的label=1场景过滤，其他执行安全条件保留。
- 27项能力目录/Turn +18项provider/安全测试通过；API ts-check通过。
- 使用一次性隔离Postgres，测试结束已移除容器；既有业务DB及服务器未改。

前端分支：codex/ui-polish-shared-resources。
前端worktree：C:/Users/24219/.codex/worktrees/cloud-frontend-refresh/agent-hub-web。
后端worktree：C:/Users/24219/.codex/worktrees/cloud-backend-refresh/projects_new。
本轮仅本地提交；未push、未创建PR、未merge、未重新部署线上镜像。线上仍为上一版。
