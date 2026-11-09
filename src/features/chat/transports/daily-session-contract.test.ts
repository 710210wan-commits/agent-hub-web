import { describe, expect, it } from "vitest";

import {
  ConversationListSchema,
  ConversationMessagePageSchema,
  ConversationMetadataSchema,
  ConversationSnapshotSchema,
  CreatedConversationSchema,
  DailySessionAuthStatusSchema,
  DailySessionErrorEnvelopeSchema,
  DailySessionLoginResponseSchema,
  RenamedConversationSchema,
} from "./daily-session-contract";

const conversationId = "10000000-0000-4000-8000-000000000001";
const turnId = "20000000-0000-4000-8000-000000000002";
const taskId = "30000000-0000-4000-8000-000000000003";
const messageId = "40000000-0000-4000-8000-000000000004";

const metadata = {
  conversationId,
  scenarioId: "daily",
  agentKey: "agent-loop",
  title: "日常会话",
  status: "open",
  archivedAt: null,
  version: 1,
  lastEventSeq: "2",
  lastTurnIndex: "1",
  createdAt: "2026-11-09T01:02:03.000Z",
  updatedAt: "2026-11-09T01:03:04.000Z",
} as const;

const message = {
  messageId,
  conversationId,
  turnId,
  ordinal: "2",
  role: "assistant",
  content: { kind: "text", text: "回答" },
  revision: 1,
  status: "committed",
  artifactRefs: [],
  createdAt: "2026-11-09T01:03:04.000Z",
} as const;

describe("daily Session C01-A contract", () => {
  it("accepts the exact metadata and list response shapes", () => {
    expect(ConversationMetadataSchema.parse(metadata)).toEqual(metadata);
    expect(
      ConversationListSchema.parse({
        conversations: [metadata],
        nextCursor: "opaque-list-cursor",
      }),
    ).toEqual({ conversations: [metadata], nextCursor: "opaque-list-cursor" });
  });

  it("accepts snapshot, message page, create, and rename responses", () => {
    expect(
      ConversationSnapshotSchema.parse({
        conversation: metadata,
        activeTurn: {
          turnId,
          taskId,
          turnIndex: "1",
          status: "running",
          acceptedEventSeq: "1",
          errorCode: null,
        },
        messages: [message],
        nextCursor: "older",
        lastEventSeq: "2",
      }),
    ).toMatchObject({ messages: [message], nextCursor: "older" });
    expect(
      ConversationMessagePageSchema.parse({
        messages: [message],
        nextCursor: null,
        lastEventSeq: "2",
      }),
    ).toEqual({ messages: [message], nextCursor: null, lastEventSeq: "2" });
    expect(
      CreatedConversationSchema.parse({ conversation: metadata, reused: false }),
    ).toEqual({ conversation: metadata, reused: false });
    expect(
      RenamedConversationSchema.parse({
        conversation: { ...metadata, title: "新标题", version: 2 },
      }),
    ).toMatchObject({ conversation: { title: "新标题", version: 2 } });
  });

  it.each([
    [
      "missing field",
      {
        conversationId: metadata.conversationId,
        scenarioId: metadata.scenarioId,
        agentKey: metadata.agentKey,
        title: metadata.title,
        status: metadata.status,
        archivedAt: metadata.archivedAt,
        version: metadata.version,
        lastEventSeq: metadata.lastEventSeq,
        lastTurnIndex: metadata.lastTurnIndex,
        createdAt: metadata.createdAt,
      },
    ],
    ["extra field", { ...metadata, internalOwnerKey: "xiaozhi:secret" }],
    ["invalid uuid", { ...metadata, conversationId: "not-a-uuid" }],
    ["invalid datetime", { ...metadata, updatedAt: "yesterday" }],
    ["zero version", { ...metadata, version: 0 }],
    ["numeric sequence", { ...metadata, lastEventSeq: 2 }],
    ["negative sequence", { ...metadata, lastEventSeq: "-1" }],
    ["unsafe bigint sequence", { ...metadata, lastEventSeq: "9223372036854775808" }],
  ])("rejects %s", (_name, candidate) => {
    expect(ConversationMetadataSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects unknown fields inside messages and pages", () => {
    expect(
      ConversationMessagePageSchema.safeParse({
        messages: [{ ...message, rawPrompt: "secret" }],
        nextCursor: null,
        lastEventSeq: "2",
      }).success,
    ).toBe(false);
    expect(
      ConversationMessagePageSchema.safeParse({
        messages: [message],
        nextCursor: null,
        lastEventSeq: "2",
        eventStreamUrl: "/future-sse",
      }).success,
    ).toBe(false);
  });
});

describe("daily Session auth and error contracts", () => {
  const user = {
    id: "user-7",
    displayName: "测试用户",
    sessionExpiresAt: "2026-11-09T09:02:03.000Z",
  };

  it("accepts verified and anonymous auth status responses", () => {
    expect(
      DailySessionAuthStatusSchema.parse({
        enabled: true,
        xiaozhiUrl: "http://127.0.0.1:5050/xiaozhi",
        user,
      }),
    ).toMatchObject({ enabled: true, user });
    expect(
      DailySessionAuthStatusSchema.parse({
        enabled: false,
        xiaozhiUrl: "http://127.0.0.1:5050/xiaozhi",
      }),
    ).toEqual({
      enabled: false,
      xiaozhiUrl: "http://127.0.0.1:5050/xiaozhi",
    });
  });

  it("accepts full and basic login responses without widening them", () => {
    expect(
      DailySessionLoginResponseSchema.parse({ success: true, user }),
    ).toEqual({ success: true, user });
    expect(
      DailySessionLoginResponseSchema.parse({
        success: true,
        user,
        kbUnavailable: true,
      }),
    ).toEqual({ success: true, user, kbUnavailable: true });
    expect(
      DailySessionLoginResponseSchema.safeParse({
        success: true,
        user,
        accessToken: "must-not-cross-browser-boundary",
      }).success,
    ).toBe(false);
  });

  it("accepts only the current conversation error envelope", () => {
    expect(
      DailySessionErrorEnvelopeSchema.parse({
        error: {
          code: "AUTH_REQUIRED",
          message: "Verified login required",
          requestId: "50000000-0000-4000-8000-000000000005",
        },
      }),
    ).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
    expect(
      DailySessionErrorEnvelopeSchema.safeParse({
        error: {
          code: "AUTH_REQUIRED",
          message: "Verified login required",
          requestId: "not-a-uuid",
          stack: "internal",
        },
      }).success,
    ).toBe(false);
  });
});
