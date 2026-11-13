import { z } from "zod";
import { CapabilitySelectionSchema, ConversationCapabilityCatalogSchema } from "../conversation/contracts/generated";

export { CapabilitySelectionSchema, ConversationCapabilityCatalogSchema };
export type CapabilitySelection = z.infer<typeof CapabilitySelectionSchema>;
export type ConversationCapabilityCatalog = z.infer<typeof ConversationCapabilityCatalogSchema>;

export function snapshotCapabilitySelection(selection: CapabilitySelection): CapabilitySelection {
  const snapshot = { knowledgeBaseIds: [...selection.knowledgeBaseIds], skillIds: [...selection.skillIds], mcpServerIds: [...selection.mcpServerIds] };
  Object.values(snapshot).forEach(Object.freeze);
  return Object.freeze(snapshot);
}
