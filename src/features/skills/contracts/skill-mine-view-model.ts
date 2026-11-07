import type { AuthorDraft } from "./generated";
import { defineSkillMarketViewModelAdapter } from "./view-models";

export interface SkillDraftSummaryViewModel {
  id: string;
  name: string;
  revision: number;
  status: AuthorDraft["status"];
  fileCount: number;
}

export const skillDraftSummariesAdapter = defineSkillMarketViewModelAdapter(
  "listDrafts",
  (drafts): SkillDraftSummaryViewModel[] => drafts.map((draft) => ({
    id: draft.id,
    name: draft.name,
    revision: draft.revision,
    status: draft.status,
    fileCount: Object.keys(draft.files).length,
  })),
);
