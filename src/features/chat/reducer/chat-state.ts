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
  run: ChatRunView;
}

export function createEmptySelection(): ChatSelectionSnapshot {
  return { knowledgeBaseIds: [], skillIds: [], mcpIds: [] };
}

export function createInitialChatState(): ChatState {
  return {
    messages: [],
    draftSelection: createEmptySelection(),
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
