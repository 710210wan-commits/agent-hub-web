import { createHash } from "node:crypto";
import type { Page, Request, Route } from "@playwright/test";

const NOW = "2026-11-09T08:00:00.000Z";
const CONTENT_HASH = "a".repeat(64);
const DEFINITION_HASH = "b".repeat(64);
const FILE_HASH = "c".repeat(64);
const ARTIFACT = Buffer.from("K-03 deterministic artifact bytes");
const ARTIFACT_HASH = createHash("sha256").update(ARTIFACT).digest("hex");

export interface SkillMarketFixtureOptions {
  conflictOnFirstSave?: boolean;
  initialSubmissionStatus?: "pending_review" | "approved" | "rejected" | "published";
  partialEnableFailure?: boolean;
}

export interface SkillMarketFixture {
  calls: Array<{ body?: unknown; method: string; path: string }>;
  state: {
    draftRevision: number;
    installationStatus: "disabled" | "enabled";
    publicationStatus: "published" | "withdrawn";
    submissionStatus: "pending_review" | "approved" | "rejected" | "published";
  };
}

export async function installSkillMarketFixture(
  page: Page,
  options: SkillMarketFixtureOptions = {},
): Promise<SkillMarketFixture> {
  const calls: SkillMarketFixture["calls"] = [];
  const state: SkillMarketFixture["state"] = {
    draftRevision: 1,
    installationStatus: "disabled",
    publicationStatus: "published",
    submissionStatus: options.initialSubmissionStatus ?? "pending_review",
  };
  let conflictPending = options.conflictOnFirstSave ?? false;
  const triggerRuns: unknown[] = [];

  await page.route("**/api/skill-market/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = postData(request);
    calls.push({ ...(body === undefined ? {} : { body }), method, path });

    if (method === "GET" && path === "/api/skill-market/catalog") {
      await json(route, catalog(state));
      return;
    }
    if (method === "GET" && path === "/api/skill-market/drafts") {
      await json(route, [draft(state)]);
      return;
    }
    if (method === "POST" && path === "/api/skill-market/drafts") {
      await json(route, { diagnostics: [], draft: draft(state) }, 201);
      return;
    }
    if (method === "GET" && path === "/api/skill-market/drafts/draft-k03") {
      await json(route, draft(state));
      return;
    }
    if (method === "PUT" && path === "/api/skill-market/drafts/draft-k03") {
      if (conflictPending) {
        conflictPending = false;
        state.draftRevision += 1;
        await problem(route, 409, "skill.lifecycle_conflict");
        return;
      }
      state.draftRevision += 1;
      await json(route, { diagnostics: [], draft: draft(state, body) });
      return;
    }
    if (method === "DELETE" && path === "/api/skill-market/drafts/draft-k03") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (method === "POST" && path === "/api/skill-market/drafts/draft-k03/submit") {
      await json(route, authorSubmission(state), 201);
      return;
    }

    if (method === "POST" && path === "/api/skill-market/creator/requirements/analyze") {
      await json(route, { questions: [], requirement: requirement("draft"), summary: "需求边界已提取。" });
      return;
    }
    if (method === "POST" && path === "/api/skill-market/creator/requirements/revise") {
      await json(route, { questions: [], requirement: requirement("draft"), summary: "需求已按回答修订。" });
      return;
    }
    if (method === "POST" && path === "/api/skill-market/creator/requirements/confirm") {
      await json(route, { requirement: requirement("confirmed") });
      return;
    }
    if (method === "GET" && path === "/api/skill-market/creator/tools") {
      await json(route, { generatedAt: NOW, items: [{ diagnostics: [], manifest: toolManifest }] });
      return;
    }
    if (method === "POST" && path === "/api/skill-market/creator/tool-resolution/recommend") {
      await json(route, toolResolution);
      return;
    }
    if (method === "POST" && path === "/api/skill-market/creator/tool-resolution/confirm") {
      await json(route, { requirement: requirement("confirmed") });
      return;
    }
    if (method === "POST" && path === "/api/skill-market/creator/generate") {
      await json(route, creatorBundle(body));
      return;
    }
    if (method === "POST" && path === "/api/skill-market/creator/smoke/suggest") {
      await json(route, { cases: [{ expected: "Lifecycle evidence", id: "smoke-1", input: "Run lifecycle" }] });
      return;
    }
    if (method === "POST" && path === "/api/skill-market/creator/smoke/run") {
      await json(route, {
        evidence: [{ case: { expected: "Lifecycle evidence", id: "smoke-1", input: "Run lifecycle" }, durationMs: 12, output: "Lifecycle evidence", status: "passed" }],
        qualityGate: "soft",
      });
      return;
    }

    if (method === "GET" && path === "/api/skill-market/submissions") {
      await json(route, [reviewSubmission(state)]);
      return;
    }
    if (method === "GET" && path === "/api/skill-market/submissions/submission-k03/trigger-tests") {
      await json(route, triggerRuns);
      return;
    }
    if (method === "POST" && path === "/api/skill-market/submissions/submission-k03/trigger-tests") {
      const input = body as { expectedTrigger?: boolean; query?: string } | undefined;
      const run = {
        actualTrigger: input?.expectedTrigger ?? true,
        createdAt: NOW,
        durationMs: 8,
        expectedTrigger: input?.expectedTrigger ?? true,
        id: `trigger-${triggerRuns.length + 1}`,
        model: "playwright-policy",
        passed: true,
        query: input?.query ?? "lifecycle",
        reason: "matched fixture policy",
        runBy: "reviewer-k03",
        submissionId: "submission-k03",
      };
      triggerRuns.unshift(run);
      await json(route, run, 201);
      return;
    }
    if (method === "POST" && path === "/api/skill-market/submissions/submission-k03/review") {
      const input = body as { decision?: SkillMarketFixture["state"]["submissionStatus"] } | undefined;
      state.submissionStatus = input?.decision === "rejected" ? "rejected" : "approved";
      await json(route, reviewSubmission(state));
      return;
    }
    if (method === "DELETE" && path === "/api/skill-market/submissions/submission-k03") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (method === "POST" && path === "/api/skill-market/submissions/submission-k03/publish") {
      state.submissionStatus = "published";
      await json(route, publication(state), 201);
      return;
    }
    if (method === "POST" && path === "/api/skill-market/submissions/submission-k03/publish-and-enable") {
      state.submissionStatus = "published";
      if (!options.partialEnableFailure) state.installationStatus = "enabled";
      await json(route, {
        installation: options.partialEnableFailure
          ? { error: "installation unavailable", status: "failed" }
          : { status: "completed", value: installation(state) },
        publication: { status: "completed", value: publication(state) },
      }, 201);
      return;
    }

    if (method === "GET" && path === "/api/skill-market/publications") {
      await json(route, [publicationSummary(state)]);
      return;
    }
    if (method === "GET" && path === "/api/skill-market/publications/publication-k03/download") {
      await route.fulfill({
        body: ARTIFACT,
        contentType: "application/zip",
        headers: {
          "content-disposition": "attachment; filename=market-k03-r1.zip",
          "x-content-sha256": ARTIFACT_HASH,
        },
        status: 200,
      });
      return;
    }
    if (method === "POST" && path === "/api/skill-market/publications/publication-k03/installations") {
      const input = body as { status?: "disabled" | "enabled" } | undefined;
      state.installationStatus = input?.status ?? "enabled";
      await json(route, installation(state), 201);
      return;
    }
    if (method === "POST" && path === "/api/skill-market/publications/publication-k03/withdraw") {
      state.publicationStatus = "withdrawn";
      state.installationStatus = "disabled";
      await json(route, publication(state));
      return;
    }
    if (method === "POST" && path === "/api/skill-market/publications/publication-k03/revise") {
      state.draftRevision = 2;
      await json(route, { draft: draft(state) }, 201);
      return;
    }

    await problem(route, 404, "skill.resource_not_found");
  });

  return { calls, state };
}

