import { describe, expect, it, vi } from "vitest";

import {
  SkillMarketTargetError,
  resolveSkillMarketRequestTarget,
  resolveSkillMarketTargetConfig,
  withSkillMarketRequestTarget,
} from "./skill-market-targets";

const env = { SKILL_MARKET_DAILY_ORIGIN: "https://daily-agent.example.test/" };

describe("resolveSkillMarketTargetConfig", () => {
  it("normalizes the server-only daily Origin", () => {
    expect(resolveSkillMarketTargetConfig(env)).toEqual({
      dailyOrigin: "https://daily-agent.example.test",
    });
  });

  it("requires the server-only Origin and ignores public lookalikes", () => {
    expect(() =>
      resolveSkillMarketTargetConfig({
        NEXT_PUBLIC_SKILL_MARKET_DAILY_ORIGIN: "https://attacker.example.test",
      }),
    ).toThrowError(expect.objectContaining({ code: "SKILL_MARKET_CONFIG_INVALID" }));
  });

  it.each([
    "ftp://daily-agent.example.test",
    "https://user:secret@daily-agent.example.test",
    "https://daily-agent.example.test/api",
    "https://daily-agent.example.test/?target=other",
    "https://daily-agent.example.test/#fragment",
  ])("rejects an unsafe daily Origin: %s", (origin) => {
    expect(() =>
      resolveSkillMarketTargetConfig({ SKILL_MARKET_DAILY_ORIGIN: origin }),
    ).toThrowError(expect.objectContaining({ code: "SKILL_MARKET_CONFIG_INVALID" }));
  });
});

describe("resolveSkillMarketRequestTarget", () => {
  it("maps daily to the only configured upstream", () => {
    const target = resolveSkillMarketRequestTarget(
      {
        mode: "daily",
        path: "/api/skill-market/creator/tools",
        query: new URLSearchParams({ maxRiskLevel: "medium" }),
      },
      env,
    );

    expect(target.mode).toBe("daily");
    expect(target.origin).toBe("https://daily-agent.example.test");
    expect(target.url.toString()).toBe(
      "https://daily-agent.example.test/api/skill-market/creator/tools?maxRiskLevel=medium",
    );
  });

  it("stops work before the upstream callback", async () => {
    const upstream = vi.fn();

    await expect(
      withSkillMarketRequestTarget(
        { mode: "work", path: "/api/skill-market/catalog" },
        env,
        upstream,
      ),
    ).rejects.toMatchObject({ code: "SKILL_MARKET_MODE_UNAVAILABLE" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "", "office", "DAILY"])(
    "rejects an invalid mode before target resolution: %s",
    (mode) => {
      expect(() =>
        resolveSkillMarketRequestTarget(
          { mode, path: "/api/skill-market/catalog" },
          env,
        ),
      ).toThrowError(expect.objectContaining({ code: "SKILL_MARKET_MODE_INVALID" }));
    },
  );

  it.each([null, [], "daily"])("rejects a malformed request boundary: %o", (input) => {
    expect(() => resolveSkillMarketRequestTarget(input, env)).toThrowError(
      expect.objectContaining({ code: "SKILL_MARKET_PATH_INVALID" }),
    );
  });

  it.each([
    { origin: "https://attacker.example.test" },
    { host: "attacker.example.test" },
    { target: "https://attacker.example.test" },
    { url: "https://attacker.example.test" },
  ])("rejects a client target override: %o", (override) => {
    expect(() =>
      resolveSkillMarketRequestTarget(
        {
          mode: "daily",
          path: "/api/skill-market/catalog",
          ...override,
        },
        env,
      ),
    ).toThrowError(expect.objectContaining({
      code: "SKILL_MARKET_TARGET_OVERRIDE_FORBIDDEN",
    }));
  });

  it.each(["origin", "host", "target", "url", "upstream"])(
    "rejects a target override query key: %s",
    (key) => {
      expect(() =>
        resolveSkillMarketRequestTarget(
          {
            mode: "daily",
            path: "/api/skill-market/catalog",
            query: new URLSearchParams({ [key]: "https://attacker.example.test" }),
          },
          env,
        ),
      ).toThrowError(expect.objectContaining({
        code: "SKILL_MARKET_TARGET_OVERRIDE_FORBIDDEN",
      }));
    },
  );

  it.each([
    "https://attacker.example.test/api/skill-market/catalog",
    "//attacker.example.test/api/skill-market/catalog",
    "/api/skills",
    "/api/skill-marketplace/catalog",
    "/api/skill-market/unknown",
    "/api/skill-market/catalog/extra",
  ])("rejects an absolute URL or unknown prefix/path: %s", (path) => {
    expect(() =>
      resolveSkillMarketRequestTarget({ mode: "daily", path }, env),
    ).toThrowError(expect.objectContaining({ code: "SKILL_MARKET_PATH_INVALID" }));
  });

  it.each([
    "/api/skill-market/../catalog",
    "/api/skill-market/%2e%2e/catalog",
    "/api/skill-market/%252e%252e/catalog",
    "/api/skill-market/creator%2ftools",
    "/api/skill-market/creator\\tools",
  ])("rejects plain or encoded path traversal: %s", (path) => {
    expect(() =>
      resolveSkillMarketRequestTarget({ mode: "daily", path }, env),
    ).toThrowError(expect.objectContaining({ code: "SKILL_MARKET_PATH_INVALID" }));
  });

  it("exposes stable error codes without leaking the configured Origin", () => {
    let caught: unknown;
    try {
      resolveSkillMarketRequestTarget(
        { mode: "work", path: "/api/skill-market/catalog" },
        env,
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SkillMarketTargetError);
    expect(String(caught)).not.toContain("daily-agent.example.test");
  });
});
