import { describe, expect, it } from "vitest";

import { reviewQueueAdapter } from "./review-view-model";

describe("review view-model", () => {
  it("maps queue metadata without inventing optional evidence", () => {
    const result = reviewQueueAdapter.toViewModel([{
      artifactKey: "artifact.zip",
      authorId: "author-1",
      contentHash: "a".repeat(64),
      id: "submission-1",
      manifest: { unexpected: true },
      name: "demo-skill",
      revision: 2,
      status: "pending_review",
      submittedAt: "2026-11-07T08:00:00.000Z",
      validationReport: { valid: true },
    }]);

    expect(result[0]).toMatchObject({
      id: "submission-1",
      manifest: undefined,
      name: "demo-skill",
      validationReport: undefined,
    });
  });
});
