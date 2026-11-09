import { describe, expect, it } from "vitest";

import { findSkillMarketIndependenceViolations } from "./skill-market-independence";

describe("Skill Market frontend independence", () => {
  it("accepts the same-origin Skill Market BFF boundary", () => {
    expect(findSkillMarketIndependenceViolations([{
      path: "src/features/skills/api/browser-client.ts",
      source: "fetch('/api/skill-market/catalog?mode=daily')",
    }])).toEqual([]);
  });

  it.each([
    ["fetch('/api/skills')", "legacy /api/skills dependency"],
    ["loadProjectSkillCatalog()", "legacy filesystem catalog dependency"],
    ["import 'DSI-agent-loop/api/src/db/schema'", "backend or legacy repository source dependency"],
    ["process.env.NEXT_PUBLIC_LEGACY_FRONTEND_URL", "legacy frontend runtime dependency"],
  ])("rejects %s", (source, rule) => {
    expect(findSkillMarketIndependenceViolations([{ path: "candidate.ts", source }]))
      .toEqual([{ path: "candidate.ts", rule }]);
  });
});
