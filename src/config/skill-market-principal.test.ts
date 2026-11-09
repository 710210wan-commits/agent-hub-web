import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  SKILL_MARKET_PRINCIPAL_HEADERS,
  createSkillMarketPrincipalHeaders,
  resolveSkillMarketPrincipalConfig,
} from "./skill-market-principal";

const secret = "phase-one-test-gateway-secret-with-32-characters";
const env = {
  SKILL_MARKET_GATEWAY_HMAC_SECRET: secret,
  SKILL_MARKET_PRINCIPAL_ID: "reviewer-42",
  SKILL_MARKET_PRINCIPAL_MANAGED_SCENARIOS: "marine",
  SKILL_MARKET_PRINCIPAL_PERMISSIONS: "tool:Read",
  SKILL_MARKET_PRINCIPAL_ROLES: "reviewer",
};
const timestamp = Date.parse("2026-10-09T08:00:00.000Z");
const request = {
  method: "POST",
  originalUrl: "/api/skill-market/submissions/sub-1/review",
  timestamp,
};

describe("resolveSkillMarketPrincipalConfig", () => {
  it("loads and normalizes one server-only operator Principal", () => {
    expect(
      resolveSkillMarketPrincipalConfig({
        ...env,
        SKILL_MARKET_PRINCIPAL_MANAGED_SCENARIOS: " marine,air,marine ",
        SKILL_MARKET_PRINCIPAL_PERMISSIONS: "tool:Write,tool:Read,tool:Read",
        SKILL_MARKET_PRINCIPAL_ROLES: "reviewer,admin,reviewer",
      }),
    ).toEqual({
      id: "reviewer-42",
      managedScenarioIds: ["air", "marine"],
      permissions: ["tool:Read", "tool:Write"],
      roles: ["admin", "reviewer"],
      secret,
    });
  });

  it.each([
    {},
    { ...env, SKILL_MARKET_GATEWAY_HMAC_SECRET: "too-short" },
    { ...env, SKILL_MARKET_PRINCIPAL_ID: "" },
    { ...env, SKILL_MARKET_PRINCIPAL_ROLES: "" },
    { ...env, SKILL_MARKET_PRINCIPAL_ROLES: "super-admin" },
  ])("fails closed for missing or invalid server configuration", (candidate) => {
    expect(() => resolveSkillMarketPrincipalConfig(candidate)).toThrowError(
      expect.objectContaining({ code: "SKILL_MARKET_PRINCIPAL_CONFIG_INVALID" }),
    );
  });

  it("does not accept public lookalikes", () => {
    expect(() =>
      resolveSkillMarketPrincipalConfig({
        NEXT_PUBLIC_SKILL_MARKET_GATEWAY_HMAC_SECRET: secret,
        NEXT_PUBLIC_SKILL_MARKET_PRINCIPAL_ID: "attacker",
        NEXT_PUBLIC_SKILL_MARKET_PRINCIPAL_ROLES: "admin",
      }),
    ).toThrowError(expect.objectContaining({
      code: "SKILL_MARKET_PRINCIPAL_CONFIG_INVALID",
    }));
  });
});

