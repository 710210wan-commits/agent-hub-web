import type { ChatMessage } from "./chat";

export interface ChatSessionSummary {
  id: string;
  title: string;
  updatedAt: number;
  isPinned: boolean;
}

export interface LoadedChatSession {
  session: ChatSessionSummary;
  messages: ChatMessage[];
}

export interface ChatSessionTransport {
  listSessions(signal?: AbortSignal): Promise<ChatSessionSummary[]>;
  loadSession(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<LoadedChatSession>;
}

export class SessionNotFoundError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super("会话不存在或已删除");
    this.name = "SessionNotFoundError";
    this.sessionId = sessionId;
  }
}
