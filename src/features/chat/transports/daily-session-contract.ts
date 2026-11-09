import { z } from "zod";

/**
 * Frontend wire boundary pinned to projects_new@098201a.
 * Sources:
 * - packages/shared/src/types/conversation.ts (C01-A Conversation DTOs)
 * - api/src/modules/conversations/routes.ts
 * - api/src/modules/auth/routes.ts (separately labelled auth DTOs)
 *
 * Deliberately excludes turn submission, events, SSE, and lifecycle DTOs.
 */

const ScenarioIdSchema = z.enum([
  "daily",
  "gis-standard",
  "gis-demo",
  "osint",
  "marine",
  "emergency",
  "border",
  "demo",
]);

const ConversationAgentKeySchema = z.enum([
  "agent-loop",
  "border-defense-qa",
  "border-defense-daily-report",
]);

const ConversationStatusSchema = z.enum(["open", "closed", "deleted"]);
const ConversationTurnStatusSchema = z.enum([
  "queued",
  "running",
  "cancelling",
  "completed",
  "failed",
  "interrupted",
]);
const ConversationMessageRoleSchema = z.enum(["user", "assistant"]);

export const ConversationSequenceSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/)
  .refine(
    (value) => BigInt(value) <= BigInt("9223372036854775807"),
    "sequence exceeds PostgreSQL bigint range",
  );

const ConversationVersionSchema = z.number().int().min(1).max(2_147_483_647);
const uuid = z.string().uuid();
const timestamp = z.iso.datetime({ offset: true });

export const ConversationMetadataSchema = z.strictObject({
  conversationId: uuid,
  scenarioId: ScenarioIdSchema,
  agentKey: ConversationAgentKeySchema,
  title: z.string(),
  status: ConversationStatusSchema,
  archivedAt: timestamp.nullable(),
  version: ConversationVersionSchema,
  lastEventSeq: ConversationSequenceSchema,
  lastTurnIndex: ConversationSequenceSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const ConversationActiveTurnSchema = z.strictObject({
  turnId: uuid,
  taskId: uuid,
  turnIndex: ConversationSequenceSchema,
  status: ConversationTurnStatusSchema,
  acceptedEventSeq: ConversationSequenceSchema,
  errorCode: z.string().nullable(),
});

export const ConversationMessageSchema = z.strictObject({
  messageId: uuid,
  conversationId: uuid,
  turnId: uuid,
  ordinal: ConversationSequenceSchema,
  role: ConversationMessageRoleSchema,
  content: z.record(z.string(), z.unknown()),
  revision: z.literal(1),
  status: z.literal("committed"),
  artifactRefs: z.array(z.unknown()),
  createdAt: timestamp,
});

const pageFields = {
  messages: z.array(ConversationMessageSchema),
  nextCursor: z.string().nullable(),
  lastEventSeq: ConversationSequenceSchema,
};

export const ConversationMessagePageSchema = z.strictObject(pageFields);

export const ConversationSnapshotSchema = z.strictObject({
  conversation: ConversationMetadataSchema,
  activeTurn: ConversationActiveTurnSchema.nullable(),
  ...pageFields,
});

export const ConversationListSchema = z.strictObject({
  conversations: z.array(ConversationMetadataSchema),
  nextCursor: z.string().nullable(),
});

export const CreatedConversationSchema = z.strictObject({
  conversation: ConversationMetadataSchema,
  reused: z.boolean(),
});

export const RenamedConversationSchema = z.strictObject({
  conversation: ConversationMetadataSchema,
});

export const CreateConversationRequestSchema = z.strictObject({
  clientRequestId: uuid,
  scenarioId: ScenarioIdSchema,
  agentKey: ConversationAgentKeySchema,
  title: z.string().trim().min(1).max(200).optional(),
});

export const RenameConversationRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  expectedVersion: ConversationVersionSchema,
});

export const DailySessionErrorEnvelopeSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string(),
    requestId: uuid,
  }),
});

// Auth DTOs are current auth-route contracts, not part of C01-A.
export const DailySessionUserSchema = z.strictObject({
  id: z.string().min(1),
  displayName: z.string().min(1),
  sessionExpiresAt: timestamp,
});

export const DailySessionAuthStatusSchema = z.discriminatedUnion("enabled", [
  z.strictObject({
    enabled: z.literal(false),
    xiaozhiUrl: z.string().min(1),
  }),
  z.strictObject({
    enabled: z.literal(true),
    xiaozhiUrl: z.string().min(1),
    user: DailySessionUserSchema,
  }),
]);

export const DailySessionLoginResponseSchema = z.strictObject({
  success: z.literal(true),
  user: DailySessionUserSchema,
  kbUnavailable: z.literal(true).optional(),
});

export const DailySessionLogoutResponseSchema = z.strictObject({
  ok: z.literal(true),
});

export const DailySessionAuthErrorSchema = z.strictObject({
  error: z.string(),
});

export type ConversationMetadata = z.infer<typeof ConversationMetadataSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type ConversationMessagePage = z.infer<
  typeof ConversationMessagePageSchema
>;
export type ConversationSnapshot = z.infer<typeof ConversationSnapshotSchema>;
export type ConversationList = z.infer<typeof ConversationListSchema>;
export type CreatedConversation = z.infer<typeof CreatedConversationSchema>;
export type CreateConversationRequest = z.infer<
  typeof CreateConversationRequestSchema
>;
export type RenameConversationRequest = z.infer<
  typeof RenameConversationRequestSchema
>;
export type DailySessionUser = z.infer<typeof DailySessionUserSchema>;
export type DailySessionAuthStatus = z.infer<
  typeof DailySessionAuthStatusSchema
>;