describe("createSkillMarketPrincipalHeaders", () => {
  it("matches the backend fixed skill-market-principal-v1 vector", () => {
    const headers = createSkillMarketPrincipalHeaders(request, env);

    expect(headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.signature)).toBe(
      "7246f96362f8192bd6379c9a6e65ab23a4f7012cf7f27dabb8054c4717fd5c1b",
    );
    expect(headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.timestamp)).toBe(String(timestamp));
    expect(headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.id)).toBe("reviewer-42");
    expect(headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.roles)).toBe("reviewer");
    expect(headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.managedScenarios)).toBe("marine");
    expect(headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.permissions)).toBe("tool:Read");
    expect(verifyLikeBackend(headers, request, secret, timestamp)).toBe(true);
  });

  it("signs the final method and originalUrl including query order", () => {
    const finalRequest = {
      method: "get",
      originalUrl: "/api/skill-market/creator/tools?scenarioId=daily&maxRiskLevel=medium",
      timestamp,
    };
    const headers = createSkillMarketPrincipalHeaders(finalRequest, env);

    expect(verifyLikeBackend(headers, { ...finalRequest, method: "GET" }, secret, timestamp)).toBe(true);
    expect(
      verifyLikeBackend(headers, { ...finalRequest, method: "POST" }, secret, timestamp),
    ).toBe(false);
    expect(
      verifyLikeBackend(
        headers,
        { ...finalRequest, originalUrl: "/api/skill-market/creator/tools?maxRiskLevel=medium&scenarioId=daily" },
        secret,
        timestamp,
      ),
    ).toBe(false);
  });

  it("rejects an expired timestamp and identity, role, or scope tampering", () => {
    const headers = createSkillMarketPrincipalHeaders(request, env);
    expect(verifyLikeBackend(headers, request, secret, timestamp + 5 * 60_000 + 1)).toBe(false);

    for (const [name, value] of [
      [SKILL_MARKET_PRINCIPAL_HEADERS.id, "other-user"],
      [SKILL_MARKET_PRINCIPAL_HEADERS.roles, "admin"],
      [SKILL_MARKET_PRINCIPAL_HEADERS.managedScenarios, "other-scenario"],
      [SKILL_MARKET_PRINCIPAL_HEADERS.permissions, "tool:Write"],
    ] as const) {
      const tampered = new Headers(headers);
      tampered.set(name, value);
      expect(verifyLikeBackend(tampered, request, secret, timestamp)).toBe(false);
    }
  });

  it.each([
    ["TRACE", "/api/skill-market/catalog"],
    ["GET", "https://attacker.example.test/api/skill-market/catalog"],
    ["GET", "/api/skill-market/catalog#fragment"],
    ["GET", "/api/skills"],
  ])("rejects an unsafe signing input: %s %s", (method, originalUrl) => {
    expect(() =>
      createSkillMarketPrincipalHeaders({ method, originalUrl, timestamp }, env),
    ).toThrowError(expect.objectContaining({ code: "SKILL_MARKET_SIGNING_INPUT_INVALID" }));
  });

  it("does not include the Secret or canonical signing text in errors", () => {
    let caught: unknown;
    try {
      createSkillMarketPrincipalHeaders(request, {
        ...env,
        SKILL_MARKET_GATEWAY_HMAC_SECRET: "short",
      });
    } catch (error) {
      caught = error;
    }
    expect(String(caught)).not.toContain("short");
    expect(String(caught)).not.toContain("skill-market-principal-v1");
    expect(String(caught)).not.toContain(request.originalUrl);
  });
});

function verifyLikeBackend(
  headers: Headers,
  signedRequest: { method: string; originalUrl: string; timestamp: number },
  gatewaySecret: string,
  now: number,
): boolean {
  const suppliedTimestamp = Number(headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.timestamp));
  if (!Number.isSafeInteger(suppliedTimestamp) || Math.abs(now - suppliedTimestamp) > 5 * 60_000) {
    return false;
  }
  const canonical = [
    "skill-market-principal-v1",
    signedRequest.method.toUpperCase(),
    signedRequest.originalUrl,
    headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.id) ?? "",
    headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.roles) ?? "",
    headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.managedScenarios) ?? "",
    headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.permissions) ?? "",
    String(signedRequest.timestamp),
  ].join("\n");
  const expected = createHmac("sha256", gatewaySecret).update(canonical).digest();
  const suppliedText = headers.get(SKILL_MARKET_PRINCIPAL_HEADERS.signature) ?? "";
  if (!/^[a-f0-9]{64}$/.test(suppliedText)) return false;
  const supplied = Buffer.from(suppliedText, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
