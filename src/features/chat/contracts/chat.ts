import type { AppMode } from "@/config/modes";

export interface ChatSelectionSnapshot {
  knowledgeBaseIds: string[];
  skillIds: string[];
  mcpIds: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  selection?: ChatSelectionSnapshot;
}

export interface CreateChatRunInput {
  mode: AppMode;
  content: string;
  selection: ChatSelectionSnapshot;
}
