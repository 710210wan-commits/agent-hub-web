import type { AuthorDraft, SkillDiagnostic } from "./generated";
import { defineSkillMarketViewModelAdapter } from "./view-models";

export interface DraftViewModel {
  authorId: string;
  editable: boolean;
  fileCount: number;
  files: Record<string, string>;
  id: string;
  metadata: Record<string, unknown>;
  name: string;
  revision: number;
  status: AuthorDraft["status"];
}

export interface DraftMutationViewModel {
  diagnostics: SkillDiagnostic[];
  draft: DraftViewModel;
}

export interface SubmissionViewModel {
  id: string;
  revision: number;
  status: "pending_review";
}

function toDraftViewModel(draft: AuthorDraft): DraftViewModel {
  return {
    ...draft,
    editable: draft.status === "editing",
    fileCount: Object.keys(draft.files).length,
  };
}

export const draftViewModelAdapter = defineSkillMarketViewModelAdapter("getDraft", toDraftViewModel);

export const draftMutationAdapter = defineSkillMarketViewModelAdapter(
  "createDraft",
  (result): DraftMutationViewModel => ({
    diagnostics: result.diagnostics,
    draft: toDraftViewModel(result.draft),
  }),
);

export const draftUpdateAdapter = defineSkillMarketViewModelAdapter(
  "updateDraft",
  (result): DraftMutationViewModel => ({
    diagnostics: result.diagnostics,
    draft: toDraftViewModel(result.draft),
  }),
);

export const draftDeleteAdapter = defineSkillMarketViewModelAdapter("deleteDraft", () => undefined);

export const submissionViewModelAdapter = defineSkillMarketViewModelAdapter(
  "submitDraft",
  (submission): SubmissionViewModel => ({
    id: submission.id,
    revision: submission.revision,
    status: submission.status,
  }),
);
