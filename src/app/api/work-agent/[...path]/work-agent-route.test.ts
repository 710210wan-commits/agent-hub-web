import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, PUT } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configureServerEnv() {
  vi.stubEnv("XIAOZHI_API_ORIGIN", "https://xiaozhi.example.test");
  vi.stubEnv("XIAOZHI_API_KEY", "yxkey_route-test-secret");
  vi.stubEnv("XIAOZHI_WORK_AGENT_SLUG", "office-agent");
}

describe("work-agent catch-all route", () => {
  it("awaits catch-all params and proxies an allowed request", async () => {
    configureServerEnv();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe(
        "https://xiaozhi.example.test/api/system/health",
      );
      return Response.json({ status: "ok" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(
        "https://agent-hub.example.test/api/work-agent/system/health",
      ),
      { params: Promise.resolve({ path: ["system", "health"] }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("exports methods through the same fail-closed whitelist", async () => {
    configureServerEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await PUT(
      new Request(
        "https://agent-hub.example.test/api/work-agent/agent/default",
        { method: "PUT" },
      ),
      { params: Promise.resolve({ path: ["agent", "default"] }) },
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
