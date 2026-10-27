import { describe, expect, it } from "vitest";

import { resolvePublicRuntimeConfig } from "./env";

describe("resolvePublicRuntimeConfig", () => {
  it("defaults development to mock", () => {
    expect(resolvePublicRuntimeConfig({ NODE_ENV: "development" })).toEqual({
      transport: "mock",
      apiBaseUrl: "/agent-api",
    });
  });

  it("accepts projects-new with a same-origin base URL", () => {
    expect(
      resolvePublicRuntimeConfig({
        NODE_ENV: "development",
        NEXT_PUBLIC_CHAT_TRANSPORT: "projects-new",
        NEXT_PUBLIC_AGENT_API_BASE: "/agent-api",
      }),
    ).toEqual({
      transport: "projects-new",
      apiBaseUrl: "/agent-api",
    });
  });

  it("rejects mock when NODE_ENV is production", () => {
    expect(() =>
      resolvePublicRuntimeConfig({
        NODE_ENV: "production",
        NEXT_PUBLIC_CHAT_TRANSPORT: "mock",
      }),
    ).toThrow("生产环境禁止使用 mock transport");
  });

  it("rejects an absolute cross-origin browser API URL", () => {
    expect(() =>
      resolvePublicRuntimeConfig({
        NODE_ENV: "development",
        NEXT_PUBLIC_CHAT_TRANSPORT: "projects-new",
        NEXT_PUBLIC_AGENT_API_BASE: "https://api.example.com",
      }),
    ).toThrow("API 地址必须是同源路径");
  });
});
