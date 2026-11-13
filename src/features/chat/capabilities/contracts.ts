import { z } from "zod";
import { CapabilitySelectionSchema, ConversationCapabilityCatalogSchema } from "../conversation/contracts/generated";

export { CapabilitySelectionSchema, ConversationCapabilityCatalogSchema };
export type CapabilitySelection = z.infer<typeof CapabilitySelectionSchema>;
export type ConversationCapabilityCatalog = z.infer<typeof ConversationCapabilityCatalogSchema>;
