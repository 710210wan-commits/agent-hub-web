import type { ChatMessage, ChatSelectionSnapshot } from "../contracts/chat";
import type { ChatStreamEvent } from "../contracts/events";
import { createInitialChatState, type ChatState } from "./chat-state";

export type ChatAction =
  | {
      type: "message.submit";
      userMessage: Omit<ChatMessage, "role" | "selection"> & {
        role?: "user";
        selection: ChatSelectionSnapshot;
      };
      assistantMessageId: string;
    }
  | { type: "selection.change"; selection: ChatSelectionSnapshot }
  | { type: "stream.event"; event: ChatStreamEvent }
  | { type: "run.retry" }
  | { type: "run.continue" }
  | { type: "session.reset"; sessionId?: string }
  | { type: "session.load.start" }
  | {
      type: "session.load.success";
      sessionId: string;
      messages: ChatMessage[];
    }
  | { type: "session.load.not-found" }
  | { type: "session.load.failed"; message: string }
  | { type: "session.resolve"; sessionId: string };

function cloneSelection(
  selection: ChatSelectionSnapshot,
): ChatSelectionSnapshot {
  return {
    knowledgeBaseIds: [...selection.knowledgeBaseIds],
    skillIds: [...selection.skillIds],
    mcpIds: [...selection.mcpIds],
  };
}

function updateAssistantContent(
  state: ChatState,
  update: (content: string) => string,
): ChatMessage[] {
  const assistantMessageId = state.run.assistantMessageId;
  if (!assistantMessageId) return state.messages;
  return state.messages.map((message) =>
    message.id === assistantMessageId
      ? { ...message, content: update(message.content) }
      : message,
  );
}

function applyStreamEvent(
  state: ChatState,
  event: ChatStreamEvent,
): ChatState {
  switch (event.type) {
    case "run.connected":
      return { ...state, run: { ...state.run, runId: event.runId } };
    case "activity.update":
      return {
        ...state,
        run: {
          ...state.run,
          status: "working",
          activity: event.label,
          completedStepCount:
            event.completedStepCount ?? state.run.completedStepCount,
        },
      };
    case "answer.delta":
      return {
        ...state,
        messages: updateAssistantContent(state, (content) => content + event.delta),
        run: { ...state.run, status: "streaming", activity: null },
      };
    case "answer.done":
      return {
        ...state,
        messages:
          event.content === undefined
            ? state.messages
            : updateAssistantContent(state, () => event.content ?? ""),
        run: { ...state.run, status: "completed", activity: null, notice: null },
      };
    case "run.stopped":
      return {
        ...state,
        run: {
          ...state.run,
          status: "stopped",
          activity: null,
          notice: event.reason,
        },
      };
    case "run.disconnected":
      return {
        ...state,
        run: {
          ...state.run,
          status: "disconnected",
          activity: null,
          notice: event.warning,
        },
      };
    case "run.failed":
      return {
        ...state,
        run: {
          ...state.run,
          status: "failed",
          activity: null,
          notice: event.message,
        },
      };
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "message.submit": {
      const selection = cloneSelection(action.userMessage.selection);
      const userMessage: ChatMessage = {
        ...action.userMessage,
        role: "user",
        selection,
      };
      const assistantMessage: ChatMessage = {
        id: action.assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: action.userMessage.createdAt,
      };
      return {
        ...state,
        messages: [...state.messages, userMessage, assistantMessage],
        draftSelection: cloneSelection(selection),
        run: {
          status: "submitting",
          runId: null,
          assistantMessageId: action.assistantMessageId,
          activity: null,
          notice: null,
          completedStepCount: 0,
        },
      };
    }
    case "selection.change":
      return {
        ...state,
        draftSelection: cloneSelection(action.selection),
      };
    case "stream.event":
      return applyStreamEvent(state, action.event);
    case "run.retry":
      return {
        ...state,
        messages: updateAssistantContent(state, () => ""),
        run: {
          ...state.run,
          status: "submitting",
          runId: null,
          activity: null,
          notice: null,
          completedStepCount: 0,
        },
      };
    case "run.continue":
      return {
        ...state,
        run: {
          ...state.run,
          status: "submitting",
          runId: null,
          activity: null,
          notice: null,
        },
      };
    case "session.reset":
      return createInitialChatState(action.sessionId);
    case "session.load.start":
      return {
        ...state,
        sessionStatus: "loading",
        sessionError: null,
      };
    case "session.load.success":
      return {
        ...state,
        messages: [...action.messages],
        sessionId: action.sessionId,
        sessionStatus: "ready",
        sessionError: null,
      };
    case "session.load.not-found":
      return {
        ...state,
        messages: [],
        sessionId: null,
        sessionStatus: "not-found",
        sessionError: "会话不存在或已删除",
      };
    case "session.load.failed":
      return {
        ...state,
        messages: [],
        sessionStatus: "failed",
        sessionError: action.message,
      };
    case "session.resolve":
      return {
        ...state,
        sessionId: action.sessionId,
        sessionStatus: "ready",
        sessionError: null,
      };
  }
}
