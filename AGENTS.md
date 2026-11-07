# Agent Hub Web Instructions

## Authority

- Base V1 design: `docs/superpowers/specs/2026-10-27-agent-hub-web-design.md`.
- Base V1 plan: `docs/superpowers/plans/2026-10-27-agent-hub-web-v1.md`.
- Binding Skill extension design: `docs/skill-market/2026-10-27-agent-hub-web-design.md`.
- Active Skill extension plan: `D:\0 ysq文件\DSI-agent-loop\docs\plans\2026-11-05-skill-market-frontend-migration.md`.
- For the Skill module, the approved Skill extension design and plan supersede the base V1 placeholder-only resource scope where they explicitly differ.
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