function postData(request: Request): unknown {
  try { return request.postDataJSON(); } catch { return undefined; }
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}

async function problem(route: Route, status: number, code: string) {
  await json(route, { code, error: code, requestId: `k03-${status}` }, status);
}

function draft(state: SkillMarketFixture["state"], input?: unknown) {
  const update = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    authorId: "author-k03",
    files: update.files ?? { "SKILL.md": "# Market K03" },
    id: "draft-k03",
    metadata: update.metadata ?? {},
    name: "market-k03",
    revision: state.draftRevision,
    status: "editing" as const,
  };
}

function definition() {
  return {
    apiVersion: "skills.datasource/v1" as const,
    execution: { entry: "SKILL.md", type: "prompt" as const },
    interface: {},
    kind: "PromptSkill" as const,
    metadata: { description: "K03 lifecycle Skill", name: "market-k03", title: "Market K03", version: "1.0.0" },
    policies: {},
    resources: [],
    scenarios: ["daily"],
    tools: [{ name: "Read" }],
    trigger: { negativeExamples: ["weather"], positiveExamples: ["lifecycle"], whenToUse: "Use for lifecycle requests." },
  };
}

function requirement(status: "confirmed" | "draft") {
  return {
    apiVersion: "skill-requirements.datasource/v1" as const,
    constraints: [],
    criticalAmbiguities: [],
    examples: [{ expected: "Lifecycle evidence", input: "Run lifecycle" }],
    goal: "Produce lifecycle evidence.",
    input: { description: "A lifecycle request." },
    output: { description: "Lifecycle evidence." },
    status,
    successCriteria: ["Return evidence."],
    tools: { missingCapabilities: [], requiredCapabilities: ["Read"], selectedToolNames: ["Read"] },
    trigger: { negativeExamples: ["weather"], positiveExamples: ["lifecycle"], whenToUse: "Use for lifecycle requests." },
  };
}

