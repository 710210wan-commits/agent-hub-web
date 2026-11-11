# Agent Hub Web Instructions

## Authority

- Base V1 design: `docs/superpowers/specs/2026-10-27-agent-hub-web-design.md`.
- Base V1 plan: `docs/superpowers/plans/2026-10-27-agent-hub-web-v1.md`.
- Binding Skill extension design: `docs/skill-market/2026-10-27-agent-hub-web-design.md`.
- Active daily Skill extension plan: `D:\0 ysq文件\DSI-agent-loop\docs\plans\2026-11-05-skill-market-frontend-migration.md`.
- Active Work Skill extension plan: `docs/skill-market/2026-11-11-work-skill-frontend-implementation.md`.
- For the Skill module, the approved Skill extension design and mode-specific plans supersede the base V1 placeholder-only resource scope where they explicitly differ.
- The daily plan governs `mode=daily`; the Work plan governs `mode=work` and supersedes the earlier Work placeholder-only constraint. Neither plan widens the other mode's backend, cache, or UI scope.
- Report conflicts instead of silently widening scope.

## Development

- Use pnpm only.
- Keep TypeScript strict.
- Follow TDD for behavior changes: failing test first, then minimal implementation.
- Run focused tests plus the full suite before claiming completion.
- Keep route files thin; reusable behavior belongs in components, providers, config, or features.

## Product Boundaries

- Frontend only; do not modify `S:\Projects\projects_new`.
- No Workflow, map engine, real auth, i18n runtime, Redux, or AI SDK in V1.
- Never expose AgentLoop as a selectable capability.
- Never fall back to mock answers in production.
- Never claim backend support for capabilities, upload, resume, or token deltas that it does not provide.
