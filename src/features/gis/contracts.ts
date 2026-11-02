import type { ChatStreamEvent } from "@/features/chat/contracts/events";
import type { CreatedChatRun } from "@/features/chat/contracts/transport";

export type GisDemoId =
  | "oil-spill"
  | "fire-investigation"
  | "earthquake-assessment"
  | "flood-assessment";

export type CreateGisRunInput =
  | { profile: "standard"; query: string }
  | { profile: "demo"; demoId: GisDemoId };

export interface GisUpdate {
  version: 1;
  taskId: string;
  key: string;
  toolCallId?: string;
  toolName?: string;
  gisData: Record<string, unknown>;
}

export type GisStreamEvent =
  | ChatStreamEvent
  | { type: "gis.update"; update: GisUpdate };

export interface GisTransport {
  readonly kind: "projects-new";
  createRun(input: CreateGisRunInput, signal?: AbortSignal): Promise<CreatedChatRun>;
  streamRun(runId: string, signal?: AbortSignal): AsyncIterable<GisStreamEvent>;
  abortRun(runId: string): Promise<void>;
}
