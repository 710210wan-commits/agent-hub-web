export interface SkillMarketSource {
  path: string;
  source: string;
}

export interface SkillMarketIndependenceViolation {
  path: string;
  rule: string;
}

const LEGACY_SKILLS_API_PATTERN = /(?:^|["'`])\/api\/skills(?:[/?"'`]|$)/m;
const WORK_CONTRACT_PATH_PATTERN = /^src[\\/]features[\\/]skills[\\/]work[\\/]contracts(?:\.test)?\.ts$/;
const APPROVED_WORK_SKILLS_API_PATTERNS = [
  /\/api\/skills\/import\/prepare/g,
  /\/api\/skills\/remote\/(?:list|prepare|search)/g,
  /\/api\/skills\/install-drafts\//g,
] as const;

const RULES = [
  { pattern: /loadProjectSkillCatalog|skillCatalog\.server/m, rule: "legacy filesystem catalog dependency" },
  { pattern: /DSI-agent-loop|projects_new/m, rule: "backend or legacy repository source dependency" },
  { pattern: /NEXT_PUBLIC_LEGACY_FRONTEND_URL/m, rule: "legacy frontend runtime dependency" },
] as const;

function hasLegacySkillsApiDependency(path: string, source: string): boolean {
  const candidate = WORK_CONTRACT_PATH_PATTERN.test(path)
    ? APPROVED_WORK_SKILLS_API_PATTERNS.reduce(
        (masked, pattern) => masked.replace(pattern, "/approved-work-skills-path"),
        source,
      )
    : source;
  return LEGACY_SKILLS_API_PATTERN.test(candidate);
}

export function findSkillMarketIndependenceViolations(
  sources: readonly SkillMarketSource[],
): SkillMarketIndependenceViolation[] {
  return sources.flatMap(({ path, source }) => [
    ...(hasLegacySkillsApiDependency(path, source)
      ? [{ path, rule: "legacy /api/skills dependency" }]
      : []),
    ...RULES
      .filter(({ pattern }) => pattern.test(source))
      .map(({ rule }) => ({ path, rule })),
  ]);
}
