import { describe, expect, it, vi } from "vitest";

import { SkillMarketError } from "../contracts/error";
import { defineSkillMarketViewModelAdapter } from "../contracts/view-models";
import {
  SkillMarketClient,
  skillMarketQueryKey,
} from "./client";

describe("SkillMarketClient", () => {
  it("validates a response before invoking its ViewModel adapter", async () => {
    const toViewModel = vi.fn((drafts: unknown[]) => ({ count: drafts.length }));
    const client = new SkillMarketClient({
      fetchImpl: vi.fn(async (input) => {
        expect(String(input)).toBe("/api/skill-market/drafts?mode=daily");
        return Response.json([]);
      }) as typeof fetch,
    });

    await expect(client.query(
      { mode: "daily", operation: "listDrafts" },
      defineSkillMarketViewModelAdapter("listDrafts", toViewModel),
    )).resolves.toEqual({ count: 0 });
    expect(toViewModel).toHaveBeenCalledOnce();
  });

  it("rejects an invalid response before it reaches the ViewModel adapter", async () => {
    const toViewModel = vi.fn(() => ({ count: 99 }));
    const client = new SkillMarketClient({
      fetchImpl: vi.fn(async () => Response.json({ items: "not-an-array" })) as typeof fetch,
    });

    await expect(client.query(
      { mode: "daily", operation: "listDrafts" },
      defineSkillMarketViewModelAdapter("listDrafts", toViewModel),
    )).rejects.toMatchObject({ code: "SKILL_MARKET_RESPONSE_INVALID" });
    expect(toViewModel).not.toHaveBeenCalled();
  });

  it("fails work closed before fetch", async () => {
    const fetchImpl = vi.fn();
    const client = new SkillMarketClient({ fetchImpl: fetchImpl as typeof fetch });

    await expect(client.query(
      { mode: "work", operation: "listDrafts" },
      defineSkillMarketViewModelAdapter("listDrafts", (drafts) => drafts),
    )).rejects.toMatchObject({ code: "SKILL_MARKET_MODE_UNAVAILABLE", status: 409 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("decodes a structured backend error with the operation area", async () => {
    const client = new SkillMarketClient({
      fetchImpl: vi.fn(async () => Response.json({
        code: "skill.lifecycle_conflict",
        error: "Draft revision conflict.",
        requestId: "request-conflict",
      }, { status: 409 })) as typeof fetch,
    });

    await expect(client.query(
      { mode: "daily", operation: "getDraft", pathParameters: { id: "draft-1" } },
      defineSkillMarketViewModelAdapter("getDraft", (draft) => draft),
    )).rejects.toMatchObject({
      area: "draft",
      code: "skill.lifecycle_conflict",
      recovery: "refresh",
      requestId: "request-conflict",
    });
  });

  it("returns one mutation result without throwing structured failures", async () => {
    const client = new SkillMarketClient({
      fetchImpl: vi.fn(async () => Response.json({
        code: "skill.validation_failed",
        diagnostics: [{ code: "skill.name.required", message: "Name is required.", severity: "error" }],
        error: "Skill validation failed.",
      }, { status: 422 })) as typeof fetch,
    });

    const result = await client.mutate(
      { mode: "daily", operation: "submitDraft", pathParameters: { id: "draft-1" } },
      defineSkillMarketViewModelAdapter("submitDraft", (submission) => submission.id),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SkillMarketError);
      expect(result.error).toMatchObject({ area: "draft", status: 422 });
    }
  });

  it("normalizes timeout and caller cancellation", async () => {
    const fetchImpl = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    const client = new SkillMarketClient({ fetchImpl, timeoutMs: 5 });
    const adapter = defineSkillMarketViewModelAdapter("listDrafts", (drafts) => drafts);

    await expect(client.query({ mode: "daily", operation: "listDrafts" }, adapter))
      .rejects.toMatchObject({ code: "SKILL_MARKET_CLIENT_TIMEOUT", retryable: true });

    const controller = new AbortController();
    controller.abort();
    await expect(client.query(
      { mode: "daily", operation: "listDrafts", signal: controller.signal },
      adapter,
    )).rejects.toMatchObject({ code: "SKILL_MARKET_CLIENT_CANCELLED", retryable: false });
  });

  it("validates download metadata and returns a download ViewModel", async () => {
    const sha256 = "a".repeat(64);
    const client = new SkillMarketClient({
      fetchImpl: vi.fn(async (input) => {
        expect(String(input)).toBe("/api/skill-market/publications/pub-1/download?mode=daily");
        return new Response(new Uint8Array([80, 75, 3, 4]), {
          headers: {
            "content-disposition": 'attachment; filename="sample-r1.zip"',
            "content-type": "application/zip",
            "x-content-sha256": sha256,
          },
        });
      }) as typeof fetch,
    });

    const download = await client.downloadPublication({ id: "pub-1", mode: "daily" });
    expect(download).toMatchObject({ fileName: "sample-r1.zip", sha256 });
    expect(download.blob).toMatchObject({ size: 4, type: "application/zip" });
  });

  it("rejects invalid download metadata", async () => {
    const client = new SkillMarketClient({
      fetchImpl: vi.fn(async () => new Response("zip", {
        headers: { "content-type": "application/zip", "x-content-sha256": "invalid" },
      })) as typeof fetch,
    });

    await expect(client.downloadPublication({ id: "pub-1", mode: "daily" }))
      .rejects.toMatchObject({ code: "SKILL_MARKET_RESPONSE_INVALID" });
  });
});

describe("skillMarketQueryKey", () => {
  it("always isolates mode, resource type, and resource identity", () => {
    expect(skillMarketQueryKey("daily", "draft", "draft-1")).toEqual([
      "skill-market",
      "daily",
      "draft",
      "draft-1",
    ]);
    expect(skillMarketQueryKey("work", "draft", "draft-1"))
      .not.toEqual(skillMarketQueryKey("daily", "draft", "draft-1"));
    expect(skillMarketQueryKey("daily", "draft", "draft-2"))
      .not.toEqual(skillMarketQueryKey("daily", "draft", "draft-1"));
  });
});
