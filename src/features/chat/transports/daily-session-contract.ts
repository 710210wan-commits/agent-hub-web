import { z } from "zod";

import {
  AcceptedConversationTurnSchema,
  CapabilitySelectionSchema,
  CancelledConversationTurnSchema,
  ConversationErrorSchema,
  ConversationEventPageSchema,
  ConversationListSchema,
  ConversationMessagePageSchema,
  ConversationPublicEventSchema,
  ConversationSequenceSchema,
  ConversationSnapshotSchema,
  CreateConversationRequestSchema,
  CreatedConversationSchema,
  RenameConversationRequestSchema,
  RenamedConversationSchema,
  SubmitConversationTurnRequestSchema,
  conversationContractMetadata,
} from "../conversation/contracts/generated";

export {
  AcceptedConversationTurnSchema,
  CapabilitySelectionSchema,
  CancelledConversationTurnSchema,
  ConversationEventPageSchema,
  ConversationListSchema,
  ConversationMessagePageSchema,
  ConversationPublicEventSchema,
  ConversationSequenceSchema,
  ConversationSnapshotSchema,
  CreateConversationRequestSchema,
  CreatedConversationSchema,
  RenameConversationRequestSchema,
  RenamedConversationSchema,
  SubmitConversationTurnRequestSchema,
  conversationContractMetadata,
};

export const ConversationMetadataSchema =
  ConversationListSchema.shape.conversations.element;
export const ConversationMessageSchema =
  ConversationMessagePageSchema.shape.messages.element;
export const DailySessionErrorEnvelopeSchema = ConversationErrorSchema;

export type AcceptedConversationTurn = z.infer<
  typeof AcceptedConversationTurnSchema
>;
export type CapabilitySelection = z.infer<typeof CapabilitySelectionSchema>;
export type CancelledConversationTurn = z.infer<
  typeof CancelledConversationTurnSchema
>;
export type ConversationEventPage = z.infer<typeof ConversationEventPageSchema>;
export type ConversationList = z.infer<typeof ConversationListSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type ConversationMessagePage = z.infer<
  typeof ConversationMessagePageSchema
>;
export type ConversationMetadata = z.infer<typeof ConversationMetadataSchema>;
export type ConversationPublicEvent = z.infer<
  typeof ConversationPublicEventSchema
>;
export type ConversationSnapshot = z.infer<typeof ConversationSnapshotSchema>;
export type ConversationSequence = z.infer<typeof ConversationSequenceSchema>;
export type CreateConversationRequest = z.infer<
  typeof CreateConversationRequestSchema
>;
export type CreatedConversation = z.infer<typeof CreatedConversationSchema>;
export type RenameConversationRequest = z.infer<
  typeof RenameConversationRequestSchema
>;
export type SubmitConversationTurnRequest = z.infer<
  typeof SubmitConversationTurnRequestSchema
>;
