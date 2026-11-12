// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  logoutFailure,
  parseNamedSseFrame,
  requireTerminalEvents,
} from "./daily-session-j1-smoke.mjs";

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

describe("daily-session-j1 canonical smoke events", () => {
  const conversationId = "10000000-0000-4000-8000-000000000001";

  it("parses named SSE with comment, event, id and JSON data", () => {
    const event = parseNamedSseFrame(
      `: heartbeat\nevent: turn.completed\nid: ${conversationId}:9\ndata: {"conversationId":"${conversationId}","eventSeq":"9","type":"turn.completed"}`,
      conversationId,
    );

    expect(event).toMatchObject({ eventSeq: "9", type: "turn.completed" });
  });

  it("rejects mismatched SSE event names", () => {
    expect(() =>
      parseNamedSseFrame(
        `event: turn.started\nid: ${conversationId}:9\ndata: {"conversationId":"${conversationId}","eventSeq":"9","type":"turn.completed"}`,
        conversationId,
      ),
    ).toThrow("SSE event/type 不一致");
  });

  it("requires a canonical message and completed terminal", () => {
    expect(
      requireTerminalEvents([
        { type: "message.created", eventSeq: "8" },
        { type: "turn.completed", eventSeq: "9" },
      ]),
    ).toMatchObject({ type: "turn.completed" });
    expect(() => requireTerminalEvents([{ type: "turn.completed" }])).toThrow(
      "终态前未观察到 message.created",
    );
  });
});
