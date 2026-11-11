import { describe, expect, it, vi } from "vitest";

import skillListFixture from "@/features/skills/work/fixtures/skill-list.json";

import {
  proxyWorkSkillsRequest,
  WORK_SKILLS_AUTH_TIMEOUT_MS,
  WORK_SKILLS_PROXY_TIMEOUT_MS,
} from "./skills-proxy";

const DSI_ORIGIN = "https://dsi.example.test";
const XIAOZHI_ORIGIN = "https://xiaozhi.example.test";
const API_KEY = "yxkey_skills-proxy-test-secret";
const SESSION_ID = "sess-abc123XYZ_~.-";

const ENV = {
  AGENT_API_ORIGIN: DSI_ORIGIN,
  XIAOZHI_API_ORIGIN: XIAOZHI_ORIGIN,
  XIAOZHI_API_KEY: API_KEY,
  XIAOZHI_WORK_AGENT_SLUG: "office-agent",
};

interface RecordedCall {
  input: string;
  init?: RequestInit;
}

function headerSnapshot(call: RecordedCall): Record<string, string> {
  const headers = new Headers(call.init?.headers);
  return Object.fromEntries(headers.entries());
}

function cookieHeaderOf(call: RecordedCall): string | null {
  return new Headers(call.init?.headers).get("cookie");
}

function sessionRequest(pathname: string, init: RequestInit = {}): Request {
  return new Request(`https://agent-hub.example.test/api/work-skills${pathname}`, {
    headers: { accept: "application/json", cookie: `dsi_app_session=${SESSION_ID}` },
    ...init,
  });
}

function jsonPost(pathname: string, payload: unknown): Request {
  return sessionRequest(pathname, {
    body: JSON.stringify(payload),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      cookie: `dsi_app_session=${SESSION_ID}`,
    },
    method: "POST",
  });
}

function okSession() {
  return Response.json({ enabled: true, xiaozhiUrl: "", user: { id: "op-001", displayName: "操作员" } });
}

interface FetchStubOptions {
  dsi?: (call: RecordedCall) => Promise<Response> | Response;
  upstream?: (call: RecordedCall) => Promise<Response> | Response;
}

function createFetchStub(options: FetchStubOptions) {
  const calls: RecordedCall[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call: RecordedCall = { input: String(input), init };
    calls.push(call);
    if (call.input.startsWith(`${DSI_ORIGIN}/`)) {
      if (!options.dsi) throw new Error(`unexpected DSI call: ${call.input}`);
      return options.dsi(call);
    }
    if (call.input.startsWith(`${XIAOZHI_ORIGIN}/`)) {
      if (!options.upstream) throw new Error(`unexpected upstream call: ${call.input}`);
      return options.upstream(call);
    }
    throw new Error(`unexpected fetch: ${call.input}`);
  });
  return { calls, fetchImpl };
}

