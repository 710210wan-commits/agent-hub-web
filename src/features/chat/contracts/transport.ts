import type { CreateChatRunInput } from "./chat";
import type { ChatStreamEvent } from "./events";
import type { ChatSessionTransport } from "./session";

export interface ChatTransportCapabilities {
  selections: boolean;
  answerDeltas: boolean;
  resume: boolean;
}

export interface CreatedChatRun {
  runId: string;
  sessionId?: string;
}

export interface ChatTransport {
  readonly kind: "mock" | "projects-new" | "xiaozhi";
  readonly capabilities: ChatTransportCapabilities;
  readonly sessions?: ChatSessionTransport;
  createRun(input: CreateChatRunInput, signal?: AbortSignal): Promise<CreatedChatRun>;
  resumeRun?(runId: string, signal?: AbortSignal): Promise<CreatedChatRun>;
  streamRun(runId: string, signal?: AbortSignal): AsyncIterable<ChatStreamEvent>;
  abortRun(runId: string): Promise<void>;
}
