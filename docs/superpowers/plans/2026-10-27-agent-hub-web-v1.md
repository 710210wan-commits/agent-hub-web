# Agent Hub Web V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, desktop-first Chinese frontend shell for the intelligent-agent platform, with GPT-style chat, mode-aware navigation, replaceable capability pages, deterministic mock streaming, and a truthful adapter to the current `projects_new` task API/SSE.

**Architecture:** Next.js App Router owns routing and the shared shell. A small React context/reducer owns mode and chat UI state. Chat UI depends only on a `ChatTransport` interface; deterministic mock and current `projects_new` implementations feed one normalized event reducer. Resource, GIS, history, and settings pages expose minimal replaceable slots rather than business implementations.

**Tech Stack:** Next.js 16.1.1, React 19.2.3, TypeScript 5, Tailwind CSS 4, shadcn/Radix primitives, Lucide, react-markdown, remark-gfm, pnpm 9, Vitest, Testing Library, Playwright, Node.js 20.

**Spec:** `docs/superpowers/specs/2026-10-27-agent-hub-web-design.md`

## Global Constraints

- Repository: `S:\Projects\agent-hub-web`, local Git only, branch `main`, no remote.
- V1 modifies no file under `S:\Projects\projects_new`.
- UI language is Simplified Chinese; user-visible copy is centralized.
- Default theme is light; no dark-mode implementation or acceptance requirement.
- AgentLoop is implicit and never shown as a selectable capability.
- Workflow is excluded.
- Production must reject mock transport; no automatic mock fallback.
- Real transport must not claim Knowledge Base, Skill, MCP, attachment, resume, or token-delta support that the backend does not provide.
- Do not use localStorage for chat history.
- No map engine, auth provider implementation, i18n runtime, Redux, or AI SDK dependency.
- Primary visual acceptance width is 1280px and wider.

## Review Focus

- Invalid/missing `mode` query values must resolve to `daily` without a redirect loop; Task 2 tests this.
- Production configured with mock transport must fail closed before rendering fake answers; Task 1 tests this.
- Real transport with any selected Knowledge Base/Skill/MCP must block before the POST request; Task 4 tests this.
- SSE disconnect must close local state, attempt best-effort abort, and never report guaranteed server termination; Task 4 tests this.
- Partial Markdown and rapid deltas must not crash rendering or update more often than the batching contract; Task 5 tests this.

---

## File Structure

```text
agent-hub-web/
  docs/superpowers/specs/
  docs/superpowers/plans/
  public/
  src/
    app/
      chat/page.tsx
      history/page.tsx
      gis/page.tsx
      knowledge/page.tsx
      knowledge/[id]/page.tsx
      skills/page.tsx
      skills/[id]/page.tsx
      mcp/page.tsx
      mcp/[id]/page.tsx
      settings/page.tsx
      globals.css
      layout.tsx
      page.tsx
    components/
      chat/
      resources/
      shell/
      states/
      ui/
    config/
      copy.ts
      env.ts
      modes.ts
      navigation.ts
    features/chat/
      contracts/
      fixtures/
      reducer/
      transports/
    providers/
      auth-provider.tsx
      mode-provider.tsx
    test/
  e2e/
  Dockerfile
  next.config.ts
  package.json
  playwright.config.ts
  vitest.config.ts
```

`src/app` owns routes only. Reusable behavior lives in components, providers, config, and features. `features/chat/contracts` is the only boundary imported by page-level chat UI; transport-specific payloads stay inside their adapters.

---

