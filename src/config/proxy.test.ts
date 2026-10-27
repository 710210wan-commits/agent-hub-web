import { describe, expect, it } from "vitest";

import { resolvePublicRuntimeConfig } from "./env";
import { resolveAgentApiRewrites } from "./proxy";

describe("resolveAgentApiRewrites", () => {
  it("builds the same-origin browser proxy from the server-only upstream", () => {
    expect(
      resolveAgentApiRewrites({ AGENT_API_ORIGIN: "http://127.0.0.1:8000/" }),
    ).toEqual([
      {
        source: "/agent-api/:path*",
        destination: "http://127.0.0.1:8000/:path*",
      },
    ]);
  });

  it("does not accept a public variable as the private upstream", () => {
    expect(
      resolveAgentApiRewrites({
        NEXT_PUBLIC_AGENT_API_BASE: "https://should-not-be-used.example.com",
      }),
    ).toEqual([]);
  });

  it("keeps production browser config same-origin and rejects mock", () => {
    expect(() =>
      resolvePublicRuntimeConfig({
        NODE_ENV: "production",
        NEXT_PUBLIC_CHAT_TRANSPORT: "mock",
      }),
    ).toThrow("生产环境禁止使用 mock transport");

    expect(
      resolvePublicRuntimeConfig({
        NODE_ENV: "production",
        NEXT_PUBLIC_CHAT_TRANSPORT: "projects-new",
        NEXT_PUBLIC_AGENT_API_BASE: "/agent-api",
      }).apiBaseUrl,
    ).toBe("/agent-api");
  });
});
