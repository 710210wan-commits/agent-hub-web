export interface SkillMarketSource {
  path: string;
  source: string;
}

export interface SkillMarketIndependenceViolation {
  path: string;
  rule: string;
}

const RULES = [
  { pattern: /(?:^|["'`])\/api\/skills(?:[/?"'`]|$)/m, rule: "legacy /api/skills dependency" },
  { pattern: /loadProjectSkillCatalog|skillCatalog\.server/m, rule: "legacy filesystem catalog dependency" },
  { pattern: /DSI-agent-loop|projects_new/m, rule: "backend or legacy repository source dependency" },
  { pattern: /NEXT_PUBLIC_LEGACY_FRONTEND_URL/m, rule: "legacy frontend runtime dependency" },
] as const;

export function findSkillMarketIndependenceViolations(
  sources: readonly SkillMarketSource[],
): SkillMarketIndependenceViolation[] {
  return sources.flatMap(({ path, source }) => RULES
    .filter(({ pattern }) => pattern.test(source))
    .map(({ rule }) => ({ path, rule })));
}
