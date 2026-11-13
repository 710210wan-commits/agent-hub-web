import { describe, expect, it } from "vitest";

import type { ConversationMessage } from "@/features/chat/transports/daily-session-contract";

import {
  adaptDailySessionMessage,
  projectDailySessionMessages,
  mergeDailySessionMessages,
} from "./daily-session-adapter";

const conversationId = "10000000-0000-4000-8000-000000000001";
const turnId = "20000000-0000-4000-8000-000000000002";

function message(
  messageId: string,
  overrides: Partial<ConversationMessage> = {},
): ConversationMessage {
  return {
    messageId,
    conversationId,
    turnId,
    ordinal: "9223372036854775806",
    role: "assistant",
    content: { kind: "text", text: "可见回答" },
    revision: 1,
    status: "committed",
    artifactRefs: [],
    capabilitySelection: null,
    createdAt: "2026-11-09T01:03:04.000Z",
    ...overrides,
  };
}

describe("daily Session message adapter", () => {
  it("preserves historical selection independently of current catalog or caller edits", () => {
    const input = message("old-message", { role: "user", capabilitySelection: {
      knowledgeBaseIds: ["deleted-kb"], skillIds: ["market:old-publication"], mcpServerIds: ["old-server"],
    } });
    const projected = adaptDailySessionMessage(input);
    input.capabilitySelection!.knowledgeBaseIds.push("later");
    input.capabilitySelection!.mcpServerIds.push("later-server");
    expect(projected.selection).toEqual({ knowledgeBaseIds: ["deleted-kb"], skillIds: ["market:old-publication"], mcpServerIds: ["old-server"] });
    expect(Object.isFrozen(projected.selection!.knowledgeBaseIds)).toBe(true);
    expect(Object.isFrozen(projected.selection!.mcpServerIds)).toBe(true);
  });
  it.each(["user", "assistant"] as const)(
    "maps %s text while preserving stable metadata",
    (role) => {
      const input = message("40000000-0000-4000-8000-000000000004", {
        role,
        content: { kind: "text", text: `${role} 正文` },
      });

      expect(adaptDailySessionMessage(input)).toEqual({
        id: input.messageId,
        role,
        content: `${role} 正文`,
        createdAt: Date.parse(input.createdAt),
        ordinal: "9223372036854775806",
      });
    },
  );

  it("maps a user daily report to a concise visible prompt", () => {
    const adapted = adaptDailySessionMessage(
      message("40000000-0000-4000-8000-000000000005", {
        role: "user",
        content: {
          kind: "daily_report",
          date: "2026-11-08",
          reportType: "event",
        },
      }),
    );

    expect(adapted.content).toBe("生成 2026-11-08 预警事态日报");
  });

  it("uses a safe placeholder for unknown or role-invalid content", () => {
    const unknown = adaptDailySessionMessage(
      message("40000000-0000-4000-8000-000000000006", {
        content: { kind: "private_tool", rawPrompt: "DO_NOT_RENDER" },
      }),
    );
    const assistantReport = adaptDailySessionMessage(
      message("40000000-0000-4000-8000-000000000007", {
        role: "assistant",
        content: {
          kind: "daily_report",
          date: "2026-11-08",
          reportType: "all",
          secret: "DO_NOT_RENDER",
        },
      }),
    );

    expect(unknown.content).toBe("暂不支持展示的消息");
    expect(assistantReport.content).toBe("暂不支持展示的消息");
    expect(`${unknown.content}${assistantReport.content}`).not.toContain(
      "DO_NOT_RENDER",
    );
  });

  it("prepends older pages in server order and de-duplicates by stable id", () => {
    const duplicateId = "40000000-0000-4000-8000-000000000008";
    const current = [
      adaptDailySessionMessage(
        message(duplicateId, { ordinal: "3", content: { kind: "text", text: "当前副本" } }),
      ),
      adaptDailySessionMessage(
        message("40000000-0000-4000-8000-000000000009", { ordinal: "4" }),
      ),
    ];
    const older = [
      adaptDailySessionMessage(
        message("40000000-0000-4000-8000-000000000010", { ordinal: "1" }),
      ),
      adaptDailySessionMessage(
        message(duplicateId, { ordinal: "3", content: { kind: "text", text: "旧页副本" } }),
      ),
    ];

    const merged = mergeDailySessionMessages(older, current);

    expect(merged.map((item) => item.id)).toEqual([
      "40000000-0000-4000-8000-000000000010",
      duplicateId,
      "40000000-0000-4000-8000-000000000009",
    ]);
    expect(merged[1]?.content).toBe("当前副本");
    expect(merged.map((item) => item.ordinal)).toEqual(["1", "3", "4"]);
  });

  it("sorts ordinals with BigInt precision instead of Number coercion", () => {
    const projected = projectDailySessionMessages(
      [
        message("40000000-0000-4000-8000-000000000011", {
          ordinal: "9007199254740993",
        }),
        message("40000000-0000-4000-8000-000000000012", {
          ordinal: "9007199254740992",
        }),
      ],
      null,
    );

    expect(projected.map((item) => item.ordinal)).toEqual([
      "9007199254740992",
      "9007199254740993",
    ]);
  });

  it("shows one optimistic user message until its canonical message arrives", () => {
    const pending = {
      clientRequestId: "50000000-0000-4000-8000-000000000005",
      content: "待确认问题",
      status: "unknown" as const,
      capabilitySelection: { knowledgeBaseIds: [], skillIds: [], mcpServerIds: [] },
      userMessageId: "40000000-0000-4000-8000-000000000013",
    };

    const optimistic = projectDailySessionMessages([], pending);
    const canonical = projectDailySessionMessages(
      [
        message(pending.userMessageId, {
          role: "user",
          ordinal: "1",
          content: { kind: "text", text: "待确认问题" },
        }),
      ],
      pending,
    );

    expect(optimistic).toEqual([
      expect.objectContaining({
        id: `pending:${pending.clientRequestId}`,
        role: "user",
        content: "待确认问题",
        pending: true,
      }),
    ]);
    expect(canonical).toHaveLength(1);
    expect(canonical[0]).toMatchObject({ id: pending.userMessageId });
    expect(canonical[0]).not.toHaveProperty("pending");
  });

  it("keeps a TURN_IN_PROGRESS draft out of the sent message list", () => {
    const projected = projectDailySessionMessages([], {
      clientRequestId: "50000000-0000-4000-8000-000000000005",
      content: "仍在编辑器中的草稿",
      status: "blocked",
      capabilitySelection: { knowledgeBaseIds: [], skillIds: [], mcpServerIds: [] },
    });

    expect(projected).toEqual([]);
  });
});