describe("会话门禁（fail closed，先于读体与调上游）", () => {
  it("完整会话放行：上游仅收到服务端 API Key，Cookie 只发 DSI", async () => {
    const { calls, fetchImpl } = createFetchStub({
      dsi: (call) => {
        expect(call.input).toBe(`${DSI_ORIGIN}/auth/xiaozhi-status`);
        expect(cookieHeaderOf(call)).toBe(`dsi_app_session=${SESSION_ID}`);
        return okSession();
      },
      upstream: () => Response.json(skillListFixture),
    });

    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills"),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(skillListFixture);
    const upstreamCall = calls.find((call) => call.input.startsWith(XIAOZHI_ORIGIN));
    expect(upstreamCall).toBeDefined();
    const upstreamHeaders = headerSnapshot(upstreamCall!);
    expect(upstreamHeaders.authorization).toBe(`Bearer ${API_KEY}`);
    expect(upstreamHeaders.cookie).toBeUndefined();
    expect(upstreamHeaders.origin).toBeUndefined();
    expect(upstreamHeaders["x-forwarded-for"]).toBeUndefined();
  });

  it("缺少 dsi_app_session Cookie：401 且不调用 DSI 与上游", async () => {
    const { calls, fetchImpl } = createFetchStub({});
    const response = await proxyWorkSkillsRequest(
      new Request("https://agent-hub.example.test/api/work-skills/system/skills"),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "WORK_SKILLS_SESSION_REQUIRED" });
    expect(calls).toHaveLength(0);
  });

  it("Cookie 值非法（含 % 等字符）：401 且零调用", async () => {
    const { calls, fetchImpl } = createFetchStub({});
    const response = await proxyWorkSkillsRequest(
      new Request("https://agent-hub.example.test/api/work-skills/system/skills", {
        headers: { cookie: "dsi_app_session=bad%0Avalue" },
      }),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("anonymous / demo（enabled:false）：401 SESSION_INVALID，零上游请求", async () => {
    const { calls, fetchImpl } = createFetchStub({
      dsi: () => Response.json({ enabled: false, xiaozhiUrl: "" }),
      upstream: () => Response.json({}),
    });
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills"),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "WORK_SKILLS_SESSION_INVALID" });
    expect(calls.some((call) => call.input.startsWith(XIAOZHI_ORIGIN))).toBe(false);
  });

  it("DSI 返回 401/403：401 SESSION_INVALID，零上游请求", async () => {
    for (const status of [401, 403]) {
      const { calls, fetchImpl } = createFetchStub({
        dsi: () => new Response("unauthorized", { status }),
        upstream: () => Response.json({}),
      });
      const response = await proxyWorkSkillsRequest(
        sessionRequest("/system/skills"),
        ["system", "skills"],
        { env: ENV, fetchImpl },
      );
      expect(response.status).toBe(401);
      expect(calls.some((call) => call.input.startsWith(XIAOZHI_ORIGIN))).toBe(false);
    }
  });

  it("DSI 5xx：503 AUTH_UNAVAILABLE，零上游请求", async () => {
    const { calls, fetchImpl } = createFetchStub({
      dsi: () => new Response("boom", { status: 500 }),
      upstream: () => Response.json({}),
    });
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills"),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "WORK_SKILLS_AUTH_UNAVAILABLE" });
    expect(calls.some((call) => call.input.startsWith(XIAOZHI_ORIGIN))).toBe(false);
  });

  it("DSI 网络故障：503 AUTH_UNAVAILABLE，零上游请求", async () => {
    const { calls, fetchImpl } = createFetchStub({
      dsi: () => Promise.reject(new TypeError("fetch failed")),
      upstream: () => Response.json({}),
    });
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills"),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(503);
    expect(calls.some((call) => call.input.startsWith(XIAOZHI_ORIGIN))).toBe(false);
  });

  it("DSI 响应非 JSON：503 AUTH_UNAVAILABLE，零上游请求", async () => {
    const { calls, fetchImpl } = createFetchStub({
      dsi: () => new Response("<html>login</html>", { status: 200 }),
      upstream: () => Response.json({}),
    });
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills"),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(503);
    expect(calls.some((call) => call.input.startsWith(XIAOZHI_ORIGIN))).toBe(false);
  });

  it("DSI 校验超时：503，零上游请求", async () => {
    const { calls, fetchImpl } = createFetchStub({
      dsi: (call) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (call.init?.signal as AbortSignal | undefined) ?? null;
          if (signal?.aborted) {
            reject(new DOMException("aborted", "AbortError"));
            return;
          }
          signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    });
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills"),
      ["system", "skills"],
      { authTimeoutMs: 20, env: ENV, fetchImpl },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "WORK_SKILLS_AUTH_UNAVAILABLE" });
    expect(calls.some((call) => call.input.startsWith(XIAOZHI_ORIGIN))).toBe(false);
  });

  it("门禁先于上传体读取：无 Cookie 的 multipart 请求 401 且零调用", async () => {
    const { calls, fetchImpl } = createFetchStub({});
    const response = await proxyWorkSkillsRequest(
      new Request("https://agent-hub.example.test/api/work-skills/skills/import/prepare", {
        body: "------boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.zip\"\r\n\r\nPK\r\n------boundary--\r\n",
        headers: {
          "content-type": "multipart/form-data; boundary=----boundary",
          cookie: "other=1",
        },
        method: "POST",
      }),
      ["skills", "import", "prepare"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("写操作同样受门禁：DELETE 草稿无 Cookie 时 401 零调用", async () => {
    const { calls, fetchImpl } = createFetchStub({});
    const response = await proxyWorkSkillsRequest(
      new Request("https://agent-hub.example.test/api/work-skills/skills/install-drafts/d-1", {
        method: "DELETE",
      }),
      ["skills", "install-drafts", "d-1"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

describe("method/path/query 白名单", () => {
  function stubWithSession(upstream: FetchStubOptions["upstream"] = () => Response.json({ ok: true })) {
    return createFetchStub({ dsi: () => okSession(), upstream });
  }

  it.each([
    ["/system/skills/builtin", ["system", "skills", "builtin"], "GET"],
    ["/skills/accessible", ["skills", "accessible"], "POST"],
    ["/system/skills/foo/bar", ["system", "skills", "foo", "bar"], "GET"],
    ["/system/skills", ["system", "skills"], "DELETE"],
  ])("拒绝白名单外请求：%s %s", async (pathname, segments, method) => {
    const { calls, fetchImpl } = stubWithSession();
    const response = await proxyWorkSkillsRequest(
      sessionRequest(pathname, { method }),
      segments as string[],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "WORK_SKILLS_ROUTE_NOT_ALLOWED" });
    expect(calls.some((call) => call.input.startsWith(XIAOZHI_ORIGIN))).toBe(false);
  });

  it("拒绝未知 method（PATCH）", async () => {
    const { calls, fetchImpl } = stubWithSession();
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills/mysql-reporter/enabled", { method: "PATCH" }),
      ["system", "skills", "mysql-reporter", "enabled"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(404);
    expect(calls.some((call) => call.input.startsWith(XIAOZHI_ORIGIN))).toBe(false);
  });

  it.each([
    [["..", "tree"]],
    [[".", "tree"]],
    [["a/b", "tree"]],
    [["a\\b", "tree"]],
    [["a%2Fb", "tree"]],
    [["UPPER", "tree"]],
  ])("拒绝非法路径段：%o", async (segments) => {
    const { calls, fetchImpl } = stubWithSession();
    const response = await proxyWorkSkillsRequest(
      sessionRequest(`/${(segments as string[]).join("/")}`),
      segments as string[],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(404);
    expect(calls.some((call) => call.input.startsWith(XIAOZHI_ORIGIN))).toBe(false);
  });

  it("文件读取缺少 path 查询参数：404", async () => {
    const { calls, fetchImpl } = stubWithSession();
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills/mysql-reporter/file"),
      ["system", "skills", "mysql-reporter", "file"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(404);
    expect(calls.some((call) => call.input.startsWith(XIAOZHI_ORIGIN))).toBe(false);
  });

  it.each(["path=../SKILL.md", "path=a/./b", "path=a//b", "path=..", "path=SKILL.md&foo=1"])(
    "拒绝非法或多余查询：%s",
    async (query) => {
      const { calls, fetchImpl } = stubWithSession();
      const response = await proxyWorkSkillsRequest(
        sessionRequest(`/system/skills/mysql-reporter/file?${query}`),
        ["system", "skills", "mysql-reporter", "file"],
        { env: ENV, fetchImpl },
      );
      expect(response.status).toBe(404);
      expect(calls.some((call) => call.input.startsWith(XIAOZHI_ORIGIN))).toBe(false);
    },
  );

  it("文件读取透传编码后的 path 查询", async () => {
    const { calls, fetchImpl } = stubWithSession(() => Response.json({ success: true, data: { path: "scripts/query.py", content: "x" } }));
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills/mysql-reporter/file?path=scripts%2Fquery.py"),
      ["system", "skills", "mysql-reporter", "file"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(200);
    expect(calls.find((call) => call.input.startsWith(XIAOZHI_ORIGIN))?.input).toBe(
      `${XIAOZHI_ORIGIN}/api/system/skills/mysql-reporter/file?path=scripts%2Fquery.py`,
    );
  });

  it("dependency-options：slug 可选，但非法 slug 拒绝", async () => {
    const { fetchImpl } = stubWithSession(() =>
      Response.json({ success: true, data: { tools: [], mcps: [], skills: [] } }),
    );
    const withoutSlug = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills/dependency-options"),
      ["system", "skills", "dependency-options"],
      { env: ENV, fetchImpl },
    );
    expect(withoutSlug.status).toBe(200);
    const withSlug = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills/dependency-options?slug=mysql-reporter"),
      ["system", "skills", "dependency-options"],
      { env: ENV, fetchImpl },
    );
    expect(withSlug.status).toBe(200);

    const { calls: calls2, fetchImpl: fetchImpl2 } = stubWithSession();
    const badSlug = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills/dependency-options?slug=Bad_Slug"),
      ["system", "skills", "dependency-options"],
      { env: ENV, fetchImpl: fetchImpl2 },
    );
    expect(badSlug.status).toBe(404);
    expect(calls2.some((call) => call.input.startsWith(XIAOZHI_ORIGIN))).toBe(false);
  });

  it("列表接口拒绝任何查询参数", async () => {
    const { calls, fetchImpl } = stubWithSession();
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills?foo=1"),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(404);
    expect(calls.some((call) => call.input.startsWith(XIAOZHI_ORIGIN))).toBe(false);
  });

  it("安装草稿 confirm/cancel 仅允许白名单内 method 组合", async () => {
    const { fetchImpl } = stubWithSession(() => Response.json({ success: true }));
    const confirm = await proxyWorkSkillsRequest(
      jsonPost("/skills/install-drafts/d-1/confirm", { share_config: null }),
      ["skills", "install-drafts", "d-1", "confirm"],
      { env: ENV, fetchImpl },
    );
    expect(confirm.status).toBe(200);

    const { calls: calls2, fetchImpl: fetchImpl2 } = stubWithSession();
    const getConfirm = await proxyWorkSkillsRequest(
      sessionRequest("/skills/install-drafts/d-1/confirm"),
      ["skills", "install-drafts", "d-1", "confirm"],
      { env: ENV, fetchImpl: fetchImpl2 },
    );
    expect(getConfirm.status).toBe(404);
    expect(calls2.some((call) => call.input.startsWith(XIAOZHI_ORIGIN))).toBe(false);
  });
});

describe("请求头隔离", () => {
  it("浏览器私有凭据不转发上游，且 DSI 只收到 dsi_app_session", async () => {
    const { calls, fetchImpl } = createFetchStub({
      dsi: (call) => {
        expect(cookieHeaderOf(call)).toBe(`dsi_app_session=${SESSION_ID}`);
        return okSession();
      },
      upstream: () => Response.json(skillListFixture),
    });
    const response = await proxyWorkSkillsRequest(
      new Request("https://agent-hub.example.test/api/work-skills/system/skills", {
        headers: {
          accept: "application/json",
          authorization: "Bearer hacker-token",
          cookie: `other=1; dsi_app_session=${SESSION_ID}; tracker=2`,
          origin: "https://evil.example.test",
          referer: "https://evil.example.test/page",
          "x-forwarded-for": "1.2.3.4",
        },
      }),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(200);
    const upstreamCall = calls.find((call) => call.input.startsWith(XIAOZHI_ORIGIN));
    const upstreamHeaders = headerSnapshot(upstreamCall!);
    expect(upstreamHeaders).toEqual({
      accept: "application/json",
      authorization: `Bearer ${API_KEY}`,
    });
  });

  it("错误响应与日志不泄露 API Key 与 Cookie", async () => {
    const { fetchImpl } = createFetchStub({
      dsi: () => okSession(),
      upstream: () =>
        new Response(JSON.stringify({ detail: `invalid key ${API_KEY}` }), { status: 400 }),
    });
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills"),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );
    const body = await response.text();
    expect(response.status).toBe(400);
    expect(body).not.toContain(API_KEY);
    expect(body).not.toContain(SESSION_ID);
  });
});

describe("JSON、multipart、ZIP 与状态透传", () => {
  function stubOk(upstream: FetchStubOptions["upstream"]) {
    return createFetchStub({ dsi: () => okSession(), upstream });
  }

  it("JSON 请求体与响应原样透传", async () => {
    const upstreamPayload = { success: true, data: { draft_id: "d-1" } };
    const { calls, fetchImpl } = stubOk(() => Response.json(upstreamPayload));
    const requestPayload = { source: "anthropics/skills", skills: ["docx"] };
    const response = await proxyWorkSkillsRequest(
      jsonPost("/skills/remote/prepare", requestPayload),
      ["skills", "remote", "prepare"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(upstreamPayload);
    const upstreamCall = calls.find((call) => call.input.startsWith(XIAOZHI_ORIGIN));
    expect(await new Response(upstreamCall?.init?.body as BodyInit).text()).toBe(
      JSON.stringify(requestPayload),
    );
    expect(headerSnapshot(upstreamCall!)["content-type"]).toBe("application/json");
  });

  it("multipart 上传透传 boundary 与字节", async () => {
    const multipartBody =
      '------boundary\r\nContent-Disposition: form-data; name="file"; filename="a.zip"\r\n\r\nPK-bytes\r\n------boundary--\r\n';
    const { calls, fetchImpl } = stubOk(() => Response.json({ success: true, data: { draft_id: "d-2" } }));
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/skills/import/prepare", {
        body: multipartBody,
        headers: {
          accept: "application/json",
          "content-type": "multipart/form-data; boundary=----boundary",
          cookie: `dsi_app_session=${SESSION_ID}`,
        },
        method: "POST",
      }),
      ["skills", "import", "prepare"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(200);
    const upstreamCall = calls.find((call) => call.input.startsWith(XIAOZHI_ORIGIN));
    expect(headerSnapshot(upstreamCall!)["content-type"]).toBe(
      "multipart/form-data; boundary=----boundary",
    );
    expect(await new Response(upstreamCall?.init?.body as BodyInit).text()).toBe(multipartBody);
  });

  it("ZIP 导出流式透传状态、安全头与字节", async () => {
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
    const { fetchImpl } = stubOk(
      () =>
        new Response(zipBytes, {
          headers: {
            "content-disposition": 'attachment; filename="mysql-reporter.zip"',
            "content-type": "application/zip",
            "x-request-id": "req-1",
          },
          status: 200,
        }),
    );
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills/mysql-reporter/export"),
      ["system", "skills", "mysql-reporter", "export"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="mysql-reporter.zip"');
    expect(response.headers.get("x-request-id")).toBe("req-1");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(zipBytes);
  });

  it("204 空响应透传", async () => {
    const { fetchImpl } = stubOk(() => new Response(null, { status: 204 }));
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/skills/install-drafts/d-1", { method: "DELETE" }),
      ["skills", "install-drafts", "d-1"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("上游 4xx 提取 detail 归一化，no-store，保留状态码", async () => {
    const { fetchImpl } = stubOk(
      () =>
        new Response(JSON.stringify({ detail: "仅支持上传 .zip 或 SKILL.md 文件" }), {
          headers: { "content-type": "application/json" },
          status: 400,
        }),
    );
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills"),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      code: "WORK_SKILLS_UPSTREAM_ERROR",
      error: "仅支持上传 .zip 或 SKILL.md 文件",
    });
  });

  it("上游 5xx 不泄露上游 detail，返回通用文案", async () => {
    const { fetchImpl } = stubOk(
      () =>
        new Response(JSON.stringify({ detail: "Internal Server Error: /var/secret/path" }), {
          status: 500,
        }),
    );
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills"),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain("/var/secret/path");
    expect(JSON.parse(body)).toMatchObject({ code: "WORK_SKILLS_UPSTREAM_ERROR" });
  });

  it("上游 429/503 的 retry-after 透传到错误响应", async () => {
    const { fetchImpl } = stubOk(
      () => new Response("busy", { headers: { "retry-after": "30" }, status: 503 }),
    );
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills"),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
  });

  it("上游故障：502 UPSTREAM_UNAVAILABLE", async () => {
    const { fetchImpl } = createFetchStub({
      dsi: () => okSession(),
      upstream: () => Promise.reject(new TypeError("connect ECONNREFUSED")),
    });
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills"),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "WORK_SKILLS_UPSTREAM_UNAVAILABLE" });
  });
});

describe("取消与超时", () => {
  it("客户端取消会中止上游请求", async () => {
    const controller = new AbortController();
    const { fetchImpl } = createFetchStub({
      dsi: () => okSession(),
      upstream: (call) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (call.init?.signal as AbortSignal | undefined) ?? null;
          if (signal?.aborted) {
            reject(new DOMException("aborted", "AbortError"));
            return;
          }
          signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    });
    const promise = proxyWorkSkillsRequest(
      new Request("https://agent-hub.example.test/api/work-skills/system/skills", {
        headers: { cookie: `dsi_app_session=${SESSION_ID}` },
        signal: controller.signal,
      }),
      ["system", "skills"],
      { env: ENV, fetchImpl },
    );
    controller.abort();
    const response = await promise;
    expect(response.status).toBe(499);
    expect(await response.json()).toMatchObject({ code: "WORK_SKILLS_CLIENT_ABORTED" });
  });

  it("上游超时：504 UPSTREAM_TIMEOUT 并中止上游", async () => {
    const { fetchImpl } = createFetchStub({
      dsi: () => okSession(),
      upstream: (call) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (call.init?.signal as AbortSignal | undefined) ?? null;
          if (signal?.aborted) {
            reject(new DOMException("aborted", "AbortError"));
            return;
          }
          signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    });
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills"),
      ["system", "skills"],
      { env: ENV, fetchImpl, timeoutMs: 20 },
    );
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ code: "WORK_SKILLS_UPSTREAM_TIMEOUT" });
  });

  it("默认超时常量冻结", () => {
    expect(WORK_SKILLS_PROXY_TIMEOUT_MS).toBe(60000);
    expect(WORK_SKILLS_AUTH_TIMEOUT_MS).toBe(8000);
  });
});

describe("配置", () => {
  it("缺少 XIAOZHI_API_KEY：500 CONFIG_INVALID 且零调用", async () => {
    const { calls, fetchImpl } = createFetchStub({});
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills"),
      ["system", "skills"],
      { env: { ...ENV, XIAOZHI_API_KEY: "" }, fetchImpl },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "WORK_SKILLS_CONFIG_INVALID" });
    expect(calls).toHaveLength(0);
  });

  it("缺少 AGENT_API_ORIGIN：500 CONFIG_INVALID 且零调用", async () => {
    const { calls, fetchImpl } = createFetchStub({});
    const response = await proxyWorkSkillsRequest(
      sessionRequest("/system/skills"),
      ["system", "skills"],
      { env: { ...ENV, AGENT_API_ORIGIN: "" }, fetchImpl },
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "WORK_SKILLS_CONFIG_INVALID" });
    expect(calls).toHaveLength(0);
  });
});
