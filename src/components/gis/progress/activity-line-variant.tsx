import {
  progressStatusLabel,
  type ProgressState,
} from "@/features/gis/progress/progress-state";

export function ActivityLineVariant({ state }: { state: ProgressState }) {
  const current =
    state.stages.find((stage) => stage.status === "running") ??
    [...state.stages].reverse().find((stage) => stage.status !== "pending") ??
    state.stages[0];
  const completed = state.stages.filter(
    (stage) => stage.status === "completed",
  ).length;

  return (
    <section
      className="progress-variant progress-variant-a"
      data-testid="progress-variant-a"
    >
      <div className="progress-activity-line" data-testid="activity-line-layout">
        <span
          className={`progress-pulse is-${current?.status ?? "pending"}`}
          aria-hidden="true"
        />
        <div>
          <small>当前动作</small>
          <strong>{current?.label ?? "等待任务开始"}</strong>
        </div>
        <span className="progress-count">已完成 {completed}</span>
      </div>
      <div aria-label="阶段概览" className="progress-dot-row">
        {state.stages.map((stage) => (
          <span
            aria-label={`${stage.label}：${progressStatusLabel[stage.status]}`}
            className={`progress-dot is-${stage.status}`}
            data-stage-id={stage.id}
            data-stage-status={stage.status}
            data-testid="progress-stage"
            key={stage.id}
            title={`${stage.label} · ${progressStatusLabel[stage.status]}`}
          />
        ))}
      </div>
    </section>
  );
}
