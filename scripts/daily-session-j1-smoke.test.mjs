// @vitest-environment node

import { describe, expect, it } from "vitest";

import { logoutFailure } from "./daily-session-j1-smoke.mjs";

describe("daily-session-j1 smoke cleanup", () => {
  it("reports one logout failure without exposing the cause", () => {
    const error = logoutFailure([
      { status: "rejected", reason: new Error("private upstream detail") },
      { status: "fulfilled", value: undefined },
    ]);

    expect(error).toEqual(new Error("logout A 失败"));
    expect(error?.message).not.toContain("private upstream detail");
  });

  it("reports both logout failures", () => {
    const error = logoutFailure([
      { status: "rejected", reason: new Error("private A") },
      { status: "rejected", reason: new Error("private B") },
    ]);

    expect(error).toEqual(new Error("logout A/B 失败"));
  });
});
