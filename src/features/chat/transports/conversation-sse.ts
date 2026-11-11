import {
  ConversationPublicEventSchema,
  type ConversationPublicEvent,
} from "./daily-session-contract";
import { parseFetchSse } from "./fetch-sse-stream";

export class ConversationSseError extends Error {
  readonly code = "INVALID_STREAM_EVENT";

  constructor() {
    super("会话事件流格式错误，请重新同步会话");
    this.name = "ConversationSseError";
  }
}

export async function* parseConversationSse(
  response: Response,
  conversationId: string,
  signal?: AbortSignal,
): AsyncIterable<ConversationPublicEvent> {
  for await (const frame of parseFetchSse(response, signal)) {
    const parsed = ConversationPublicEventSchema.safeParse(frame.data);
    if (!parsed.success) throw new ConversationSseError();

    const event = parsed.data;
    const expectedId = `${conversationId}:${event.eventSeq}`;
    if (
      frame.event === "message" ||
      frame.event !== event.type ||
      frame.id !== expectedId ||
      event.conversationId !== conversationId
    ) {
      throw new ConversationSseError();
    }
    yield event;
  }
}
