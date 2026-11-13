# Daily Capability Selection Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用后端真实 capability catalog 替换 Daily 静态选项，把每轮 KB/Skill/MCP Server 选择纳入 canonical Turn、unknown retry 与历史回放。

**Architecture:** `AuthProvider` 仍是唯一身份源。前端固定后端生成的 `conversation.v1`，从 `/agent-api/api/conversation-capabilities?scenarioId=daily` 读取分区目录。发送时深复制选择到 pending Turn；重试复用原快照；历史 chips 只读后端持久投影。MCP 在后端 provider/client/registry 完成前保持禁用。

**Tech Stack:** Next.js 16、React 19、TypeScript 5.9、Zod 4、Vitest/Testing Library、Playwright、pnpm。

**Spec:** Backend canonical design: `DSI/docs/plans/2026-11-13-daily-capability-selection-design.md`; master implementation plan: `DSI/docs/plans/2026-11-13-daily-capability-selection.md`.

## Work Record

- GitHub Issue: None
- Plan owner: Agent Hub / DSI team
- Approval mode: `approval-per-task`
- Base: `origin/main@db7f51fe60c8049964743286e63095eea4d00c37`
- Branch/worktree: `codex/daily-capability-selection` / `S:\Projects\agent-hub-worktrees\daily-capability-selection`
- Backend dependency: `codex/daily-capability-selection` from `e866c263d5b84a51544c0e5772f941ed43febf51`

## Global Constraints

- This repo remains frontend-only. Backend contract/runtime changes belong in the DSI worktree.
- Do not expose Agent Loop as a selector. It is the permanent base runtime.
- Do not claim an option is usable unless the catalog marks its section/item available.
- One global `AuthProvider`; no frontend token store. 401 invalidates; 403 remains local.
- Daily only. Work/Xiaozhi preconfigured behavior, GIS, Workflow, `/mcp` management, KB UI, Skill Market UI, and legacy `/tasks` stay unchanged.
- New Daily sends always include `{knowledgeBaseIds, skillIds, mcpServerIds}`. All arrays may be empty.
- Every Task uses TDD, focused regression, typecheck/lint, diff review, and a coherent commit. Pause after each Task.
- Push/PR/merge require separate approval.

## Baseline Gate

- [x] Worktree created at requested SHA.
- [x] Locked dependencies installed.
- [x] Daily focused tests: 76/76.
- [x] Typecheck: PASS.

## Task 1 — Pin backend contract and add catalog client

Corresponds to master Plan Task 7.

**Files:**

- Update only from backend artifact: `src/features/chat/conversation/contracts/schema/conversation.v1.json`
- Update: `src/features/chat/conversation/contracts/schema/conversation.v1.lock.json`
- Regenerate: `src/features/chat/conversation/contracts/generated/*`
- Modify: `src/features/chat/transports/daily-session-contract.ts`
- Modify: `src/features/chat/transports/daily-session-contract.test.ts`
- Modify: `src/features/chat/transports/daily-session-client.ts`
- Modify: `src/features/chat/transports/daily-session-client.test.ts`
- Create: `src/features/chat/capabilities/contracts.ts`
- Create: `src/features/chat/capabilities/daily-capability-client.ts`
- Create: `src/features/chat/capabilities/daily-capability-client.test.ts`

- [ ] Write red tests for Turn selection encode, required nullable historical snapshot decode, partial catalog status, abort, 401/403, and malformed/secret-bearing response rejection.
- [ ] Pin the exact backend commit/hash and regenerate clients; never hand-edit generated schemas.
- [ ] Implement same-origin `/agent-api` catalog client with existing cookie/error behavior.
- [ ] Run conversation schema verification/check, focused tests, KB/Skill client drift checks, and typecheck.
- [ ] Commit: `feat(chat): add daily capability contracts`

## Task 2 — Replace fixtures and make retry/history snapshot-safe

Corresponds to master Plan Task 8.

**Files:**

- Modify: `src/features/chat/contracts/chat.ts`
- Modify: `src/features/chat/reducer/chat-state.ts`
- Modify: `src/components/chat/capability-selector.tsx`
- Modify: `src/components/chat/composer.tsx`
- Modify: `src/components/chat/daily-session-view.tsx`
- Modify: `src/features/chat/session/daily-conversation-reducer.ts`
- Modify: `src/features/chat/session/use-daily-conversation.ts`
- Modify: `src/features/chat/session/daily-session-adapter.ts`
- Modify corresponding tests
- Add a narrow read-only capability-chip component only if `message-list.tsx` would otherwise mix concerns

- [ ] Rename `mcpIds` to `mcpServerIds` repo-wide with compile-time coverage.
- [ ] Test catalog loading, KB/Skill multi-select, per-section unavailable/disabled UI, and absence of an Agent Loop option.
- [ ] Test send-time deep snapshot; UI changes after send do not mutate pending.
- [ ] Test unknown retry reuses original `clientRequestId`, input, and selection.
- [ ] Test history uses server snapshot, assistant/legacy `null`, and missing catalog entries fall back to safe IDs.
- [ ] Delete static Daily fixtures; keep Work behavior unchanged.
- [ ] Keep MCP disabled until backend reports `available` after master Tasks 10–12.
- [ ] Run all chat/session/component tests, generated checks, typecheck, lint.
- [ ] Commit: `feat(chat): enable daily kb and skill selection`

## Task 3 — Phase A cross-page E2E

Corresponds to master Plan Task 9.

**Files:**

- Modify: `e2e/fixtures/canonical-conversation-backend.mjs`
- Add/modify: Daily capability Playwright spec under `e2e/`
- Create: `docs/session/2026-11-13-daily-capability-selection-acceptance.md`

- [ ] Cover login, real catalog, select/send/final/history, unknown retry dedupe, next-Turn selection change, explicit empty lists, partial outage, 401 and 403.
- [ ] Confirm Work/GIS/KB/Skill Market/MCP management routes have no UI regression.
- [ ] Run `pnpm test`, Daily Playwright, typecheck, lint, build, and generated contract checks.
- [ ] Record exact backend/frontend SHA and contract hash.
- [ ] Commit: `test(e2e): cover daily capability selection`

## Task 4 — Enable MCP only after backend Phase B

Corresponds to master Plan Task 13.

- [ ] Pin the backend artifact where `mcpServers.status=available` has real provider support.
- [ ] Test and enable MCP Server multi-select only for available status.
- [ ] Submit server IDs only; no URL/schema/credential leaves the trusted backend boundary.
- [ ] Preserve the same pending/retry/history rules.
- [ ] Commit: `feat(chat): enable daily mcp selection`

## Task 5 — Final MCP/security E2E

Corresponds to master Plan Task 14.

- [ ] Selected read-only MCP succeeds; non-selected/mutating tools cannot execute.
- [ ] Timeout/outage is safe and does not disable KB/Skill.
- [ ] UI/SSE/history contain no credentials or raw tool payloads.
- [ ] Run full release gate and update acceptance evidence.
- [ ] Commit: `test(e2e): verify daily mcp selection`

## Acceptance Criteria

- [ ] Daily options come from the authenticated catalog, not fixtures.
- [ ] Send, unknown retry, and history preserve one immutable snapshot.
- [ ] Explicit empty selection is sent and shown truthfully.
- [ ] MCP remains disabled until the real runtime contract is available.
- [ ] No second auth state, no browser credential, no non-Daily regression.

## Review Focus

- Contract pinning and generated-code drift.
- Pending snapshot aliasing/mutation bugs.
- 401/403 and identity-generation cleanup.
- Partial catalog failure and stale-item behavior.
- Work/GIS/MCP management scope leakage.
