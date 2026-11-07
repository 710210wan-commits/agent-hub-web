import {
  RequirementSpecV1Schema,
  SkillDiagnosticSchema,
  SmokeCaseV1Schema,
  SmokeRunResponseSchema,
  type AuthorDraft,
  type RequirementInterviewResult,
  type RequirementSpecV1,
  type SkillDiagnostic,
  type SmokeCaseV1,
  type SmokeRunResponse,
} from "../contracts/generated";

export interface CreatorBasicInput {
  description: string;
  name: string;
  scenarioId: string;
  title: string;
  version: string;
}

export interface CreatorBundleState {
  diagnostics: SkillDiagnostic[];
  files: Record<string, string>;
}

export interface CreatorDraftState {
  id: string;
  revision: number;
  status: AuthorDraft["status"];
}

export interface CreatorState {
  basic: CreatorBasicInput;
  bundle?: CreatorBundleState;
  confirmedRequirement?: RequirementSpecV1;
  confirmedToolNames?: string[];
  draft?: CreatorDraftState;
  draftSaved?: boolean;
  interview?: RequirementInterviewResult;
  selectedToolNames?: string[];
  smokeCases?: SmokeCaseV1[];
  smokeResult?: SmokeRunResponse;
}

export type CreatorStep = "requirement" | "confirmation" | "tools" | "bundle" | "diagnostics" | "smoke" | "save" | "complete";

export const EMPTY_CREATOR_BASIC: CreatorBasicInput = {
  description: "",
  name: "",
  scenarioId: "daily",
  title: "",
  version: "1.0.0",
};

export function creatorStep(state: CreatorState): CreatorStep {
  if (!state.interview) return "requirement";
  if (!state.confirmedRequirement) return "confirmation";
  if (state.confirmedToolNames === undefined) return "tools";
  if (!state.bundle) return "bundle";
  if (state.bundle.diagnostics.some((item) => item.severity === "error")) return "diagnostics";
  if (!state.smokeResult) return "smoke";
  if (!state.draft || state.draftSaved === false) return "save";
  return "complete";
}

export function invalidateAfterBasic(state: CreatorState, basic: CreatorBasicInput): CreatorState {
  return { basic, draft: state.draft, draftSaved: state.draft ? false : undefined };
}

export function invalidateAfterRequirement(
  state: CreatorState,
  interview: RequirementInterviewResult,
): CreatorState {
  return { basic: state.basic, draft: state.draft, draftSaved: state.draft ? false : undefined, interview };
}

export function invalidateAfterTools(state: CreatorState, selectedToolNames: string[]): CreatorState {
  return {
    basic: state.basic,
    confirmedRequirement: state.confirmedRequirement,
    draft: state.draft,
    draftSaved: state.draft ? false : undefined,
    interview: state.interview,
    selectedToolNames,
  };
}

export function recoverCreatorState(draft: AuthorDraft): CreatorState {
  const creator = isRecord(draft.metadata.creator) ? draft.metadata.creator : {};
  const basic = parseBasic(creator.basic, draft.name);
  const confirmedRequirement = RequirementSpecV1Schema.safeParse(creator.confirmedRequirement);
  const diagnostics = SkillDiagnosticSchema.array().safeParse(creator.diagnostics);
  const smokeCases = SmokeCaseV1Schema.array().max(2).safeParse(creator.smokeCases);
  const smokeResult = SmokeRunResponseSchema.safeParse(creator.smokeResult);
  const toolNames = stringArray(creator.confirmedToolNames);
  const bundleReady = creator.bundleReady === true;
  return {
    basic,
    bundle: bundleReady ? { diagnostics: diagnostics.success ? diagnostics.data : [], files: draft.files } : undefined,
    confirmedRequirement: confirmedRequirement.success ? confirmedRequirement.data : undefined,
    confirmedToolNames: toolNames,
    draft: { id: draft.id, revision: draft.revision, status: draft.status },
    draftSaved: true,
    interview: confirmedRequirement.success
      ? { questions: [], requirement: confirmedRequirement.data, summary: "已从服务端草稿恢复" }
      : undefined,
    selectedToolNames: toolNames,
    smokeCases: smokeCases.success ? smokeCases.data : undefined,
    smokeResult: smokeResult.success ? smokeResult.data : undefined,
  };
}

export function creatorDraftMetadata(state: CreatorState): Record<string, unknown> {
  return {
    creator: {
      basic: state.basic,
      bundleReady: Boolean(state.bundle),
      confirmedRequirement: state.confirmedRequirement,
      confirmedToolNames: state.confirmedToolNames,
      diagnostics: state.bundle?.diagnostics ?? [],
      smokeCases: state.smokeCases,
      smokeResult: state.smokeResult,
      version: 1,
    },
    title: state.basic.title,
    version: state.basic.version,
  };
}

function parseBasic(value: unknown, fallbackName: string): CreatorBasicInput {
  if (!isRecord(value)) return { ...EMPTY_CREATOR_BASIC, name: fallbackName };
  return {
    description: stringValue(value.description),
    name: stringValue(value.name) || fallbackName,
    scenarioId: stringValue(value.scenarioId) || "daily",
    title: stringValue(value.title),
    version: stringValue(value.version) || "1.0.0",
  };
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
