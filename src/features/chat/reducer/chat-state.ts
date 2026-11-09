import type { ChatMessage, ChatSelectionSnapshot } from "../contracts/chat";

export type ChatRunState =
  | "idle"
  | "submitting"
  | "working"
  | "streaming"
  | "stopped"
  | "completed"
  | "disconnected"
  | "failed";

export interface ChatRunView {
  status: ChatRunState;
  runId: string | null;
  assistantMessageId: string | null;
  activity: string | null;
  notice: string | null;
  completedStepCount: number;
}

export interface ChatState {
  messages: ChatMessage[];
  draftSelection: ChatSelectionSnapshot;
  sessionId: string | null;
  sessionStatus: "idle" | "loading" | "ready" | "not-found" | "failed";
  sessionError: string | null;
  run: ChatRunView;
}

export function createEmptySelection(): ChatSelectionSnapshot {
  return { knowledgeBaseIds: [], skillIds: [], mcpIds: [] };
}

export function createInitialChatState(sessionId?: string): ChatState {
  return {
    messages: [],
    draftSelection: createEmptySelection(),
    sessionId: sessionId ?? null,
    sessionStatus: sessionId ? "loading" : "idle",
    sessionError: null,
    run: {
      status: "idle",
      runId: null,
      assistantMessageId: null,
      activity: null,
      notice: null,
      completedStepCount: 0,
    },
  };
}