### Task 1: Repository Foundation and Fail-Closed Environment Config

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `pnpm-lock.yaml` via install
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `components.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/config/env.ts`
- Test: `src/config/env.test.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `AGENTS.md`

**Interfaces:**
- Produces: `resolvePublicRuntimeConfig(env: NodeJS.ProcessEnv): PublicRuntimeConfig`
- Produces: `PublicRuntimeConfig = { transport: 'mock' | 'projects-new'; apiBaseUrl: string }`
- Consumes: approved core version pins from the spec.

- [ ] **Step 1: Write failing environment tests**

Test names and assertions:

```ts
it('defaults development to mock')
it('accepts projects-new with a same-origin base URL')
it('rejects mock when NODE_ENV is production')
it('rejects an absolute cross-origin browser API URL')
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm vitest run src/config/env.test.ts`  
Expected: FAIL because `resolvePublicRuntimeConfig` does not exist.

- [ ] **Step 3: Create the minimal Next.js project and install dependencies**

Pin `next@16.1.1`, `react@19.2.3`, `react-dom@19.2.3`, `pnpm@9.0.0` in `package.json`. Add TypeScript, Tailwind 4, ESLint, shadcn/Radix primitives used by this plan, Lucide, `react-markdown`, `remark-gfm`, Vitest, Testing Library, jsdom, Playwright, and Zod. Use App Router, `src/`, strict TypeScript, alias `@/*`, and scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `test:e2e`.

- [ ] **Step 4: Implement fail-closed config**

Implement `resolvePublicRuntimeConfig`. Development defaults to `mock`; production rejects `mock`; browser API paths must be same-origin path prefixes. `.env.example` documents `NEXT_PUBLIC_CHAT_TRANSPORT` and `NEXT_PUBLIC_AGENT_API_BASE`.

- [ ] **Step 5: Run foundation checks**

Run: `pnpm vitest run src/config/env.test.ts`  
Expected: PASS.

Run: `pnpm typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: scaffold agent hub web"
```

---

### Task 2: Shared Shell, Query Mode, Navigation, and Theme Tokens

**Files:**
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/config/copy.ts`
- Create: `src/config/modes.ts`
- Create: `src/config/navigation.ts`
- Create: `src/providers/mode-provider.tsx`
- Create: `src/providers/auth-provider.tsx`
- Create: `src/components/shell/app-shell.tsx`
- Create: `src/components/shell/sidebar.tsx`
- Create: `src/components/shell/topbar.tsx`
- Create: `src/components/shell/mode-switch.tsx`
- Create: `src/components/shell/mobile-sidebar.tsx`
- Test: `src/config/modes.test.ts`
- Test: `src/components/shell/app-shell.test.tsx`

**Interfaces:**
- Produces: `parseMode(value: string | null): AppMode`
- Produces: `withMode(pathname: string, mode: AppMode): string`
- Produces: `useAppMode(): { mode: AppMode; setMode(mode: AppMode): void }`
- Produces: `AppShell({ children, title })`

- [ ] **Step 1: Write failing mode and shell tests**

Assert `daily`, `work`, missing, and illegal query values; assert all navigation URLs preserve current mode; assert switching mode replaces only the `mode` query; assert brand text is `智能体平台` and no `AgentLoop` or `Workflow` label is rendered.

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm vitest run src/config/modes.test.ts src/components/shell/app-shell.test.tsx`  
Expected: FAIL because mode helpers and shell do not exist.

- [ ] **Step 3: Implement mode config and providers**

`parseMode` returns `daily` unless value is exactly `work`. `ModeProvider` derives query state with `useSearchParams`; `setMode` preserves pathname and unrelated query keys. `AuthProvider` supplies one demo profile and header-injection placeholder only.

- [ ] **Step 4: Implement the shared light shell**

Sidebar order: New Chat, History, GIS Workspace, Knowledge Base, Skill, MCP, Settings. Add desktop layout, 768–1279px collapsible behavior, CSS design tokens, top-centered Daily/Work switch, current-user slot, and focus-visible states.

- [ ] **Step 5: Verify shell**

Run: `pnpm vitest run src/config/modes.test.ts src/components/shell/app-shell.test.tsx`  
Expected: PASS.

Run: `pnpm lint && pnpm typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: add shared mode-aware app shell"
```

---

### Task 3: Normalized Chat Contracts and Reducer

**Files:**
- Create: `src/features/chat/contracts/chat.ts`
- Create: `src/features/chat/contracts/events.ts`
- Create: `src/features/chat/contracts/transport.ts`
- Create: `src/features/chat/reducer/chat-state.ts`
- Create: `src/features/chat/reducer/chat-reducer.ts`
- Test: `src/features/chat/reducer/chat-reducer.test.ts`

**Interfaces:**
- Produces: `ChatSelectionSnapshot = { knowledgeBaseIds: string[]; skillIds: string[]; mcpIds: string[] }`
- Produces: `ChatRunState = 'idle' | 'submitting' | 'working' | 'streaming' | 'stopped' | 'completed' | 'disconnected' | 'failed'`
- Produces: normalized `ChatStreamEvent` union with `run.connected`, `activity.update`, `answer.delta`, `answer.done`, `run.stopped`, `run.disconnected`, `run.failed`.
- Produces: `chatReducer(state: ChatState, action: ChatAction): ChatState`
- Produces: `ChatTransport` with `createRun`, `streamRun`, and `abortRun` methods.

- [ ] **Step 1: Write failing reducer tests**

Cover initial send with a per-message selection snapshot, working activity replacement, ordered delta append, answer completion, stop preserving partial content, disconnect warning, retry reset, and one message not mutating prior selection snapshots.

- [ ] **Step 2: Run reducer tests and verify failure**

Run: `pnpm vitest run src/features/chat/reducer/chat-reducer.test.ts`  
Expected: FAIL because contracts/reducer do not exist.

- [ ] **Step 3: Implement transport-neutral types**

Keep raw `projects_new` payloads out of these types. Use stable string IDs. Store the full selection snapshot on each user message. Do not store chain-of-thought fields.

- [ ] **Step 4: Implement pure reducer**

Reducer owns state transitions and message content only. I/O, timers, Markdown rendering, and EventSource stay outside it.

- [ ] **Step 5: Verify reducer**

Run: `pnpm vitest run src/features/chat/reducer/chat-reducer.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/chat
git commit -m "feat: define chat stream state machine"
```

---

### Task 4: Mock and Projects-New Transports

**Files:**
- Create: `src/features/chat/fixtures/default-run.ts`
- Create: `src/features/chat/transports/mock-transport.ts`
- Create: `src/features/chat/transports/projects-new-contract.ts`
- Create: `src/features/chat/transports/projects-new-transport.ts`
- Create: `src/features/chat/transports/event-source-stream.ts`
- Create: `src/features/chat/transports/create-transport.ts`
- Test: `src/features/chat/transports/mock-transport.test.ts`
- Test: `src/features/chat/transports/projects-new-transport.test.ts`

**Interfaces:**
- Consumes: `ChatTransport`, `ChatStreamEvent`, `PublicRuntimeConfig`.
- Produces: `createChatTransport(config: PublicRuntimeConfig): ChatTransport`.
- Produces: deterministic mock fixture IDs and timing controls for tests.

- [ ] **Step 1: Write failing transport tests**

Mock assertions: deterministic event order; AbortSignal stops replay; fixture covers delta, stopped, disconnected, completed, failed.

Real assertions: empty selections POST to `/tasks`; any non-empty selector rejects before fetch; current SSE event types map to safe activity events and `loop_stop.finalAnswer` maps to one `answer.done`; abort POST is attempted; EventSource error emits disconnected warning and best-effort abort; no raw chain-of-thought payload enters normalized events.

- [ ] **Step 2: Run transport tests and verify failure**

Run: `pnpm vitest run src/features/chat/transports`  
Expected: FAIL because transports do not exist.

- [ ] **Step 3: Implement deterministic mock transport**

Use async iteration plus abortable timers. Mock is the only adapter allowed to emit simulated `answer.delta` before backend protocol upgrade.

- [ ] **Step 4: Implement projects-new adapter**

Use `fetch` for create/abort and a wrapped EventSource for stream. Map only safe events needed by the UI. On disconnect, close EventSource, emit the exact warning from the spec, then attempt abort without claiming success.

- [ ] **Step 5: Implement transport selection**

`createChatTransport` consumes validated runtime config. No fallback branch from real to mock.

- [ ] **Step 6: Verify transports**

Run: `pnpm vitest run src/features/chat/transports`  
Expected: PASS.

Run: `pnpm typecheck`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/chat
git commit -m "feat: add mock and projects-new chat transports"
```

---

### Task 5: GPT-Style Chat Page and Capability Selectors

**Files:**
- Create: `src/app/chat/page.tsx`
- Create: `src/components/chat/chat-page.tsx`
- Create: `src/components/chat/chat-empty-state.tsx`
- Create: `src/components/chat/message-list.tsx`
- Create: `src/components/chat/message-content.tsx`
- Create: `src/components/chat/activity-line.tsx`
- Create: `src/components/chat/composer.tsx`
- Create: `src/components/chat/capability-selector.tsx`
- Create: `src/components/chat/run-actions.tsx`
- Create: `src/components/states/inline-error.tsx`
- Create: `src/features/chat/use-chat-controller.ts`
- Create: `src/features/chat/use-batched-deltas.ts`
- Test: `src/components/chat/chat-page.test.tsx`
- Test: `src/features/chat/use-batched-deltas.test.ts`

**Interfaces:**
- Consumes: `ChatTransport`, `chatReducer`, `useAppMode`.
- Produces: reusable `CapabilitySelector` with checkbox multi-select.
- Produces: `useChatController(transport)` for submit, abort, regenerate, and adapter event consumption.
- Produces: batched delta flush interval constrained to 40–80ms.

- [ ] **Step 1: Write failing UI/controller tests**

Assert minimal empty state, three mode-specific prompts, disabled attachment tooltip, three multi-select controls, selection inheritance without history mutation, real-mode blocking with selections, single safe activity line, collapsed completed-step summary after first delta, partial Markdown safety, stop behavior, real-mode hidden continue button, mock-mode continue button, and explicit disconnected warning.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm vitest run src/components/chat src/features/chat/use-batched-deltas.test.ts`  
Expected: FAIL because chat UI does not exist.

- [ ] **Step 3: Implement controller and batching hook**

Controller owns transport lifecycle with AbortController cleanup. `useBatchedDeltas` buffers incoming fragments and dispatches at a configured 60ms interval; flush immediately on done/stop/error.

- [ ] **Step 4: Implement minimal empty state and composer**

Central greeting, composer, three text prompt chips. Attachment stays disabled with `待接入`. Knowledge Base/Skill/MCP use one reusable checkbox popover pattern.

- [ ] **Step 5: Implement message and run states**

Use `react-markdown` + `remark-gfm`. Render only final user-visible content. Activity shimmer contains safe summary text. Preserve partial output on stop/disconnect. Real transport exposes regenerate only; mock may expose continue.

- [ ] **Step 6: Verify chat UI**

Run: `pnpm vitest run src/components/chat src/features/chat/use-batched-deltas.test.ts`  
Expected: PASS.

Run: `pnpm lint && pnpm typecheck`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/chat src/components/chat src/components/states src/features/chat
git commit -m "feat: build minimal streaming chat experience"
```

---

### Task 6: History, Resource Management, Detail Slots, and Settings

**Files:**
- Create: `src/app/history/page.tsx`
- Create: `src/app/knowledge/page.tsx`
- Create: `src/app/knowledge/[id]/page.tsx`
- Create: `src/app/skills/page.tsx`
- Create: `src/app/skills/[id]/page.tsx`
- Create: `src/app/mcp/page.tsx`
- Create: `src/app/mcp/[id]/page.tsx`
- Create: `src/app/settings/page.tsx`
- Create: `src/components/resources/resource-page-template.tsx`
- Create: `src/components/resources/resource-card.tsx`
- Create: `src/components/resources/resource-detail-slot.tsx`
- Create: `src/components/states/empty-state.tsx`
- Create: `src/components/states/error-state.tsx`
- Create: `src/components/states/loading-state.tsx`
- Create: `src/config/resource-fixtures.ts`
- Test: `src/components/resources/resource-page-template.test.tsx`
- Test: `src/app/settings/settings-page.test.tsx`

**Interfaces:**
- Produces: `ResourcePageTemplate<T>` with replaceable list renderer and loading/empty/error slots.
- Produces: detail-slot contract `{ backHref, title, children? }`.
- Consumes: current query mode from `AppShell`.

- [ ] **Step 1: Write failing route/template tests**

Assert history is mock-only and has no localStorage access; all three resource routes share the template; create buttons and detail pages explicitly say `待接入`; setting sections accept only model/evaluation/api and default to model; mode query survives navigation.

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm vitest run src/components/resources src/app/settings`  
Expected: FAIL because pages/templates do not exist.

- [ ] **Step 3: Implement history and resource template**

Use centralized fixtures. Search/filter may operate on fixture data only. New/create actions must not show a success state.

- [ ] **Step 4: Implement detail and settings slots**

Provide back navigation, title, placeholder copy, and extension container. Do not define resource edit fields or settings persistence.

- [ ] **Step 5: Verify routes/templates**

Run: `pnpm vitest run src/components/resources src/app/settings`  
Expected: PASS.

Run: `pnpm lint && pnpm typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/history src/app/knowledge src/app/skills src/app/mcp src/app/settings src/components/resources src/components/states src/config
git commit -m "feat: add replaceable capability page shells"
```

---

### Task 7: GIS Placeholder and Responsive Behavior

**Files:**
- Create: `src/app/gis/page.tsx`
- Create: `src/components/gis/gis-workspace-placeholder.tsx`
- Create: `src/components/gis/map-canvas-slot.tsx`
- Create: `src/components/gis/map-toolbar-slot.tsx`
- Create: `src/components/gis/layer-panel-slot.tsx`
- Create: `src/components/gis/map-status-slot.tsx`
- Test: `src/components/gis/gis-workspace-placeholder.test.tsx`

**Interfaces:**
- Produces: named visual slots only; no map-engine interface yet.
- Consumes: `AppShell`, mode query.

- [ ] **Step 1: Write failing GIS tests**

Assert desktop renders canvas, toolbar, layer panel, and status slots; small viewport renders a lightweight unavailable notice; bundle source imports no Cesium/MapLibre package.

- [ ] **Step 2: Run test and verify failure**

Run: `pnpm vitest run src/components/gis/gis-workspace-placeholder.test.tsx`  
Expected: FAIL because GIS shell does not exist.

- [ ] **Step 3: Implement lightweight GIS placeholder**

Use CSS background/grid only. No geographic data, canvas engine, or simulated map interactions.

- [ ] **Step 4: Verify GIS shell**

Run: `pnpm vitest run src/components/gis/gis-workspace-placeholder.test.tsx`  
Expected: PASS.

Run: `pnpm typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/gis src/components/gis
git commit -m "feat: add lightweight GIS workspace shell"
```

---

### Task 8: Same-Origin Proxy, Container, and Deployment Docs

**Files:**
- Modify: `next.config.ts`
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `deploy/nginx.example.conf`
- Create: `README.md`
- Test: `src/config/proxy.test.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_AGENT_API_BASE`, server-only `AGENT_API_ORIGIN`.
- Produces: development rewrite for `/agent-api/:path*`.
- Produces: Next.js standalone container on Node 20.

- [ ] **Step 1: Write failing proxy/config tests**

Assert public browser base is same-origin; rewrite destination is built only from server-side origin; production mock config fails. Keep config helpers pure and imported by `next.config.ts`.

- [ ] **Step 2: Run test and verify failure**

Run: `pnpm vitest run src/config/proxy.test.ts`  
Expected: FAIL because proxy config helper does not exist.

- [ ] **Step 3: Implement dev rewrite and standalone build**

Set `output: 'standalone'`. Rewrite `/agent-api/:path*` to `${AGENT_API_ORIGIN}/:path*`. Browser code never receives the origin.

- [ ] **Step 4: Add container and gateway example**

Multi-stage Dockerfile installs with frozen pnpm lockfile, builds, and runs standalone output as non-root on Node 20. Nginx example enables SSE pass-through and disables proxy buffering for the stream routes.

- [ ] **Step 5: Document local modes and cloud deployment**

README includes mock development, real-backend development, env table, Docker build/run, known real-backend limitations, no remote Git status, and future integration points.

- [ ] **Step 6: Verify deployment artifacts**

Run: `pnpm vitest run src/config/proxy.test.ts`  
Expected: PASS.

Run: `pnpm build`  
Expected: PASS and `.next/standalone` exists.

- [ ] **Step 7: Commit**

```bash
git add next.config.ts Dockerfile .dockerignore deploy README.md src/config
git commit -m "build: add standalone cloud deployment"
```

---

### Task 9: End-to-End Acceptance and Final Verification

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/navigation.spec.ts`
- Create: `e2e/chat-mock.spec.ts`
- Create: `e2e/responsive.spec.ts`
- Create: `e2e/real-transport-guard.spec.ts`
- Create: `e2e/screenshots/.gitkeep`

**Interfaces:**
- Consumes: all prior routes and the deterministic mock fixture.
- Produces: executable acceptance evidence for desktop and collapsed-sidebar behavior.

- [ ] **Step 1: Write E2E tests**

Cover every route, query mode preservation, minimal new-chat state, mock run through working/streaming/completed, stop preserving text, disconnected warning, selector snapshot/inheritance, disabled attachment, resource/detail/settings placeholders, GIS desktop/mobile behavior, and real-transport selection guard. Capture approved 1280px screenshots for chat empty, chat running, resource template, and GIS placeholder.

- [ ] **Step 2: Run E2E and fix only product defects**

Run: `pnpm exec playwright install chromium` once.  
Run: `pnpm test:e2e`  
Expected: PASS.

- [ ] **Step 3: Run complete verification**

Run: `pnpm lint`  
Expected: PASS.

Run: `pnpm typecheck`  
Expected: PASS.

Run: `pnpm test`  
Expected: PASS.

Run: `pnpm test:e2e`  
Expected: PASS.

Run: `pnpm build`  
Expected: PASS.

- [ ] **Step 4: Review scope and repository state**

Confirm: no `projects_new` changes; no remote; no secrets; no localStorage session persistence; no map engine/AI SDK/Redux/i18n runtime; no mock fallback in production; design and README match implementation.

- [ ] **Step 5: Commit**

```bash
git add e2e playwright.config.ts
git commit -m "test: verify frontend shell journeys"
```

---

## Self-Review Result

- Spec coverage: all V1 goals, non-goals, reviewer resolutions, deployment, and acceptance criteria map to tasks.
- Step scan: each implementation step has one checkable result; bodies are intentionally left to implementers except fixed contracts.
- Type consistency: mode, selection snapshot, normalized events, transport, and runtime config names are stable across tasks.
- Review focus: all five identified failure classes have named tests in their owning tasks.
- Proportion: plan is longer than the concise spec because it defines a new repository, but avoids component implementation transcripts.
