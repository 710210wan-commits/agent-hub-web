import { describe, expect, it } from "vitest";

import {
  draftMutationAdapter,
  draftViewModelAdapter,
  submissionViewModelAdapter,
} from "./authoring-view-model";

const draft = {
  authorId: "author-1",
  files: { "SKILL.md": "# Demo" },
  id: "draft-1",
  metadata: { title: "Demo" },
  name: "demo-skill",
  revision: 3,
  status: "editing" as const,
};

describe("authoring view-model adapters", () => {
  it("derives editable state and file count from a draft", () => {
    expect(draftViewModelAdapter.toViewModel(draft)).toMatchObject({
      editable: true,
      fileCount: 1,
      id: "draft-1",
      revision: 3,
    });
    expect(draftViewModelAdapter.toViewModel({ ...draft, status: "submitted" }).editable).toBe(false);
  });

  it("keeps backend diagnostics on draft mutations", () => {
    const result = draftMutationAdapter.toViewModel({
      diagnostics: [{ code: "warning", message: "Check this", severity: "warning" }],
      draft,
    });
    expect(result.draft.fileCount).toBe(1);
    expect(result.diagnostics).toHaveLength(1);
  });

  it("maps a submission to the review destination", () => {
    const result = submissionViewModelAdapter.toViewModel({
      artifactKey: "artifact.zip",
      authorId: "author-1",
      contentHash: "a".repeat(64),
      draftId: "draft-1",
      id: "submission-1",
      manifest: {} as never,
      revision: 3,
      status: "pending_review",
      validationReport: {} as never,
    });
    expect(result).toEqual({ id: "submission-1", revision: 3, status: "pending_review" });
  });
});
