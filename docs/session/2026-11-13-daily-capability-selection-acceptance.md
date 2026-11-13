# Daily capability selection — Phase A acceptance

Date: 2026-11-13. Both repositories use `codex/daily-capability-selection`.

| Artifact | Verified revision |
| --- | --- |
| Frontend implementation and browser acceptance | `f87e7c9d10c2fceab11a0dd8e16a9d7ed5753be8` |
| Backend runtime and legacy-event fix | `67b649f4b136b624a73469d1b0aca5752410bf43` |
| Pinned contract source | DSI `5ab29df6afd9e811321c639437b2672472f43996` |
| Contract | `conversation.v1@0.1.4`, 19 operations |
| Contract SHA-256 | `e773f1f9824d9af837a236234b235083a1d1cf02f2570057b843c181265799b0` |

Backend Task 9 changes only event projection compatibility and tests/docs; contract bytes remain identical to the pinned source.

## Acceptance coverage

`pnpm run test:e2e:daily-session`: **14/14 Chromium tests passed**, including six capability cases and eight existing session/auth cases.

| Requirement | Evidence |
| --- | --- |
| Login → catalog → KB+Skill selection → activity → final → history | Browser scenario checks named activity, hidden internal tool names, final answer, refresh/history navigation and read-only persisted-ID chips |
| Changing selection affects only next Turn | Browser records both submitted bodies; first snapshot unchanged, second uses updated KB selection |
| Unknown acceptance result | One scenario returns 503 after commit; another forwards the real HTTP request then drops its response. Retry uses identical input/key/selection; fixture records one Turn |
| Explicit empty selection | Browser sends all three empty arrays; actual backend registry tests verify KB/Skill tools are absent and no scope fallback occurs |
| Resource revoked after accept | Browser verifies safe failed state without fabricated assistant text; real DB/runtime tests verify `CAPABILITY_UNAVAILABLE` before model invocation |
| Catalog 401 / 403 / partial failure | Browser verifies global logout, local permission error, and KB available while Skill unavailable |
| Cancel, reconnect, switch identity, demo | Existing browser cases remain green; demo sends no protected request |
| Pre-upgrade history | Actual DB regression removes snapshot fields from stored old message events; legacy-null Turns replay, malformed selected events remain rejected |

## Release gates

- Frontend unit/component suite: **92 files, 778/778** using `pnpm exec vitest run --maxWorkers=4`.
- `pnpm run typecheck`, `lint`, `verify:conversation-schema`, `check:conversation-client`, `check:kb-client`, `check:skill-market-client`: passed.
- `pnpm run build`: passed with the explicit build-only configuration below.
- Backend shared build; unified auth; all conversation suites including migration, OpenAPI drift, concurrency, lifecycle and actual process-crash recovery; KB unit (22/22); Skill catalog/Daily runtime; API typecheck/lint/build: passed. Capability catalog/integration subset: **14/14**.
- Backend lint retains 21 existing warnings, 0 errors. Diff whitespace checks passed.
- Fresh-context branch review found one Major legacy-event replay issue; fixed in backend `67b649f`, regression tested and re-reviewed closed. No remaining confirmed Major/Critical finding. Human/team review is pending.

Initial parallel full-suite execution hit a timeout in existing `use-kb-auth-bridge.test.tsx`; isolated 5/5 and the complete bounded-worker run passed without changing that test or excluding any file. Initial production build stopped on missing required deployment config; supplied explicit test-only values, then build passed.

## Reproduction environment

| Layer | Configuration |
| --- | --- |
| Browser server | Next dev `127.0.0.1:3103`; Chrome, 1440×900; fixture `127.0.0.1:3203`; automatically started/stopped by Playwright |
| Frontend transport | `NEXT_PUBLIC_CHAT_TRANSPORT=projects-new`, `NEXT_PUBLIC_AGENT_API_BASE=/agent-api`, `AGENT_API_ORIGIN=http://127.0.0.1:3203` |
| Browser auth/model/services | Controlled cookie-auth HTTP/SSE fixture; test-only users, deterministic events; no real Xiaozhi credentials |
| Backend DB | Disposable local PostgreSQL `dsi_session_test`, isolated per-test schemas; supply `SESSION_TEST_DATABASE_URL` locally |
| Backend external providers | Controlled model/KB/Skill sources; actual scheduler/executor/Loop/registry/DB/event projection |
| Build | Real transport; `NEXT_PUBLIC_LEGACY_FRONTEND_URL=http://127.0.0.1:5000`; API origin as above; `SKILL_MARKET_DAILY_ORIGIN=http://127.0.0.1:3999`; test-only HMAC secret ≥32 chars; `SKILL_MARKET_PRINCIPAL_ID=task9-build`, roles `admin` |

Run browser acceptance with `pnpm run test:e2e:daily-session`. The config pins the test-only fixture ports and gateway values. Backend commands are recorded in `docs/plans/2026-11-13-daily-capability-selection-backend-acceptance.md` in DSI. Never point the destructive test DB fixture at a production DB.

No new deployment environment variable was introduced by Task 9, so README/env examples need no new setting. Real deployment must substitute its actual origins and server-only credentials.

## Scope and remaining validation

This is browser contract acceptance plus real PostgreSQL/runtime integration acceptance, not a single browser session against a live deployed DSI/Xiaozhi/LLM/RAG stack. External RAG was declared unavailable; live-provider quality/availability and cloud deployment are not claimed here. Work/GIS/Workflow and the general Skill Market release suite are outside this Phase A acceptance matrix. MCP stays disabled pending Tasks 10–13.

Task 9 also fixes a discovered UI defect: unknown network/503 acceptance results now set a safe notice so the original-request retry button is visible. No automatic rerun or new request key is generated.

## Task 13 follow-up: conditional MCP selection

This follows the historical Phase A results above. MCP is now selectable in Daily only when the authenticated backend catalog returns an available, nonempty MCP section. Unavailable, disabled and empty sections stay disabled with stable status text. Work remains server-preconfigured. There are no new frontend environment variables or token stores.

- Backend source: DSI `8624c4f79307e8d0ee63bb512a391f9a8a2dde05` (Task 12).
- Pinned artifact: `conversation.v1@0.1.5`, 19 operations, SHA-256 `67b3aa7ec3d3871fee2a4f7ac8af169344e4e1af6cda3513efb6b6d7b244c81d`.
- Contract/client: copied committed backend bytes, updated lock and regenerated; new `MCP_CATALOG_UNAVAILABLE` is accepted without losing KB/Skill sections. MCP config, schemas and secret fields remain rejected by strict DTO validation.
- Component/controller coverage: multi-select/deselect, exact IDs-only Turn payload, unknown-result retry preserving the original request/key/MCP snapshot after later selection edits, immutable copied MCP arrays, and read-only historical ID chips after catalog removal.
- Verification: focused 65/65; full suite 93 files, 790/790 tests; existing Daily/session browser regression 14/14; conversation schema/client and KB/Skill generated checks, typecheck, lint and production build passed. Build uses the same test-only configuration recorded above.
- Self-review and independent incremental AI review found no remaining Major/Critical. Human/team review pending.

These browser regressions cover the existing Phase A scenarios; MCP-specific browser execution/security E2E remains Task 14. Backend Task 12 separately verified the configured loopback HTTP provider through a real PostgreSQL Turn and Loop. A browser session against a live deployed MCP/LLM stack is not claimed here.
