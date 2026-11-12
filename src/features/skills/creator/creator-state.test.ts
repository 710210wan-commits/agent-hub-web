import { describe, expect, it } from "vitest";

import type { AuthorDraft, RequirementSpecV1 } from "../contracts/generated";
import {
  creatorStep,
  invalidateAfterBasic,
  invalidateAfterRequirement,
  invalidateAfterTools,
  recoverCreatorState,
  type CreatorState,
} from "./creator-state";

const requirement = {
  apiVersion: "skill-requirements.datasource/v1",
  constraints: [], criticalAmbiguities: [], examples: [], goal: "Create a demo skill",
  input: { description: "A user request" }, output: { description: "A useful answer" },
  status: "confirmed", successCriteria: ["Works"],
  tools: { missingCapabilities: [], requiredCapabilities: [], selectedToolNames: ["search"] },
  trigger: { negativeExamples: ["no"], positiveExamples: ["yes"], whenToUse: "For demos" },
} satisfies RequirementSpecV1;

function completeState(): CreatorState {
  return {
    basic: { description: "A sufficiently detailed creator description", name: "demo-skill", scenarioId: "daily", title: "Demo", version: "1.0.0" },
    bundle: { diagnostics: [], files: { "SKILL.md": "# Demo" } },
    confirmedRequirement: requirement,
    confirmedToolNames: ["search"],
    interview: { questions: [], requirement, summary: "Ready" },
    smokeCases: [{ expected: "ok", id: "smoke-1", input: "test" }],
    smokeResult: { evidence: [], qualityGate: "soft" },
  };
}

describe("creator state", () => {
  it("invalidates every downstream artifact when basic input changes", () => {
    const state = invalidateAfterBasic(completeState(), { ...completeState().basic, title: "Changed" });
    expect(state.interview).toBeUndefined();
    expect(creatorStep(state)).toBe("requirement");
  });

  it("invalidates only the dependent tail when requirement or tools change", () => {
    const requirementChanged = invalidateAfterRequirement(completeState(), { questions: [], requirement, summary: "Again" });
    expect(requirementChanged.interview).toBeDefined();
    expect(requirementChanged.confirmedRequirement).toBeUndefined();

    const toolsChanged = invalidateAfterTools(completeState(), ["filesystem"]);
    expect(toolsChanged.confirmedRequirement).toBeDefined();
    expect(toolsChanged.bundle).toBeUndefined();
    expect(toolsChanged.smokeResult).toBeUndefined();
  });

  it("recovers a backend draft at the first incomplete step", () => {
    const draft = {
      authorId: "author-1", files: { "SKILL.md": "# Demo" }, id: "draft-1", name: "demo-skill", revision: 2, status: "editing",
      metadata: {
        creator: { basic: completeState().basic, bundleReady: true, confirmedRequirement: requirement, confirmedToolNames: ["search"], diagnostics: [] },
      },
    } satisfies AuthorDraft;
    const recovered = recoverCreatorState(draft);
    expect(recovered.draft?.id).toBe("draft-1");
    expect(recovered.bundle?.files).toEqual(draft.files);
    expect(creatorStep(recovered)).toBe("smoke");
  });
});
