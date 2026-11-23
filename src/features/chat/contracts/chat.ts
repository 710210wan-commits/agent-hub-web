import type { AppMode } from "@/config/modes";

export interface ChatSelectionSnapshot {
  knowledgeBaseIds: string[];
  skillIds: string[];
  mcpServerIds: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  selection?: ChatSelectionSnapshot;
  attachments?: Array<{
    fileId: string;
    role: "job_description" | "resume";
    name: string;
    contentType: string;
    sizeBytes: number;
  }>;
  artifactRefs?: Array<{
    kind: "screening_result";
    batchId: string;
  }>;
}

export interface CreateChatRunInput {
  mode: AppMode;
  content: string;
  selection: ChatSelectionSnapshot;
  sessionId?: string;
}
