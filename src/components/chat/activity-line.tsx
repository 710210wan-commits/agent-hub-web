import type { ChatRunView } from "@/features/chat/reducer/chat-state";

export function ActivityLine({ run }: { run: ChatRunView }) {
  if (run.status === "working" && run.activity) {
    return (
      <div className="activity-line" data-testid="activity-line">
        <span className="activity-dot" />
        <span>{run.activity}</span>
      </div>
    );
  }

  if (
    run.completedStepCount > 0 &&
    ["streaming", "completed", "stopped", "disconnected"].includes(run.status)
  ) {
    return (
      <button className="completed-steps" type="button">
        已完成 {run.completedStepCount} 个步骤
      </button>
    );
  }

  return null;
}
