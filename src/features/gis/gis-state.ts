import type { GisUpdate } from "./contracts";
import type { ProgressState } from "./progress/progress-state";
import { createProgressState } from "./progress/progress-reducer";

export type GisRunStatus =
  | "idle"
  | "submitting"
  | "working"
  | "completed"
  | "failed"
  | "stopped"
  | "disconnected";

export interface GisLayerState {
  update: GisUpdate;
  kept: boolean;
}

export interface GisState {
  status: GisRunStatus;
  runId: string | null;
  activeTaskId: string | null;
  answer: string;
  notice: string | null;
  progress: ProgressState;
  layers: GisLayerState[];
}

export function createInitialGisState(): GisState {
  return {
    status: "idle",
    runId: null,
    activeTaskId: null,
    answer: "",
    notice: null,
    progress: createProgressState(),
    layers: [],
  };
}
