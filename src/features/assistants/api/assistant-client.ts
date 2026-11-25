import * as z from "zod";

import { readPublicRuntimeConfig } from "@/config/env";
import {
  AssistantDefinitionSchema,
  ConversationAttachmentSchema,
  CreateAssistantConversationRequestSchema,
  type AssistantDefinition,
  type ConversationAttachment,
  type CreateAssistantConversationRequest,
} from "../contracts/generated";

const errorSchema = z.looseObject({
  error: z.looseObject({ code: z.string(), message: z.string() }),
});
const draftSchema = z.strictObject({
  draftId: z.string().uuid(),
  assistantId: z.string(),
  status: z.enum(["open", "committing", "committed", "expired"]),
  expiresAt: z.string(),
});
const createDraftResponseSchema = z.strictObject({ reused: z.boolean(), draft: draftSchema });
const uploadFileResponseSchema = z.strictObject({ file: ConversationAttachmentSchema });
const createConversationResponseSchema = z.looseObject({
  conversation: z.looseObject({ conversationId: z.string().uuid() }),
  reused: z.boolean(),
});

export type UploadRole = "job_description" | "resume";
export type UploadDraft = z.infer<typeof draftSchema>;

export interface AssistantClient {
  listAssistants(signal?: AbortSignal): Promise<AssistantDefinition[]>;
  getAssistant(assistantId: string, signal?: AbortSignal): Promise<AssistantDefinition>;
  createUploadDraft(
    assistantId: string,
    clientRequestId: string,
    signal?: AbortSignal,
  ): Promise<{ reused: boolean; draft: UploadDraft }>;
  uploadDraftFile(
    draftId: string,
    role: UploadRole,
    file: File,
    signal?: AbortSignal,
  ): Promise<ConversationAttachment>;
  removeDraftFile(draftId: string, fileId: string, signal?: AbortSignal): Promise<void>;
  createAssistantConversation(
    assistantId: string,
    input: CreateAssistantConversationRequest,
    signal?: AbortSignal,
  ): Promise<{ conversationId: string; reused: boolean }>;
}

export class AssistantClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AssistantClientError";
  }
}

export function createAssistantClient(options: {
  baseUrl?: string;
  fetcher?: typeof fetch;
} = {}): AssistantClient {
  const baseUrl = (options.baseUrl ?? readPublicRuntimeConfig().apiBaseUrl).replace(/\/$/, "");
  const fetcher = options.fetcher ?? fetch;

  async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    const response = await fetcher(`${baseUrl}${path}`, {
      ...init,
      credentials: "same-origin",
      signal,
    });
    if (response.ok) return response;
    let code = "ASSISTANT_REQUEST_FAILED";
    let message = response.status === 403 ? "权限不足" : "助手服务暂时不可用";
    try {
      const parsed = errorSchema.parse(await response.json());
      code = parsed.error.code;
      message = parsed.error.message;
    } catch {
      // Bounded fallback: never expose proxy/HTML response bodies.
    }
    throw new AssistantClientError(response.status, code, message);
  }

  async function json<T>(path: string, init: RequestInit, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    const response = await request(path, init, signal);
    return schema.parse(await response.json());
  }

  return {
    async listAssistants(signal) {
      const body = await json(
        "/api/assistants",
        { method: "GET" },
        z.strictObject({ assistants: z.array(AssistantDefinitionSchema) }),
        signal,
      );
      return body.assistants;
    },

    async getAssistant(assistantId, signal) {
      const body = await json(
        `/api/assistants/${encodeURIComponent(assistantId)}`,
        { method: "GET" },
        z.strictObject({ assistant: AssistantDefinitionSchema }),
        signal,
      );
      return body.assistant;
    },

    createUploadDraft(assistantId, clientRequestId, signal) {
      return json("/api/upload-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId, clientRequestId }),
      }, createDraftResponseSchema, signal);
    },

    async uploadDraftFile(draftId, role, file, signal) {
      const form = new FormData();
      form.append("role", role);
      form.append("file", file);
      const body = await json(
        `/api/upload-drafts/${encodeURIComponent(draftId)}/files`,
        { method: "POST", body: form },
        uploadFileResponseSchema,
        signal,
      );
      return body.file;
    },

    async removeDraftFile(draftId, fileId, signal) {
      await request(
        `/api/upload-drafts/${encodeURIComponent(draftId)}/files/${encodeURIComponent(fileId)}`,
        { method: "DELETE" },
        signal,
      );
    },

    async createAssistantConversation(assistantId, input, signal) {
      const body = await json(
        `/api/assistants/${encodeURIComponent(assistantId)}/conversations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(CreateAssistantConversationRequestSchema.parse(input)),
        },
        createConversationResponseSchema,
        signal,
      );
      return { conversationId: body.conversation.conversationId, reused: body.reused };
    },
  };
}

export function isAssistantClientError(error: unknown): error is AssistantClientError {
  return error instanceof AssistantClientError;
}
