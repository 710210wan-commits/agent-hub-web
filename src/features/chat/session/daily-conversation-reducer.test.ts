import { describe, expect, it } from "vitest";

import type {
  AcceptedConversationTurn,
  ConversationMessage,
  ConversationMetadata,
  ConversationPublicEvent,
  ConversationSnapshot,
} from "@/features/chat/transports/daily-session-contract";

import {
  ConversationSequenceGapError,
  createInitialDailyConversationState,
  dailyConversationReducer,
  selectDailyConversationMessages,
} from "./daily-conversation-reducer";

const conversationId = "10000000-0000-4000-8000-000000000001";
const turnId = "20000000-0000-4000-8000-000000000002";
const taskId = "30000000-0000-4000-8000-000000000003";
const userMessageId = "40000000-0000-4000-8000-000000000004";
const assistantMessageId = "50000000-0000-4000-8000-000000000005";
const clientRequestId = "60000000-0000-4000-8000-000000000006";

it("copies and freezes pending selection arrays at the reducer boundary", () => {
  const capabilitySelection = { knowledgeBaseIds: ["kb-a"], skillIds: [], mcpServerIds: [] };
  const state = dailyConversationReducer(createInitialDailyConversationState("test"), { type: "pending.start", pending: {
    clientRequestId, content: "hello", status: "submitting", capabilitySelection,
  } });
  capabilitySelection.knowledgeBaseIds.push("kb-later");
  expect(state.pendingSend?.capabilitySelection?.knowledgeBaseIds).toEqual(["kb-a"]);
  expect(Object.isFrozen(state.pendingSend?.capabilitySelection?.knowledgeBaseIds)).toBe(true);
});

const metadata: ConversationMetadata = {
  conversationId,
  scenarioId: "daily",
  agentKey: "agent-loop",
  title: "持久会话",
  status: "open",
  archivedAt: null,
  version: 1,
  lastEventSeq: "3",
  lastTurnIndex: "1",
  createdAt: "2026-11-09T01:02:03.000Z",
  updatedAt: "2026-11-09T01:03:04.000Z",
};

function message(
  messageId: string,
  role: "user" | "assistant",
  ordinal: string,
): ConversationMessage {
  return {
    messageId,
    conversationId,
    turnId,
    ordinal,
    role,
    content: { kind: "text", text: role === "user" ? "问题" : "最终回答" },
    revision: 1,
    status: "committed",
    artifactRefs: [],
    capabilitySelection: null,
    createdAt: "2026-11-09T01:03:04.000Z",
  };
}

function snapshot(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    conversation: metadata,
    activeTurn: null,
    messages: [message(assistantMessageId, "assistant", "2")],
    nextCursor: null,
    lastEventSeq: "3",
    ...overrides,
  };
}

function event(
  eventSeq: string,
  type: ConversationPublicEvent["type"],
  payload: Record<string, unknown>,
): ConversationPublicEvent {
  return {
    eventId: `70000000-0000-4000-8000-${eventSeq.padStart(12, "0")}`,
    eventSeq,
    conversationId,
    schemaVersion: 1,
    type,
    occurredAt: "2026-11-09T01:03:04.000Z",
    payload,
    turnId,
    taskId,
    ...(type === "message.created" ? { messageId: userMessageId } : {}),
  } as ConversationPublicEvent;
}

function receipt(status: AcceptedConversationTurn["status"] = "queued") {
  return {
    conversationId,
    turnId,
    taskId,
    userMessageId,
    acceptedEventSeq: "2",
    status,
    reused: false,
  } satisfies AcceptedConversationTurn;
}

function turnState(status: "queued" | "running" | "completed") {
  return {
    turnId,
    taskId,
    turnIndex: "1",
    status,
    acceptedEventSeq: "1",
    errorCode: null,
  } as const;
}

function pendingState() {
  return dailyConversationReducer(
    createInitialDailyConversationState(`${conversationId}:1`),
    {
      type: "pending.start",
      pending: {
        clientRequestId,
        content: "问题",
        status: "submitting",
        capabilitySelection: { knowledgeBaseIds: [], skillIds: [], mcpServerIds: [] },
      },
    },
  );
}

