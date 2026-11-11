import { afterEach, describe, expect, it, vi } from "vitest";

import {
  KbApiError,
  listKbDatabases,
  setKbUnauthorizedHandler,
} from "./kb-api";

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

describe("kb-api 401 钩子（统一登录收口）", () => {
  afterEach(() => {
    setKbUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  it("接口返回 401 时触发已注册的钩子", async () => {
    mockFetchOnce(401, { error: "DSI session required" });
    const handler = vi.fn();
    setKbUnauthorizedHandler(handler);

    await expect(listKbDatabases()).rejects.toMatchObject({
      kind: "unauthorized",
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("非 401 错误不触发钩子", async () => {
    mockFetchOnce(500, { code: 500, message: "boom", data: null });
    const handler = vi.fn();
    setKbUnauthorizedHandler(handler);

    await expect(listKbDatabases()).rejects.toBeInstanceOf(KbApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it("未注册钩子时 401 正常抛错，不影响调用方", async () => {
    mockFetchOnce(401, { error: "DSI session required" });

    await expect(listKbDatabases()).rejects.toMatchObject({
      kind: "unauthorized",
      status: 401,
    });
  });

  it("钩子置空后不再触发", async () => {
    const handler = vi.fn();
    setKbUnauthorizedHandler(handler);
    setKbUnauthorizedHandler(null);
    mockFetchOnce(401, { error: "DSI session required" });

    await expect(listKbDatabases()).rejects.toMatchObject({
      kind: "unauthorized",
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
