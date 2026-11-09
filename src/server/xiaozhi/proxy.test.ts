import { describe, expect, it, vi } from "vitest";

import { resolvePublicRuntimeConfig } from "@/config/env";
import { resolveXiaozhiServerConfig } from "./config";
import {
  isAllowedWorkAgentRequest,
  proxyWorkAgentRequest,
} from "./proxy";

const serverEnv = {
  XIAOZHI_API_ORIGIN: "https://xiaozhi.example.test",
  XIAOZHI_API_KEY: "yxkey_test-secret-value",
  XIAOZHI_WORK_AGENT_SLUG: "office-agent",
};

describe("resolveXiaozhiServerConfig", () => {
  it.each([
    "XIAOZHI_API_ORIGIN",
    "XIAOZHI_API_KEY",
    "XIAOZHI_WORK_AGENT_SLUG",
  ] as const)("rejects missing %s", (name) => {
    const env: Record<string, string | undefined> = { ...serverEnv };
    delete env[name];

    expect(() => resolveXiaozhiServerConfig(env)).toThrow(name);
  });

  it("rejects non-http origins, credentials, paths, and empty slugs", () => {
    expect(() =>
      resolveXiaozhiServerConfig({
        ...serverEnv,
        XIAOZHI_API_ORIGIN: "ftp://xiaozhi.example.test",
      }),
    ).toThrow("HTTP(S)");
    expect(() =>
      resolveXiaozhiServerConfig({
        ...serverEnv,
        XIAOZHI_API_ORIGIN: "https://user:pass@xiaozhi.example.test/private",
      }),
    ).toThrow("origin");
    expect(() =>
      resolveXiaozhiServerConfig({
        ...serverEnv,
        XIAOZHI_WORK_AGENT_SLUG: "   ",
      }),
    ).toThrow("XIAOZHI_WORK_AGENT_SLUG");
  });

  it("rejects public or non-yxkey credentials and keeps public runtime config key-free", () => {
    expect(() =>
      resolveXiaozhiServerConfig({
        XIAOZHI_API_ORIGIN: serverEnv.XIAOZHI_API_ORIGIN,
        NEXT_PUBLIC_XIAOZHI_API_KEY: serverEnv.XIAOZHI_API_KEY,
        XIAOZHI_WORK_AGENT_SLUG: serverEnv.XIAOZHI_WORK_AGENT_SLUG,
      }),
    ).toThrow("XIAOZHI_API_KEY");
    expect(() =>
      resolveXiaozhiServerConfig({
        ...serverEnv,
        XIAOZHI_API_KEY: "not-a-xiaozhi-key",
      }),
    ).toThrow("yxkey_");

    const publicConfig = resolvePublicRuntimeConfig({
      NODE_ENV: "development",
      NEXT_PUBLIC_CHAT_TRANSPORT: "mock",
      NEXT_PUBLIC_LEGACY_FRONTEND_URL: "http://localhost:5000",
    });
    expect(JSON.stringify(publicConfig)).not.toContain("yxkey_");
    expect(publicConfig).not.toHaveProperty("apiKey");
  });

  it("returns a normalized server-only config", () => {
    const config = resolveXiaozhiServerConfig(serverEnv);

    expect(config.origin.href).toBe("https://xiaozhi.example.test/");
    expect(config.apiKey).toBe(serverEnv.XIAOZHI_API_KEY);
    expect(config.agentSlug).toBe("office-agent");
  });
});