describe("dailyConversationReducer", () => {
  it("installs a snapshot as canonical message map with a separate recovery watermark", () => {
    const duplicate = message(assistantMessageId, "assistant", "2");
    const installed = dailyConversationReducer(
      createInitialDailyConversationState(`${conversationId}:1`),
      {
        type: "snapshot.install",
        snapshot: snapshot({
          messages: [duplicate, { ...duplicate, content: { kind: "text", text: "新副本" } }],
        }),
      },
    );

    expect(installed).toMatchObject({
      conversation: metadata,
      appliedSeq: "0",
      snapshotWatermark: "3",
      activeTurn: null,
      status: "ready",
    });
    expect(selectDailyConversationMessages(installed)).toHaveLength(1);
    expect(selectDailyConversationMessages(installed)[0]?.content).toEqual({
      kind: "text",
      text: "新副本",
    });
  });

  it("rejects a sequence gap, applies ordered events, and ignores duplicates", () => {
    const initial = dailyConversationReducer(
      createInitialDailyConversationState(`${conversationId}:1`),
      {
        type: "snapshot.install",
        snapshot: snapshot({
          conversation: { ...metadata, lastEventSeq: "0" },
          messages: [],
          lastEventSeq: "0",
        }),
      },
    );
    const first = event("1", "conversation.created", { version: 1 });
    const second = event("2", "conversation.updated", {
      title: "新标题",
      version: 2,
    });

    expect(() =>
      dailyConversationReducer(initial, { type: "event.apply", event: second }),
    ).toThrow(ConversationSequenceGapError);

    const applied = dailyConversationReducer(initial, {
      type: "event.apply",
      event: first,
    });
    const updated = dailyConversationReducer(applied, {
      type: "event.apply",
      event: second,
    });
    const duplicate = dailyConversationReducer(updated, {
      type: "event.apply",
      event: second,
    });

    expect(updated.appliedSeq).toBe("2");
    expect(updated.conversation?.title).toBe("新标题");
    expect(duplicate).toBe(updated);
  });

  it.each(["receipt-first", "event-first"] as const)(
    "binds one optimistic user message when %s",
    (order) => {
      const userEvent = event("1", "message.created", {
        message: message(userMessageId, "user", "1"),
      });
      const actions =
        order === "receipt-first"
          ? ([
              { type: "receipt.apply", receipt: receipt() },
              { type: "event.apply", event: userEvent },
            ] as const)
          : ([
              { type: "event.apply", event: userEvent },
              { type: "receipt.apply", receipt: receipt() },
            ] as const);
      const final = actions.reduce(dailyConversationReducer, pendingState());

      expect(selectDailyConversationMessages(final)).toEqual([
        message(userMessageId, "user", "1"),
      ]);
      expect(final.pendingSend).toBeNull();
    },
  );

  it("never lets an older receipt regress a terminal turn", () => {
    const queued = event("1", "turn.queued", {
      turn: {
        turnId,
        taskId,
        turnIndex: "1",
        status: "queued",
        acceptedEventSeq: "1",
        errorCode: null,
      },
      userMessageId,
    });
    const completed = event("2", "turn.completed", {
      turn: {
        turnId,
        taskId,
        turnIndex: "1",
        status: "completed",
        acceptedEventSeq: "1",
        errorCode: null,
      },
      messageId: assistantMessageId,
    });
    const terminal = dailyConversationReducer(
      dailyConversationReducer(pendingState(), {
        type: "event.apply",
        event: queued,
      }),
      { type: "event.apply", event: completed },
    );
    const lateReceipt = dailyConversationReducer(terminal, {
      type: "receipt.apply",
      receipt: receipt("queued"),
    });

    expect(lateReceipt.activeTurn?.status).toBe("completed");
    expect(lateReceipt.status).toBe("completed");
  });

  it("accepts a later turn receipt after the previous turn is terminal", () => {
    const terminal = dailyConversationReducer(
      dailyConversationReducer(
        createInitialDailyConversationState(`${conversationId}:1`),
        {
          type: "event.apply",
          event: event("1", "turn.queued", {
            turn: turnState("queued"),
            userMessageId,
          }),
        },
      ),
      {
        type: "event.apply",
        event: event("2", "turn.completed", {
          turn: turnState("completed"),
          messageId: assistantMessageId,
        }),
      },
    );
    const secondTurnId = "21000000-0000-4000-8000-000000000012";

    const next = dailyConversationReducer(terminal, {
      type: "receipt.apply",
      receipt: {
        ...receipt(),
        turnId: secondTurnId,
        taskId: "31000000-0000-4000-8000-000000000013",
        userMessageId: "41000000-0000-4000-8000-000000000014",
        acceptedEventSeq: "4",
      },
    });

    expect(next.activeTurn).toMatchObject({
      turnId: secondTurnId,
      status: "queued",
      acceptedEventSeq: "4",
    });
    expect(next.status).toBe("submitting");
    expect(next.activity).toBe("正在准备…");
  });

  it("keeps a terminal turn terminal if a later nonterminal frame arrives", () => {
    const queued = event("1", "turn.queued", {
      turn: turnState("queued"),
      userMessageId,
    });
    const completed = event("2", "turn.completed", {
      turn: turnState("completed"),
      messageId: assistantMessageId,
    });
    const lateTool = event("3", "tool.started", {
      stepId: "80000000-0000-4000-8000-000000000008",
      toolCallId: "late-call",
      toolName: "late-tool",
    });
    const lateStarted = event("4", "turn.started", {
      turn: { ...turnState("running"), acceptedEventSeq: "1" },
    });
    const terminal = dailyConversationReducer(
      dailyConversationReducer(
        createInitialDailyConversationState(`${conversationId}:1`),
        { type: "event.apply", event: queued },
      ),
      { type: "event.apply", event: completed },
    );
    const afterTool = dailyConversationReducer(terminal, {
      type: "event.apply",
      event: lateTool,
    });
    const afterStarted = dailyConversationReducer(afterTool, {
      type: "event.apply",
      event: lateStarted,
    });

    expect(afterTool.status).toBe("completed");
    expect(afterStarted.status).toBe("completed");
    expect(afterStarted.activeTurn?.status).toBe("completed");
    expect(afterStarted.appliedSeq).toBe("4");
  });

  it("projects tool events to one safe activity line without ending the turn", () => {
    const running = dailyConversationReducer(
      createInitialDailyConversationState(`${conversationId}:1`),
      {
        type: "event.apply",
        event: event("1", "turn.started", {
          turn: {
            turnId,
            taskId,
            turnIndex: "1",
            status: "running",
            acceptedEventSeq: "1",
            errorCode: null,
          },
        }),
      },
    );
    const started = dailyConversationReducer(running, {
      type: "event.apply",
      event: event("2", "tool.started", {
        stepId: "80000000-0000-4000-8000-000000000008",
        toolCallId: "secret-call",
        toolName: "private-tool-name",
      }),
    });
    const completed = dailyConversationReducer(started, {
      type: "event.apply",
      event: event("3", "tool.completed", {
        stepId: "80000000-0000-4000-8000-000000000008",
        toolCallId: "secret-call",
        toolName: "private-tool-name",
        status: "completed",
        turn: 1,
      }),
    });

    expect(started.activity).toBe("正在使用工具…");
    expect(started.activity).not.toContain("private-tool-name");
    expect(completed.completedStepCount).toBe(1);
    expect(completed.activeTurn?.status).toBe("running");
  });

  it("resets tool progress for a new turn and ignores late tools from the old turn", () => {
    const secondTurnId = "21000000-0000-4000-8000-000000000012";
    const firstQueued = event("1", "turn.queued", {
      turn: turnState("queued"),
      userMessageId,
    });
    const firstTool = event("2", "tool.completed", {
      stepId: "80000000-0000-4000-8000-000000000008",
      toolCallId: "first-call",
      toolName: "first-tool",
      status: "completed",
      turn: 1,
    });
    const secondQueued = {
      ...event("3", "turn.queued", {
        turn: {
          ...turnState("queued"),
          turnId: secondTurnId,
          acceptedEventSeq: "3",
        },
        userMessageId: "41000000-0000-4000-8000-000000000014",
      }),
      turnId: secondTurnId,
    } as ConversationPublicEvent;
    const lateOldTool = event("4", "tool.completed", {
      stepId: "81000000-0000-4000-8000-000000000015",
      toolCallId: "late-call",
      toolName: "late-tool",
      status: "completed",
      turn: 1,
    });
    const afterFirst = dailyConversationReducer(
      dailyConversationReducer(
        createInitialDailyConversationState(`${conversationId}:1`),
        { type: "event.apply", event: firstQueued },
      ),
      { type: "event.apply", event: firstTool },
    );
    const afterSecond = dailyConversationReducer(afterFirst, {
      type: "event.apply",
      event: secondQueued,
    });
    const afterLateOldTool = dailyConversationReducer(afterSecond, {
      type: "event.apply",
      event: lateOldTool,
    });

    expect(afterFirst.completedStepCount).toBe(1);
    expect(afterSecond.completedStepCount).toBe(0);
    expect(afterLateOldTool.completedStepCount).toBe(0);
    expect(afterLateOldTool.activity).toBe("正在准备…");
  });

  it("marks deleted conversations terminal so the controller can close the stream", () => {
    const initial = dailyConversationReducer(
      createInitialDailyConversationState(`${conversationId}:1`),
      { type: "snapshot.install", snapshot: snapshot({ lastEventSeq: "0" }) },
    );
    const deleted = dailyConversationReducer(initial, {
      type: "event.apply",
      event: event("1", "conversation.deleted", { version: 2 }),
    });

    expect(deleted).toMatchObject({ status: "deleted", activity: null });
    expect(deleted.conversation?.status).toBe("deleted");
  });
});
