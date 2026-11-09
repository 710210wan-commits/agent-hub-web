import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import {
  AuthorDraftSchema,
  MarketCatalogResponseSchema,
  MarketInstallationSchema,
  MarketPublicationSummarySchema,
  ReviewQueueItemSchema,
} from "../src/features/skills/contracts/generated/index.js";
import { toSkillCatalogViewModel } from "../src/features/skills/contracts/catalog-view-model.js";
import { toPublicationViewModels } from "../src/features/skills/publication/publication-view-model.js";

async function main(): Promise<void> {
  const snapshotPath = process.env.SKILL_MARKET_COMPAT_SNAPSHOT;
  assert(snapshotPath, "Set SKILL_MARKET_COMPAT_SNAPSHOT to the backend J-02 snapshot.");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as Record<string, unknown>;
  assert.equal(snapshot.version, 1, "Unsupported J-02 snapshot version");

  const data = requireRecord(snapshot.data, "data");
  const drafts = AuthorDraftSchema.array().parse(data.drafts);
  const submissions = ReviewQueueItemSchema.array().parse(data.submissions);
  const publications = MarketPublicationSummarySchema.array().parse(data.publications);
  const installations = MarketInstallationSchema.array().parse(data.installations);
  const catalogDto = MarketCatalogResponseSchema.parse(data.catalog);
  const artifactStates = requireArray(snapshot.artifactStates, "artifactStates").map((value) => {
    const row = requireRecord(value, "artifact state");
    assert.equal(typeof row.publicationId, "string");
    assert.equal(typeof row.state, "string");
    return { publicationId: row.publicationId, state: row.state };
  });

  const frontendState = {
    artifacts: stable(artifactStates),
    drafts: stable(drafts.map(({ id, name, revision, status }) => ({ id, name, revision, status }))),
    installations: stable(installations),
    publications: stable(publications),
    submissions: stable(submissions.map(({ artifactKey, contentHash, id, name, revision, status }) => ({
      artifactKey, contentHash, id, name, revision, status,
    }))),
  };
  assert.deepEqual(frontendState, snapshot.legacy, "new and legacy frontend business state diverged");

  const catalog = toSkillCatalogViewModel(catalogDto);
  const publicationViews = toPublicationViewModels(publications, catalog);
  for (const publication of publicationViews) {
    const artifact = artifactStates.find((item) => item.publicationId === publication.id);
    if (publication.status === "withdrawn") {
      assert.equal(publication.availability, "withdrawn");
      assert.equal(publication.installable, false);
      continue;
    }
    if (artifact?.state !== "valid" && publication.isLatest) {
      assert.equal(publication.availability, "unavailable", `${publication.id} has no valid Artifact`);
      assert.equal(publication.installable, false);
    }
    const catalogItem = catalog.items.find((item) => item.publicationId === publication.id);
    if (catalogItem && !catalogItem.scopes.some((scope) => scope.id === "daily")) {
      assert.notEqual(catalogItem.installState, "enabled", `${publication.id} is not installed to daily`);
    }
  }

  const conflictDto = MarketCatalogResponseSchema.parse({
    generatedAt: catalogDto.generatedAt,
    items: [snapshot.conflictFixture],
    total: 1,
  });
  const conflict = toSkillCatalogViewModel(conflictDto).items[0];
  assert.equal(conflict.installState, "blocked");
  assert.equal(conflict.conflict?.reasonCode, "skill.protected_name_conflict");

  const coverage = requireRecord(snapshot.coverage, "coverage");
  for (const name of ["disabled", "historicalRevision", "missingArtifact", "normal", "syntheticHistoricalConflict", "withdrawn"]) {
    assert.equal(coverage[name], true, `J-02 coverage missing: ${name}`);
  }

  console.log(JSON.stringify({
    counts: {
      drafts: drafts.length,
      installations: installations.length,
      publications: publications.length,
      submissions: submissions.length,
    },
    coverage,
    ok: true,
  }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, name: string): unknown[] {
  assert(Array.isArray(value), `${name} must be an array`);
  return value;
}

function stable<T>(values: T[]): T[] {
  return [...values].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}
