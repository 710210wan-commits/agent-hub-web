import { describe, expect, it, vi } from "vitest";

import { SKILL_MARKET_PRINCIPAL_HEADERS } from "@/config/skill-market-principal";
import { proxySkillMarketRequest } from "./gateway";

const gatewayEnv = {
  SKILL_MARKET_DAILY_ORIGIN: "https://daily-agent.example.test",
  SKILL_MARKET_GATEWAY_HMAC_SECRET:
    "phase-one-test-gateway-secret-with-32-characters",
  SKILL_MARKET_PRINCIPAL_ID: "agent-hub-operator",
  SKILL_MARKET_PRINCIPAL_MANAGED_SCENARIOS: "daily",
  SKILL_MARKET_PRINCIPAL_PERMISSIONS: "tool:Read",
  SKILL_MARKET_PRINCIPAL_ROLES: "admin,author,reviewer,scenario_admin",
};

describe("proxySkillMarketRequest", () => {
  it("streams a JSON request, signs the final URL, and strips client authority", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://daily-agent.example.test/api/skill-market/creator/generate?scenarioId=daily",
      );
      const headers = new Headers(init?.headers);
      expect(init?.cache).toBe("no-store");
      expect(init?.redirect).toBe("manual");
      expect(headers.get("content-type")).toBe("application/json");
      expect(headers.get("host")).toBeNull();
      expect(headers.get("origin")).toBeNull();
      expect(headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.id)).toBe("agent-hub-operator");
      expect(headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.roles)).toBe(
        "admin,author,reviewer,scenario_admin",
      );
      expect(headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.signature)).toMatch(
        /^[a-f0-9]{64}$/,
      );
      expect(await new Response(init?.body).text()).toBe('{"name":"sample"}');
      return new Response('{"ok":true}', {
        status: 201,
        headers: {
          connection: "keep-alive",
          "content-type": "application/json",
          server: "private-upstream",
          "x-request-id": "request-1",
        },
      });
    });
    const request = new Request(
      "https://agent-hub.example.test/api/skill-market/creator/generate?mode=daily&scenarioId=daily",
      {
        method: "POST",
        body: '{"name":"sample"}',
        headers: {
          "content-type": "application/json",
          host: "attacker.example.test",
          origin: "https://attacker.example.test",
          [SKILL_MARKET_PRINCIPAL_HEADERS.id]: "attacker",
          [SKILL_MARKET_PRINCIPAL_HEADERS.roles]: "admin",
        },
      },
    );

    const response = await proxySkillMarketRequest(request, ["creator", "generate"], {
      env: gatewayEnv,
      fetchImpl: fetchMock as typeof fetch,
      now: () => Date.parse("2026-10-09T08:00:00.000Z"),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-request-id")).toBe("request-1");
    expect(response.headers.get("connection")).toBeNull();
    expect(response.headers.get("server")).toBeNull();
  });

  it("does not call upstream for work, illegal mode, or target override", async () => {
    const fetchMock = vi.fn();
    for (const url of [
      "https://agent-hub.example.test/api/skill-market/catalog?mode=work",
      "https://agent-hub.example.test/api/skill-market/catalog?mode=office",
      "https://agent-hub.example.test/api/skill-market/catalog?mode=daily&origin=https://attacker.example.test",
    ]) {
      const response = await proxySkillMarketRequest(new Request(url), ["catalog"], {
        env: gatewayEnv,
        fetchImpl: fetchMock as typeof fetch,
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves an empty 204 response", async () => {
    const response = await proxySkillMarketRequest(
      new Request(
        "https://agent-hub.example.test/api/skill-market/drafts/draft-1?mode=daily",
        { method: "DELETE" },
      ),
      ["drafts", "draft-1"],
      { env: gatewayEnv, fetchImpl: vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch },
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it.each([400, 401, 403, 404, 409, 422, 500])(
    "preserves an upstream %s JSON response",
    async (status) => {
      const response = await proxySkillMarketRequest(
        new Request("https://agent-hub.example.test/api/skill-market/catalog?mode=daily"),
        ["catalog"],
        {
          env: gatewayEnv,
          fetchImpl: vi.fn(async () =>
            new Response('{"error":"upstream"}', {
              status,
              headers: { "content-type": "application/json" },
            })) as typeof fetch,
        },
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "upstream" });
    },
  );

  it("streams ZIP bytes and preserves only approved download headers", async () => {
    let upstreamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        upstreamController = controller;
        controller.enqueue(new Uint8Array([80, 75, 3, 4]));
      },
    });
    const response = await proxySkillMarketRequest(
      new Request(
        "https://agent-hub.example.test/api/skill-market/publications/pub-1/download?mode=daily",
      ),
      ["publications", "pub-1", "download"],
      {
        env: gatewayEnv,
        fetchImpl: vi.fn(async () =>
          new Response(body, {
            headers: {
              "content-disposition": 'attachment; filename="skill-r1.zip"',
              "content-length": "7",
              "content-type": "application/zip",
              "set-cookie": "private=1",
              "x-content-sha256": "a".repeat(64),
            },
          })) as typeof fetch,
      },
    );

    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain("skill-r1.zip");
    expect(response.headers.get("content-length")).toBe("7");
    expect(response.headers.get("x-content-sha256")).toBe("a".repeat(64));
    expect(response.headers.get("set-cookie")).toBeNull();
    const reader = response.body?.getReader();
    expect((await reader?.read())?.value).toEqual(new Uint8Array([80, 75, 3, 4]));
    upstreamController?.enqueue(new Uint8Array([1, 2, 3]));
    upstreamController?.close();
    expect((await reader?.read())?.value).toEqual(new Uint8Array([1, 2, 3]));
    expect((await reader?.read())?.done).toBe(true);
  });

  it("returns a stable 504 without leaking the upstream on timeout", async () => {
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
    );
    const response = await proxySkillMarketRequest(
      new Request("https://agent-hub.example.test/api/skill-market/catalog?mode=daily"),
      ["catalog"],
      { env: gatewayEnv, fetchImpl: fetchMock as typeof fetch, timeoutMs: 5 },
    );
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({
      code: "SKILL_MARKET_UPSTREAM_TIMEOUT",
      error: "Skill Market upstream timed out.",
    });
  });

  it("propagates client cancellation to upstream", async () => {
    const controller = new AbortController();
    let upstreamAborted = false;
    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          upstreamAborted = true;
          reject(init.signal?.reason);
        });
      }),
    );
    const pending = proxySkillMarketRequest(
      new Request("https://agent-hub.example.test/api/skill-market/catalog?mode=daily", {
        signal: controller.signal,
      }),
      ["catalog"],
      { env: gatewayEnv, fetchImpl: fetchMock as typeof fetch, timeoutMs: 10_000 },
    );
    controller.abort();
    const response = await pending;
    expect(upstreamAborted).toBe(true);
    expect(response.status).toBe(499);
    expect(await response.json()).toEqual({
      code: "SKILL_MARKET_CLIENT_CLOSED_REQUEST",
      error: "Skill Market request was cancelled.",
    });
  });

  it("returns a stable 502 when the backend is unavailable", async () => {
    const response = await proxySkillMarketRequest(
      new Request("https://agent-hub.example.test/api/skill-market/catalog?mode=daily"),
      ["catalog"],
      {
        env: gatewayEnv,
        fetchImpl: vi.fn(async () => {
          throw new TypeError("connect ECONNREFUSED 10.0.0.8");
        }) as typeof fetch,
      },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      code: "SKILL_MARKET_UPSTREAM_UNAVAILABLE",
      error: "Skill Market upstream is unavailable.",
    });
  });

  it("audits only allowlisted metadata and redacts exceptional details", async () => {
    const secret = gatewayEnv.SKILL_MARKET_GATEWAY_HMAC_SECRET;
    const origin = gatewayEnv.SKILL_MARKET_DAILY_ORIGIN;
    const upload = "full-prompt-and-upload-canary";
    const audit = vi.fn();
    const auditNow = vi.fn()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_012);
    const response = await proxySkillMarketRequest(
      new Request(
        "https://agent-hub.example.test/api/skill-market/creator/generate?mode=daily",
        { method: "POST", body: upload },
      ),
      ["creator", "generate"],
      {
        audit,
        auditNow,
        env: gatewayEnv,
        fetchImpl: vi.fn(async () => {
          throw new Error(`${secret} ${origin} ${upload}\nprivate stack`);
        }) as typeof fetch,
      },
    );

    expect(response.status).toBe(502);
    expect(audit).toHaveBeenCalledWith({
      durationMs: 12,
      method: "POST",
      path: "/api/skill-market/creator/generate",
      status: 502,
    });
    const observable = `${await response.text()}${JSON.stringify(audit.mock.calls)}`;
    for (const sensitive of [secret, origin, upload, "private stack"]) {
      expect(observable).not.toContain(sensitive);
    }
  });

  it("keeps only a safe upstream request ID in the response and audit event", async () => {
    const audit = vi.fn();
    const response = await proxySkillMarketRequest(
      new Request("https://agent-hub.example.test/api/skill-market/catalog?mode=daily"),
      ["catalog"],
      {
        audit,
        env: gatewayEnv,
        fetchImpl: vi.fn(async () => new Response("[]", {
          headers: { "content-type": "application/json", "x-request-id": "request-safe_42" },
        })) as typeof fetch,
      },
    );

    expect(response.headers.get("x-request-id")).toBe("request-safe_42");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ requestId: "request-safe_42" }));
  });

  it("drops an unsafe upstream request ID from the response and audit event", async () => {
    const audit = vi.fn();
    const leakedRequestId = `${gatewayEnv.SKILL_MARKET_GATEWAY_HMAC_SECRET}@private-origin`;
    const response = await proxySkillMarketRequest(
      new Request("https://agent-hub.example.test/api/skill-market/catalog?mode=daily"),
      ["catalog"],
      {
        audit,
        env: gatewayEnv,
        fetchImpl: vi.fn(async () => new Response("[]", {
          headers: { "content-type": "application/json", "x-request-id": leakedRequestId },
        })) as typeof fetch,
      },
    );

    expect(response.headers.get("x-request-id")).toBeNull();
    expect(JSON.stringify(audit.mock.calls)).not.toContain(leakedRequestId);
    expect(audit).toHaveBeenCalledWith(expect.not.objectContaining({ requestId: expect.anything() }));
  });
});
