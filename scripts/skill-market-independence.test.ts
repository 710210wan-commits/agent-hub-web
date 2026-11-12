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
    "src/features/skills/work/contracts.ts",
    "src\\features\\skills\\work\\contracts.test.ts",
  ])("accepts approved Xiaozhi paths in the frozen Work contract: %s", (path) => {
    expect(findSkillMarketIndependenceViolations([{
      path,
      source: [
        'remoteList: "/api/skills/remote/list"',
        'uploadPrepare: "/api/skills/import/prepare"',
        'return `/api/skills/install-drafts/${safeId}`',
      ].join("\n"),
    }])).toEqual([]);
  });

  it("still rejects the legacy root path inside the Work contract", () => {
    expect(findSkillMarketIndependenceViolations([{
      path: "src/features/skills/work/contracts.ts",
      source: 'fetch("/api/skills")',
    }])).toEqual([{ path: "src/features/skills/work/contracts.ts", rule: "legacy /api/skills dependency" }]);
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
