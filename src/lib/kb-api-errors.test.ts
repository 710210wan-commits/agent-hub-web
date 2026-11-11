import { afterEach, describe, expect, it, vi } from "vitest";

import { KbApiError, listKbDatabases } from "./kb-api";

/**
 * 知识库错误分类测试（契约：DSI api/src/modules/kb/_shared.ts）。
 *
 * 错误信封（4xx/5xx）：{ code, message, data: null, details }
 * - 503 功能未启用：details.kbUnavailable === true
 * - 5xx：message 带 "[kind] " 前缀，前缀后为可读原因
 * - 4xx 透传：message 为可读原因
 * - 401（requireDsiSession）：{ error: string }，不带信封
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubJsonResponse(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

describe("kb-api 错误分类（新信封 { code, message, data, details }）", () => {
  it("401 → unauthorized（认证失败响应为 { error }，不带信封）", async () => {
    stubJsonResponse(401, { error: "AUTH_REQUIRED" });
    const error = await listKbDatabases().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KbApiError);
    expect((error as KbApiError).kind).toBe("unauthorized");
  });

  it("503 + details.kbUnavailable → kbUnavailable", async () => {
    stubJsonResponse(503, {
      code: 503,
      message: "知识库功能未启用（DSI_KB_ENABLED=false）",
      data: null,
      details: { kbUnavailable: true },
    });
    const error = await listKbDatabases().catch((e: unknown) => e);
    expect((error as KbApiError).kind).toBe("kbUnavailable");
  });

  it("502 透出 [kind] 前缀后的可读原因", async () => {
    stubJsonResponse(502, {
      code: 502,
      message: "[config] 嵌入模型未配置凭证",
      data: null,
      details: null,
    });
    const error = (await listKbDatabases().catch((e: unknown) => e)) as KbApiError;
    expect(error.kind).toBe("unavailable");
    expect(error.message).toContain("嵌入模型未配置凭证");
    expect(error.message).not.toContain("[config]");
  });

  it("504 → unavailable", async () => {
    stubJsonResponse(504, {
      code: 504,
      message: "[timeout] 上游响应超时",
      data: null,
      details: null,
    });
    const error = (await listKbDatabases().catch((e: unknown) => e)) as KbApiError;
    expect(error.kind).toBe("unavailable");
    expect(error.message).toContain("上游响应超时");
  });

  it("404 → notFound", async () => {
    stubJsonResponse(404, {
      code: 404,
      message: "知识库不存在",
      data: null,
      details: null,
    });
    const error = await listKbDatabases().catch((e: unknown) => e);
    expect((error as KbApiError).kind).toBe("notFound");
  });

  it("400 → badRequest 并透出 message", async () => {
    stubJsonResponse(400, {
      code: 400,
      message: "page 必须为正整数",
      data: null,
      details: null,
    });
    const error = (await listKbDatabases().catch((e: unknown) => e)) as KbApiError;
    expect(error.kind).toBe("badRequest");
    expect(error.message).toBe("page 必须为正整数");
  });

  it("409 透传原因（如重名建库）归入 unknown 但保留文案", async () => {
    stubJsonResponse(409, {
      code: 409,
      message: "同名知识库已存在",
      data: null,
      details: null,
    });
    const error = (await listKbDatabases().catch((e: unknown) => e)) as KbApiError;
    expect(error.kind).toBe("unknown");
    expect(error.message).toBe("同名知识库已存在");
  });

  it("网络异常 → network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const error = await listKbDatabases().catch((e: unknown) => e);
    expect((error as KbApiError).kind).toBe("network");
  });

  it("非 JSON 错误响应也能按状态码分类", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Bad Gateway", { status: 502 })),
    );
    const error = (await listKbDatabases().catch((e: unknown) => e)) as KbApiError;
    expect(error.kind).toBe("unavailable");
  });
});
