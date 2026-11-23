import { describe, expect, it, vi } from "vitest";

import { AssistantClientError, createAssistantClient } from "./assistant-client";

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("assistant client", () => {
  it("uses the same-origin Agent API and validates the assistant catalog", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, {
      assistants: [{
        id: "resume-screening",
        version: 1,
        name: "简历筛选助手",
        summary: "筛选电子简历",
        icon: "file-search",
        tags: ["HR"],
        status: "published",
        runtime: "dsi-native",
        requiredSkills: ["resume-screening"],
        allowedOptionalCapabilities: [],
        setupProfile: "resume-screening-v1",
        resultRenderer: "resume-screening-v1",
        modelPolicy: "hr-screening-default",
        retentionDays: 30,
      }],
    }));
    const client = createAssistantClient({ baseUrl: "/agent-api", fetcher });

    const assistants = await client.listAssistants();

    expect(assistants).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/agent-api/api/assistants",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("keeps 401 and 403 distinct for global versus local handling", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(401, { error: { code: "AUTH_REQUIRED", message: "login", requestId: crypto.randomUUID() } }))
      .mockResolvedValueOnce(response(403, { error: { code: "ORIGIN_REJECTED", message: "denied", requestId: crypto.randomUUID() } }));
    const client = createAssistantClient({ baseUrl: "/agent-api", fetcher });

    await expect(client.listAssistants()).rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED" });
    await expect(client.listAssistants()).rejects.toEqual(
      expect.objectContaining<Partial<AssistantClientError>>({ status: 403, code: "ORIGIN_REJECTED" }),
    );
  });
});