const toolManifest = {
  access: { destructive: false, read: true, write: false },
  apiVersion: "tools.datasource/v1" as const,
  availability: "public" as const,
  description: "Read lifecycle input.",
  displayName: "Read",
  inputSchema: { type: "object" },
  name: "Read",
  requiredPermissions: [],
  riskLevel: "low" as const,
  sideEffects: [],
  supportedScenarios: ["daily"],
};

const toolResolution = {
  candidates: [toolManifest],
  diagnostics: [],
  missingCapabilities: [],
  recommendations: [{ name: "Read", reason: "Reads the lifecycle input." }],
};

function creatorBundle(request: unknown) {
  return {
    definition: definition(),
    diagnostics: [],
    files: { "SKILL.md": "# Market K03", "skill-definition.json": JSON.stringify(definition()) },
    request,
    spec: { description: "K03 lifecycle Skill", instructions: "Return the requested lifecycle evidence in a concise response." },
  };
}

function authorSubmission(state: SkillMarketFixture["state"]) {
  return {
    artifactKey: "sha256/k03.zip",
    authorId: "author-k03",
    contentHash: CONTENT_HASH,
    draftId: "draft-k03",
    id: "submission-k03",
    manifest: {
      definition: definition(),
      definitionHash: DEFINITION_HASH,
      definitionSource: "v1" as const,
      files: [{ path: "SKILL.md", sha256: FILE_HASH, size: 16 }],
      formatVersion: 2 as const,
      skillName: "market-k03",
    },
    revision: state.draftRevision,
    status: "pending_review" as const,
    triggerCases: [{ expectedTrigger: true, query: "lifecycle" }, { expectedTrigger: false, query: "weather" }],
    validationReport: {
      definition: definition(),
      definitionHash: DEFINITION_HASH,
      diagnostics: [],
      diff: { added: ["SKILL.md"], deleted: [], modified: [] },
      source: "v1" as const,
      tools: [toolManifest],
      valid: true as const,
    },
  };
}

function reviewSubmission(state: SkillMarketFixture["state"]) {
  return {
    artifactKey: "sha256/k03.zip",
    authorId: "author-k03",
    contentHash: CONTENT_HASH,
    id: "submission-k03",
    name: "market-k03",
    revision: 1,
    status: state.submissionStatus,
    submittedAt: NOW,
    triggerCases: [{ expectedTrigger: true, id: "case-positive", query: "lifecycle" }, { expectedTrigger: false, id: "case-negative", query: "weather" }],
    triggerRuns: [],
  };
}

function publication(state: SkillMarketFixture["state"]) {
  return {
    artifactKey: "sha256/k03.zip",
    contentHash: ARTIFACT_HASH,
    definitionHash: DEFINITION_HASH,
    id: "publication-k03",
    revision: 1,
    skillName: "market-k03",
    status: state.publicationStatus,
    submissionId: "submission-k03",
  };
}

function publicationSummary(state: SkillMarketFixture["state"]) {
  const value = publication(state);
  return {
    artifactKey: value.artifactKey,
    contentHash: value.contentHash,
    id: value.id,
    revision: value.revision,
    skillName: value.skillName,
    status: value.status,
    submissionId: value.submissionId,
  };
}

function installation(state: SkillMarketFixture["state"]) {
  return { id: "installation-k03", publicationId: "publication-k03", scopeId: "daily", scopeType: "scenario" as const, status: state.installationStatus };
}

function catalog(state: SkillMarketFixture["state"]) {
  const marketVisible = state.publicationStatus === "published";
  const items: Array<Record<string, unknown>> = [{
    allowedTools: [], availability: { installable: false, runnable: true }, category: "other", categoryLabel: "内置 Skill", categorySource: "inferred",
    description: "Built in", id: "built-in:k03", loadedByScenarios: [{ id: "daily", name: "日常" }], name: "built-in-k03",
    relativePath: "skills/built-in-k03/SKILL.md", source: "built-in", sourceDir: "skills", status: "available", title: "Built In K03",
  }];
  if (marketVisible) items.push({
    allowedTools: ["Read"], availability: { installable: true, runnable: state.installationStatus === "enabled" }, category: "other", categoryLabel: "市场发布", categorySource: "inferred",
    description: "K03 lifecycle Skill", id: "market:publication-k03", loadedByScenarios: state.installationStatus === "enabled" ? [{ id: "daily", name: "日常" }] : [],
    market: { publicationId: "publication-k03", revision: 1 }, name: "market-k03", relativePath: "market://publication-k03/SKILL.md", source: "market", sourceDir: "Skill Market", status: "available", title: "Market K03",
  });
  return { generatedAt: NOW, items, total: items.length };
}
