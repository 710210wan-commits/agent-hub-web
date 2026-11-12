import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createDraftRequestSchema,
  getDraftPathSchema,
  getSkillCatalogResponseSchema,
  listCreatorToolsQuerySchema,
  listDraftsResponseSchema,
  skillMarketContractMetadata,
  skillMarketOperationSchemas,
  type CreateDraftOperationRequest,
  type GetDraftOperationPath,
  type ListCreatorToolsOperationQuery,
} from "./generated";

describe("generated Skill Market contracts", () => {
  it("exposes the pinned contract metadata and every operation", () => {
    expect(skillMarketContractMetadata).toEqual({
      contractId: "skill-market.v1",
      schemaVersion: "1.1.0",
      schemaSha256: "49d3a134485a714362e50ae92288fb85ce830b225862472846798dbd325c372e",
      sourceCommit: "f8b6ad021547158acbd68181a78a13bf2bc1d92c",
      generator: "zod@4.6.7",
    });
    expect(Object.keys(skillMarketOperationSchemas)).toHaveLength(28);
  });

  it("provides precise request types backed by runtime validation", () => {
    const request: CreateDraftOperationRequest = {
      files: { "SKILL.md": "# Sample" },
      name: "sample-skill",
    };

    expect(createDraftRequestSchema.parse(request)).toEqual(request);
    expect(createDraftRequestSchema.safeParse({ files: {}, name: "" }).success).toBe(false);
  });

  it("generates path and query contracts without exposing signed headers", () => {
    const pathParameters: GetDraftOperationPath = { id: "draft-1" };
    const queryParameters: ListCreatorToolsOperationQuery = {
      includeInternal: false,
      maxRiskLevel: "medium",
      scenarioId: "daily",
    };

    expect(getDraftPathSchema.parse(pathParameters)).toEqual(pathParameters);
    expect(getDraftPathSchema.safeParse({ id: "" }).success).toBe(false);
    expect(listCreatorToolsQuerySchema.parse(queryParameters)).toEqual(queryParameters);
    expect(listCreatorToolsQuerySchema.safeParse({ includeInternal: "false" }).success).toBe(false);
    expect(Object.keys(skillMarketOperationSchemas.getDraft)).not.toContain("headers");
  });

  it("rejects invalid upstream responses before they reach a component", () => {
    const validResponse = {
      generatedAt: "2026-11-06T00:00:00Z",
      items: [],
      total: 0,
    };

    expect(getSkillCatalogResponseSchema.parse(validResponse)).toEqual(validResponse);
    expect(
      getSkillCatalogResponseSchema.safeParse({ ...validResponse, total: "0" }).success,
    ).toBe(false);
    expect(listDraftsResponseSchema.safeParse({}).success).toBe(false);
  });

  it("does not import backend source or the monorepo shared package", async () => {
    const contents = await Promise.all(
      ["index.ts", "operations.ts", "schemas.ts"].map((name) =>
        readFile(
          path.resolve("src/features/skills/contracts/generated", name),
          "utf8",
        )
      ),
    );

    for (const content of contents) {
      expect(content).not.toContain("@datasourceintelligence/shared");
      expect(content).not.toMatch(/from ["']\.\.\//);
      expect(content).toContain("DO NOT EDIT");
    }
  });
});
