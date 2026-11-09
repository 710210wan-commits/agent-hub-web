import { describe, expect, it } from "vitest";

import {
  decodeSkillMarketError,
  type SkillMarketErrorPresentation,
  type SkillMarketRecoveryAction,
} from "./error";

describe("decodeSkillMarketError", () => {
  it.each([
    [401, "skill.authentication_failed", "authentication", "reload", false],
    [403, "skill.permission_denied", "permission", "back", false],
    [404, "skill.resource_not_found", "not-found", "back", false],
    [409, "skill.lifecycle_conflict", "conflict", "refresh", false],
    [422, "skill.validation_failed", "validation", "edit", false],
    [504, "SKILL_MARKET_UPSTREAM_TIMEOUT", "timeout", "retry", true],
  ] as const)(
    "maps %s/%s to a distinct persistent recovery model",
    async (status, code, presentation, recovery, retryable) => {
      const error = await decodeSkillMarketError(new Response(JSON.stringify({
        error: "server message",
        code,
        requestId: "request-1",
      }), { status, headers: { "content-type": "application/json" } }));

      expect(error).toMatchObject({
        code,
        presentation: presentation satisfies SkillMarketErrorPresentation,
        recovery: recovery satisfies SkillMarketRecoveryAction,
        requestId: "request-1",
        retryable,
        status,
      });
      expect(error.userMessage).not.toBe("server message");
    },
  );

  it("preserves validation diagnostics and uses the response request ID", async () => {
    const diagnostics = [{
      code: "skill.name.required",
      field: "name",
      message: "Name is required.",
      severity: "error",
    }];
    const error = await decodeSkillMarketError(new Response(JSON.stringify({
      error: "Skill draft validation failed.",
      code: "skill.validation_failed",
      diagnostics,
      requestId: "body-request-id",
    }), {
      status: 422,
      headers: { "content-type": "application/json", "x-request-id": "header-request-id" },
    }), { area: "draft" });

    expect(error.diagnostics).toEqual(diagnostics);
    expect(error.area).toBe("draft");
    expect(error.requestId).toBe("body-request-id");
  });

  it("fails closed for an unknown code without displaying the backend message", async () => {
    const error = await decodeSkillMarketError(new Response(JSON.stringify({
      error: "postgres://secret@internal.example/private",
      code: "skill.future_internal_detail",
    }), {
      status: 500,
      headers: { "content-type": "application/json", "x-request-id": "request-safe" },
    }));

    expect(error.code).toBe("skill.future_internal_detail");
    expect(error.presentation).toBe("unknown");
    expect(error.requestId).toBe("request-safe");
    expect(error.retryable).toBe(true);
    expect(error.userMessage).not.toContain("postgres");
    expect(String(error)).not.toContain("internal.example");
  });

  it.each([
    new Response("not json", { status: 502, headers: { "content-type": "text/plain" } }),
    new Response(JSON.stringify({ error: 42 }), { status: 500, headers: { "content-type": "application/json" } }),
  ])("rejects an invalid error envelope", async (response) => {
    const error = await decodeSkillMarketError(response);
    expect(error).toMatchObject({
      code: "SKILL_MARKET_RESPONSE_INVALID",
      presentation: "unknown",
      recovery: "retry",
      retryable: true,
    });
  });
});
