import { describe, expect, it, vi } from "vitest";
import { createDailyCapabilityClient } from "./daily-capability-client";
const catalog = { schemaVersion: 1, scenarioId: "daily",
  knowledgeBases: { status: "available", items: [{ id: "kb-a", name: "资料", description: "", type: "vector", supportsDocuments: true }] },
  skills: { status: "unavailable", items: [], reasonCode: "SKILL_CATALOG_UNAVAILABLE" },
  mcpServers: { status: "unavailable", items: [], reasonCode: "MCP_PROVIDER_NOT_CONFIGURED" } };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("Daily capability client", () => {
  it("loads partial catalog through the cookie-authenticated same-origin proxy", async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(catalog));
    const signal = new AbortController().signal;
    expect(await createDailyCapabilityClient({ fetchFn }).getCatalog(signal)).toEqual(catalog);
    expect(fetchFn).toHaveBeenCalledWith("/agent-api/api/conversation-capabilities?scenarioId=daily",
      expect.objectContaining({ credentials: "same-origin", method: "GET", signal }));
  });
  it.each([401, 403])("preserves HTTP %i with safe text", async status => {
    const fetchFn = vi.fn().mockResolvedValue(response({ code: status, message: "SECRET", data: null }, status));
    await expect(createDailyCapabilityClient({ fetchFn }).getCatalog()).rejects.toMatchObject({ status });
    await expect(createDailyCapabilityClient({ fetchFn }).getCatalog()).rejects.not.toHaveProperty("message", "SECRET");
  });
  it.each([
    { ...catalog, token: "SECRET" },
    { ...catalog, knowledgeBases: { ...catalog.knowledgeBases, items: [{ ...catalog.knowledgeBases.items[0], apiKey: "SECRET" }] } },
    { ...catalog, skills: { status: "available", items: [{ id: "x", url: "https://private.invalid" }] } },
  ])("rejects malformed or secret-bearing catalogs", async payload => {
    await expect(createDailyCapabilityClient({ fetchFn: vi.fn().mockResolvedValue(response(payload)) }).getCatalog())
      .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("preserves abort", async () => {
    const abort = new DOMException("Aborted", "AbortError");
    await expect(createDailyCapabilityClient({ fetchFn: vi.fn().mockRejectedValue(abort) }).getCatalog()).rejects.toBe(abort);
  });
  it("preserves abort while reading the response body", async () => {
    const abort = new DOMException("Aborted", "AbortError");
    const payload = { ok: true, status: 200, json: vi.fn().mockRejectedValue(abort) };
    await expect(createDailyCapabilityClient({ fetchFn: vi.fn().mockResolvedValue(payload) }).getCatalog()).rejects.toBe(abort);
  });
  it("rejects external API bases", () => {
    expect(() => createDailyCapabilityClient({ apiBaseUrl: "https://private.invalid" })).toThrow();
  });
});
