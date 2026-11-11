import { describe, expect, it } from "vitest";

import { parseConversationSse } from "./conversation-sse";

const conversationId = "10000000-0000-4000-8000-000000000001";
const createdEvent = {
  eventId: "70000000-0000-4000-8000-000000000007",
  eventSeq: "3",
  conversationId,
  schemaVersion: 1,
  type: "conversation.created",
  occurredAt: "2026-11-09T01:03:04.000Z",
  payload: { version: 1 },
} as const;

function responseFromText(text: string): Response {
  return new Response(text, {
    headers: { "content-type": "text/event-stream" },
  });
}

async function collect(text: string) {
  return Array.fromAsync(
    parseConversationSse(responseFromText(text), conversationId),
  );
}

function frame(input?: {
  event?: string;
  id?: string;
  data?: unknown;
}): string {
  return (
    `event: ${input?.event ?? createdEvent.type}\n` +
    `id: ${input?.id ?? `${conversationId}:${createdEvent.eventSeq}`}\n` +
    `data: ${JSON.stringify(input?.data ?? createdEvent)}\n\n`
  );
}

describe("parseConversationSse", () => {
  it("ignores comments and validates a canonical named event", async () => {
    await expect(collect(`: heartbeat\n\n${frame()}`)).resolves.toEqual([
      createdEvent,
    ]);
  });

  it("rejects an unnamed event instead of accepting the SSE message default", async () => {
    const text =
      `id: ${conversationId}:3\n` +
      `data: ${JSON.stringify(createdEvent)}\n\n`;

    await expect(collect(text)).rejects.toMatchObject({
      code: "INVALID_STREAM_EVENT",
    });
  });

  it("rejects when the named event differs from payload.type", async () => {
    await expect(
      collect(frame({ event: "turn.started" })),
    ).rejects.toMatchObject({ code: "INVALID_STREAM_EVENT" });
  });

  it("rejects an id not scoped to conversationId and eventSeq", async () => {
    await expect(
      collect(frame({ id: `${conversationId}:999` })),
    ).rejects.toMatchObject({ code: "INVALID_STREAM_EVENT" });
  });

  it("rejects data outside the generated ConversationPublicEvent schema", async () => {
    await expect(
      collect(frame({ data: { ...createdEvent, payload: {} } })),
    ).rejects.toMatchObject({ code: "INVALID_STREAM_EVENT" });
  });
});
