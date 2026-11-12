import { describe, expect, it } from "vitest";

import type { SkillCatalogViewModel } from "../contracts/catalog-view-model";
import { toPublicationViewModels } from "./publication-view-model";

const catalog: SkillCatalogViewModel = {
  generatedAt: "2026-11-07T08:00:00.000Z",
  items: [{
    categoryLabel: "其他", categorySource: "inferred", conflict: null,
    description: "Demo", id: "demo-skill", installState: "enabled",
    loadedScenarios: [{ id: "daily", name: "日常" }], name: "demo-skill",
    publicationId: "pub-2", revision: 2, scopes: [{ id: "daily", name: "日常", type: "scenario" }],
    source: "market", title: "Demo", tools: [],
  }],
  total: 1,
};

describe("publication view-model", () => {
  it("marks only the catalog-linked latest publication as manageable", () => {
    const result = toPublicationViewModels([
      { artifactKey: "old.zip", contentHash: "a".repeat(64), id: "pub-1", revision: 1, skillName: "demo-skill", status: "published", submissionId: "sub-1" },
      { artifactKey: "new.zip", contentHash: "b".repeat(64), id: "pub-2", revision: 2, skillName: "demo-skill", status: "published", submissionId: "sub-2" },
    ], catalog);

    expect(result[0]).toMatchObject({ availability: "historical", installable: false, isLatest: false });
    expect(result[1]).toMatchObject({ availability: "enabled", installable: true, isLatest: true });
  });

  it("never presents withdrawn publications as installable", () => {
    const result = toPublicationViewModels([
      { artifactKey: "new.zip", contentHash: "b".repeat(64), id: "pub-2", revision: 2, skillName: "demo-skill", status: "withdrawn", submissionId: "sub-2" },
    ], catalog);
    expect(result[0]).toMatchObject({ availability: "withdrawn", installable: false });
  });
});