describe("isAllowedWorkAgentRequest", () => {
  it.each([
    ["GET", "/api/system/health"],
    ["GET", "/api/agent/default"],
    ["POST", "/api/chat/thread"],
    ["GET", "/api/chat/threads"],
    ["GET", "/api/chat/thread/thread-1/history"],
    ["POST", "/api/agent/runs"],
    ["GET", "/api/agent/runs/run-1/events"],
    ["GET", "/api/agent/runs/run-1/result"],
    ["POST", "/api/agent/runs/run-1/cancel"],
  ])("allows %s %s", (method, path) => {
    expect(isAllowedWorkAgentRequest(method, path)).toBe(true);
  });

  it.each([
    ["POST", "/api/auth/token"],
    ["GET", "/api/users"],
    ["GET", "/api/system/model-providers"],
    ["DELETE", "/api/chat/thread/thread-1"],
    ["PUT", "/api/agent/default"],
    ["GET", "/api/chat/thread/thread-1/history/extra"],
    ["GET", "/api/agent/runs/../events"],
    ["GET", "/api/agent/runs/%2e%2e/events"],
  ])("rejects %s %s", (method, path) => {
    expect(isAllowedWorkAgentRequest(method, path)).toBe(false);
  });
});

describe("proxyWorkAgentRequest", () => {
  it("drops browser authority and injects only the server API key", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://xiaozhi.example.test/api/system/health");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(
        `Bearer ${serverEnv.XIAOZHI_API_KEY}`,
      );
      expect(headers.get("cookie")).toBeNull();
      expect(headers.get("host")).toBeNull();
      expect(headers.get("origin")).toBeNull();
      expect(headers.get("x-client-header")).toBeNull();
      return Response.json({ status: "ok" });
    });
    const request = new Request(
      "https://agent-hub.example.test/api/work-agent/system/health",
      {
        headers: {
          authorization: "Bearer browser-token",
          cookie: "session=browser-secret",
          host: "attacker.example.test",
          origin: "https://attacker.example.test",
          "x-client-header": "untrusted",
        },
      },
    );

    const response = await proxyWorkAgentRequest(request, ["system", "health"], {
      env: serverEnv,
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("forces the configured agent on thread and run creation", async () => {
    const upstreamBodies: unknown[] = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      upstreamBodies.push(await new Response(init?.body).json());
      return Response.json({ ok: true });
    });

    await proxyWorkAgentRequest(
      new Request("https://agent-hub.example.test/api/work-agent/chat/thread", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "新会话", agent_id: "attacker-agent" }),
      }),
      ["chat", "thread"],
      { env: serverEnv, fetchImpl: fetchMock as typeof fetch },
    );
    await proxyWorkAgentRequest(
      new Request("https://agent-hub.example.test/api/work-agent/agent/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: "hello",
          thread_id: "thread-1",
          agent_slug: "attacker-agent",
        }),
      }),
      ["agent", "runs"],
      { env: serverEnv, fetchImpl: fetchMock as typeof fetch },
    );

    expect(upstreamBodies).toEqual([
      { title: "新会话", agent_id: "office-agent" },
      {
        query: "hello",
        thread_id: "thread-1",
        agent_slug: "office-agent",
      },
    ]);
  });

  it("forces the configured agent on thread list and compact mode on SSE", async () => {
    const targets: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      targets.push(String(input));
      return Response.json([]);
    });

    await proxyWorkAgentRequest(
      new Request(
        "https://agent-hub.example.test/api/work-agent/chat/threads?agent_id=attacker&limit=20",
      ),
      ["chat", "threads"],
      { env: serverEnv, fetchImpl: fetchMock as typeof fetch },
    );
    await proxyWorkAgentRequest(
      new Request(
        "https://agent-hub.example.test/api/work-agent/agent/runs/run-1/events?after_seq=12-0&verbose=true",
      ),
      ["agent", "runs", "run-1", "events"],
      { env: serverEnv, fetchImpl: fetchMock as typeof fetch },
    );

    const [threadsTarget, eventsTarget] = targets.map((target) => new URL(target));
    expect(threadsTarget.pathname).toBe("/api/chat/threads");
    expect(Object.fromEntries(threadsTarget.searchParams)).toEqual({
      agent_id: "office-agent",
      limit: "20",
    });
    expect(eventsTarget.pathname).toBe("/api/agent/runs/run-1/events");
    expect(Object.fromEntries(eventsTarget.searchParams)).toEqual({
      after_seq: "12-0",
      verbose: "false",
    });
  });

  it("streams SSE bytes and strips hop-by-hop or private response headers", async () => {
    const encoder = new TextEncoder();
    const upstreamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: messages\n"));
        controller.enqueue(encoder.encode('data: {"ok":true}\n\n'));
        controller.close();
      },
    });
    const response = await proxyWorkAgentRequest(
      new Request(
        "https://agent-hub.example.test/api/work-agent/agent/runs/run-1/events",
      ),
      ["agent", "runs", "run-1", "events"],
      {
        env: serverEnv,
        fetchImpl: vi.fn(async () =>
          new Response(upstreamBody, {
            headers: {
              connection: "keep-alive",
              "content-type": "text/event-stream; charset=utf-8",
              "set-cookie": "private=1",
              "transfer-encoding": "chunked",
              "x-request-id": "request-1",
            },
          })) as typeof fetch,
      },
    );

    expect(await response.text()).toBe(
      'event: messages\ndata: {"ok":true}\n\n',
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-request-id")).toBe("request-1");
    expect(response.headers.get("connection")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("transfer-encoding")).toBeNull();
  });

  it("fails closed for blocked paths and malformed JSON without calling upstream", async () => {
    const fetchMock = vi.fn();
    const blocked = await proxyWorkAgentRequest(
      new Request("https://agent-hub.example.test/api/work-agent/auth/token", {
        method: "POST",
      }),
      ["auth", "token"],
      { env: serverEnv, fetchImpl: fetchMock as typeof fetch },
    );
    const malformed = await proxyWorkAgentRequest(
      new Request("https://agent-hub.example.test/api/work-agent/chat/thread", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
      ["chat", "thread"],
      { env: serverEnv, fetchImpl: fetchMock as typeof fetch },
    );
    const traversal = await proxyWorkAgentRequest(
      new Request(
        "https://agent-hub.example.test/api/work-agent/agent/runs/../events",
      ),
      ["agent", "runs", "..", "events"],
      { env: serverEnv, fetchImpl: fetchMock as typeof fetch },
    );

    expect(blocked.status).toBe(404);
    expect(malformed.status).toBe(400);
    expect(traversal.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 422, 500])(
    "preserves upstream %s status without echoing either authorization value",
    async (status) => {
      const browserAuthorization = "Bearer browser-token";
      const response = await proxyWorkAgentRequest(
        new Request(
          "https://agent-hub.example.test/api/work-agent/agent/default",
          { headers: { authorization: browserAuthorization } },
        ),
        ["agent", "default"],
        {
          env: serverEnv,
          fetchImpl: vi.fn(async () =>
            new Response(
              JSON.stringify({
                authorization: browserAuthorization,
                upstreamAuthorization: `Bearer ${serverEnv.XIAOZHI_API_KEY}`,
              }),
              { status, headers: { "content-type": "application/json" } },
            )) as typeof fetch,
        },
      );
      const text = await response.text();

      expect(response.status).toBe(status);
      expect(text).not.toContain(browserAuthorization);
      expect(text).not.toContain(serverEnv.XIAOZHI_API_KEY);
    },
  );

  it("returns a stable config or network error without leaking secrets", async () => {
    const badConfig = await proxyWorkAgentRequest(
      new Request("https://agent-hub.example.test/api/work-agent/agent/default"),
      ["agent", "default"],
      { env: {}, fetchImpl: vi.fn() as typeof fetch },
    );
    const unavailable = await proxyWorkAgentRequest(
      new Request("https://agent-hub.example.test/api/work-agent/agent/default"),
      ["agent", "default"],
      {
        env: serverEnv,
        fetchImpl: vi.fn(async () => {
          throw new Error(`connect failed with ${serverEnv.XIAOZHI_API_KEY}`);
        }) as typeof fetch,
      },
    );

    expect(badConfig.status).toBe(500);
    expect(unavailable.status).toBe(502);
    expect(await unavailable.text()).not.toContain(serverEnv.XIAOZHI_API_KEY);
  });
});
