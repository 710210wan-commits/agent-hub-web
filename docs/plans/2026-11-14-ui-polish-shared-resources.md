# UI 修复与共享资源入口实施计划

> **For agentic workers:** Use superpowers:executing-plans task-by-task; checked steps record actual verification.

**Goal:** 按用户确认顺序完成 1/4/6，再完成 2/3/5；MCP 服务部署及真实模型设置另行处理。
**Architecture:** 保留全局 AuthProvider；只修复登录初值、外壳滚动和展示文案。URL 使用 mode=1/2，内部 AppMode 和后端 scenarioId 仍为 daily/work。现有 Daily 与 Xiaozhi 软删除接口复用，资源页面共用入口不合并 Skill 后端。
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
- [ ] 将旧“预填”断言改为初次与失败后空初值/显式输入登录行为，先运行确认旧实现失败。
- [ ] username/password 初值改为空，删除默认凭据注释；保留 autocomplete。
- [ ] 执行 auth 聚焦测试；检查依赖默认值的测试显式填入测试凭据；自审、提交。

### Task 2 — 修复外壳滚动（项 4）
Files: src/app/globals.css; e2e/shell-layout.spec.ts (new).
- [ ] 浏览器测试构造长内容，在 1440x900 / 1280x720 断言用户栏始终在视口，app-content 滚动可到底；先观察失败。
- [ ] 外壳明确限制视口高度，业务区独立滚动；侧栏用户区不随业务内容增长，移动菜单可滚动。
- [ ] 运行浏览器聚焦回归；自审、提交。

### Task 3 — 决策/工作显示名（项 6）
Files: src/config/copy.ts; mode-related visible strings in src; corresponding assertions in tests.
- [ ] 确认切换控件与历史等用户可见文案应为“决策/工作”；保留内部 daily/work 和来源标识。
- [ ] 实施集中 copy 与散落场景提示的对应修改；更新因明确文案变更而受影响的断言。
- [ ] 模式切换、历史与登录聚焦测试；自审、提交。

### Task 4 — 历史软删除（项 2）
Files: src/features/chat/transports/daily-session-client.ts; src/features/chat/session/daily-session-store.ts; src/components/chat/daily-session-history.tsx; src/features/chat/contracts/session.ts; src/features/chat/transports/xiaozhi-transport.ts; src/server/xiaozhi/proxy.ts; src/app/history/history-page-client.tsx; corresponding tests.
Interfaces: DailySessionClient.deleteConversation(id, signal?): Promise<void>; ChatSessionTransport.deleteSession(id, signal?): Promise<void>.
- [ ] RED: 按 ID 删除及 204；失败不移除；401 与身份 generation 防串；Work BFF 只允许精确 DELETE /api/chat/thread/:id。
- [ ] 增加请求与状态管理、确认 UI、busy/error；复用原生 DELETE /conversations/:id 与 Xiaozhi DELETE /api/chat/thread/:id，不改后端或数据库。
- [ ] 聚焦 Vitest / history E2E；自审、提交。

### Task 5 — URL 数字映射（项 3）
Files: src/config/modes.ts; src/providers/mode-provider.tsx; navigation/session/skill URL builders and affected route parsers/tests.
Interfaces: parseMode accepts 1/2 and legacy daily/work; serializeMode(AppMode): '1'|'2'; withMode emits numeric mode only.
- [ ] RED: parseMode('1')='daily'; parseMode('2')='work'; legacy accepted; emitted URLs mode=1/2; preserve other params and hash。
- [ ] 更新所有前端 URL 生成及入口解析；内部类型、API/BFF 后端值保持 daily/work；sessionStorage 旧 route 兼容。
- [ ] 测试旧链接、深链接、切换后端、刷新与历史跳转；自审、提交。

### Task 6 — 知识库/MCP 共享管理（项 5）
Files: shared shell header/nav; KB routes; src/components/mcp; MCP catalog filtering backend only if required, in separate backend branch.
- [ ] RED: KB/MCP 无模式开关；共享资源列表不随对话模式隐藏；Skill 仍按 daily/work 分流。
- [ ] KB 继续走同一 Xiaozhi 桥接；共享路由保留导航上下文但不按模式筛资源。MCP 去场景标签过滤/默认语义；已有标签若保留，只作为分类。
- [ ] 检查原生 MCP provider 标签 1 限制，与共享目录对齐；保持 enabled/health/read-only/显式选择约束。若需要改变现有鉴权设计或工作 Loop 接入，停止该扩展并记录到未来 MCP 计划。
- [ ] 前后端聚焦契约/目录测试；MCP 无真实服务时只验诚实不可用，不假造真实通过；自审、提交。

### Task 7 — 集成验收与交付
- [ ] pnpm test; pnpm lint; pnpm typecheck; required schema/client checks; pnpm build。
- [ ] 已有 mocked fixture E2E + 新布局/删除/数字 URL/共享入口用例；所有测试显式准备登录，不依赖默认账号。
- [ ] 全分支独立 AI review，修复 Major/Critical，自审差异；更新证据与提交记录。
- [ ] 交付本地分支/提交和未验范围；不 push 或部署。

## Execution Ledger

- 2026-11-14: 读取最新 main，SHA 未变；线上只读复现密码预填和用户栏离屏。复用 clean native frontend worktree，新建 codex/ui-polish-shared-resources；准备 pnpm 依赖及基线验证。
