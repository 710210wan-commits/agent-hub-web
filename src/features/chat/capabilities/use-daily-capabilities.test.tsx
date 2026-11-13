import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useDailyCapabilities } from "./use-daily-capabilities";
import type { ConversationCapabilityCatalog } from "./contracts";

it("aborts old identity loads and ignores their late catalog response", async () => {
  const catalog: ConversationCapabilityCatalog = { schemaVersion: 1, scenarioId: "daily",
    knowledgeBases: { status: "available", items: [] }, skills: { status: "available", items: [] },
    mcpServers: { status: "unavailable", items: [], reasonCode: "MCP_PROVIDER_NOT_CONFIGURED" } };
  let resolveOld!: (value: ConversationCapabilityCatalog) => void;
  const old = new Promise<ConversationCapabilityCatalog>(resolve => { resolveOld = resolve; });
  const client = { getCatalog: vi.fn().mockReturnValueOnce(old).mockResolvedValue(catalog) };
  const onAuthRequired = vi.fn();
  const { result, rerender, unmount } = renderHook(({ generation }) => useDailyCapabilities(client, generation, onAuthRequired), { initialProps: { generation: 1 } });
  const oldSignal = client.getCatalog.mock.calls[0][0] as AbortSignal;
  rerender({ generation: 2 });
  await waitFor(() => expect(result.current.catalog).toEqual(catalog));
  expect(oldSignal.aborted).toBe(true);
  await act(async () => resolveOld({ ...catalog, knowledgeBases: { status: "available", items: [{ id: "old-user-kb", name: "旧用户", description: "", type: "vector", supportsDocuments: true }] } }));
  expect(result.current.catalog?.knowledgeBases.items).toEqual([]);
  expect(onAuthRequired).not.toHaveBeenCalled();
  unmount();
});
