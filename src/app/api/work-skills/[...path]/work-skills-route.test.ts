import { afterEach, describe, expect, it, vi } from "vitest";

import skillListFixture from "@/features/skills/work/fixtures/skill-list.json";

import { GET, PUT } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configureServerEnv() {
  vi.stubEnv("AGENT_API_ORIGIN", "https://dsi.example.test");
  vi.stubEnv("XIAOZHI_API_ORIGIN", "https://xiaozhi.example.test");
  vi.stubEnv("XIAOZHI_API_KEY", "yxkey_route-test-secret");
  vi.stubEnv("XIAOZHI_WORK_AGENT_SLUG", "office-agent");
}

describe("work-skills catch-all route", () => {
  it("awaits catch-all params and proxies an allowed request after session check", async () => {
    configureServerEnv();
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("https://dsi.example.test/")) {
        return Response.json({ enabled: true, xiaozhiUrl: "" });
      }
      expect(url).toBe("https://xiaozhi.example.test/api/system/skills");
      return Response.json(skillListFixture);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("https://agent-hub.example.test/api/work-skills/system/skills", {
        headers: { cookie: "dsi_app_session=sess-abc123" },
      }),
      { params: Promise.resolve({ path: ["system", "skills"] }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(skillListFixture);
    expect(calls).toContain("https://dsi.example.test/auth/xiaozhi-status");
  });

  it("exports methods through the same fail-closed whitelist", async () => {
    configureServerEnv();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://dsi.example.test/")) {
        return Response.json({ enabled: true, xiaozhiUrl: "" });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await PUT(
      new Request("https://agent-hub.example.test/api/work-skills/system/skills", {
        headers: { cookie: "dsi_app_session=sess-abc123" },
        method: "PUT",
      }),
      { params: Promise.resolve({ path: ["system", "skills"] }) },
    );

    expect(response.status).toBe(404);
    expect(
      fetchMock.mock.calls.every((call) =>
        String(call[0]).startsWith("https://dsi.example.test/"),
      ),
    ).toBe(true);
  });
});
