# Agent Hub Web Instructions

## Authority

- Binding design: `docs/superpowers/specs/2026-10-27-agent-hub-web-design.md`.
- Active plan: `docs/superpowers/plans/2026-10-27-agent-hub-web-v1.md`.
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
