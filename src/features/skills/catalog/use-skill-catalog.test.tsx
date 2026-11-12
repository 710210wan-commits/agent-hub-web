import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SkillMarketClient } from "../api/client";
import type { SkillCatalogPageState } from "./catalog-state";
import { useSkillCatalog } from "./use-skill-catalog";

const generatedAt = "2026-11-07T00:00:00.000Z";

function catalogBody(itemCount: number) {
  return {
    generatedAt,
    items: Array.from({ length: itemCount }, (_, index) => ({
      allowedTools: [],
      category: "other",
      categoryLabel: "内置 Skill",
      categorySource: "inferred",
      description: `描述 ${index}`,
      id: `built-in:skill-${index}`,
      loadedByScenarios: [],
      name: `skill-${index}`,
      relativePath: `skills/skill-${index}/SKILL.md`,
      source: "built-in",
      sourceDir: "skills",
      status: "available",
      title: `Skill ${index}`,
    })),
    total: itemCount,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("useSkillCatalog", () => {
  it("loads the daily catalog automatically through the validated client", async () => {
    const fetchImpl = vi.fn(async (input) => {
      expect(String(input)).toBe("/api/skill-market/catalog?mode=daily");
      return jsonResponse(catalogBody(2));
    }) as typeof fetch;
    const client = new SkillMarketClient({ fetchImpl });

    const { result } = renderHook(() => useSkillCatalog({ client, mode: "daily" }));

    expect(result.current.state.kind).toBe("loading");
    await waitFor(() => expect(result.current.state.kind).toBe("success"));
    if (result.current.state.kind !== "success") throw new Error("unreachable");
    expect(result.current.state.catalog.items).toHaveLength(2);
    expect(result.current.state.catalog.items[0]).toMatchObject({
      id: "built-in:skill-0",
      source: "built-in",
      installState: "built-in-active",
    });
  });

  it("moves to error when the initial load fails", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ code: "skill.permission_denied", error: "Forbidden." }, 403)) as typeof fetch;
    const client = new SkillMarketClient({ fetchImpl });

    const { result } = renderHook(() => useSkillCatalog({ client, mode: "daily" }));

    await waitFor(() => expect(result.current.state.kind).toBe("error"));
    if (result.current.state.kind !== "error") throw new Error("unreachable");
    expect(result.current.state.error).toMatchObject({ status: 403, presentation: "permission" });
    expect(result.current.state.catalog).toBeUndefined();
  });

  it("keeps previous results while refreshing and replaces them on success", async () => {
    let itemCount = 1;
    const fetchImpl = vi.fn(async () => jsonResponse(catalogBody(itemCount))) as typeof fetch;
    const client = new SkillMarketClient({ fetchImpl });
    const { result } = renderHook(() => useSkillCatalog({ client, mode: "daily" }));

    await waitFor(() => expect(result.current.state.kind).toBe("success"));
    itemCount = 3;

    act(() => {
      result.current.refresh();
    });

    const refreshingState: SkillCatalogPageState = result.current.state;
    expect(refreshingState.kind).toBe("refreshing");
    if (refreshingState.kind !== "refreshing") throw new Error("unreachable");
    expect(refreshingState.catalog.items).toHaveLength(1);

    await waitFor(() => expect(result.current.state.kind).toBe("success"));
    if (result.current.state.kind !== "success") throw new Error("unreachable");
    expect(result.current.state.catalog.items).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps previous results when a refresh fails", async () => {
    let fail = false;
    const fetchImpl = vi.fn(async () => {
      if (fail) return jsonResponse({ code: "skill.internal_error", error: "Boom." }, 500);
      return jsonResponse(catalogBody(2));
    }) as typeof fetch;
    const client = new SkillMarketClient({ fetchImpl });
    const { result } = renderHook(() => useSkillCatalog({ client, mode: "daily" }));

    await waitFor(() => expect(result.current.state.kind).toBe("success"));
    fail = true;

    act(() => {
      result.current.refresh();
    });
    expect(result.current.state.kind).toBe("refreshing");

    await waitFor(() => expect(result.current.state.kind).toBe("error"));
    if (result.current.state.kind !== "error") throw new Error("unreachable");
    expect(result.current.state.catalog?.items).toHaveLength(2);
  });

  it("ignores duplicate refresh calls while a load is in flight", async () => {
    let release!: (response: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(() => gate) as unknown as typeof fetch;
    const client = new SkillMarketClient({ fetchImpl });
    const { result } = renderHook(() => useSkillCatalog({ client, mode: "daily" }));

    await waitFor(() => expect(result.current.state.kind).toBe("loading"));
    act(() => {
      result.current.refresh();
      result.current.refresh();
    });

    await act(async () => {
      release(jsonResponse(catalogBody(1)));
      await gate;
    });

    await waitFor(() => expect(result.current.state.kind).toBe("success"));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never requests the catalog in work mode", async () => {
    const fetchImpl = vi.fn() as typeof fetch;
    const client = new SkillMarketClient({ fetchImpl });
    const { result } = renderHook(() => useSkillCatalog({ client, mode: "work" }));

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.state.kind).toBe("idle"));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("clears completed daily data when the mode changes to work", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(catalogBody(1))) as typeof fetch;
    const client = new SkillMarketClient({ fetchImpl });
    const { result, rerender } = renderHook(
      ({ mode }: { mode: "daily" | "work" }) => useSkillCatalog({ client, mode }),
      { initialProps: { mode: "daily" as "daily" | "work" } },
    );

    await waitFor(() => expect(result.current.state.kind).toBe("success"));
    rerender({ mode: "work" });

    await waitFor(() => expect(result.current.state.kind).toBe("idle"));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("aborts an in-flight daily request before entering work mode", async () => {
    let requestAborted = false;
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          requestAborted = true;
          reject(new DOMException("aborted", "AbortError"));
        }, { once: true });
      })) as typeof fetch;
    const client = new SkillMarketClient({ fetchImpl });
    const { result, rerender } = renderHook(
      ({ mode }: { mode: "daily" | "work" }) => useSkillCatalog({ client, mode }),
      { initialProps: { mode: "daily" as "daily" | "work" } },
    );

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    rerender({ mode: "work" });

    await waitFor(() => expect(requestAborted).toBe(true));
    expect(result.current.state.kind).toBe("idle");
  });
});
