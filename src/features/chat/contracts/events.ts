export type ChatStreamEvent =
  | { type: "run.connected"; runId: string }
  | {
      type: "activity.update";
      label: string;
      completedStepCount?: number;
    }
  | { type: "answer.delta"; delta: string }
  | { type: "answer.done"; content?: string }
  | { type: "run.stopped"; reason: string }
  | { type: "run.disconnected"; warning: string }
  | { type: "run.failed"; message: string };
