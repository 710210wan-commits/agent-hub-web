import {
  progressStatusLabel,
  type ProgressState,
} from "@/features/gis/progress/progress-state";

export function ExpandableTimelineVariant({ state }: { state: ProgressState }) {
  const current =
    state.stages.find((stage) => stage.status === "running") ??
    [...state.stages].reverse().find((stage) => stage.status !== "pending");

  return (
    <section
      className="progress-variant progress-variant-b"
      data-testid="progress-variant-b"
    >
      <div className="progress-timeline-current">
        <small>任务进度</small>
        <strong>{current?.label ?? "等待任务开始"}</strong>
      </div>
      <details className="progress-timeline" data-testid="expandable-timeline-layout">
        <summary>查看全部阶段</summary>
        <ol>
          {state.stages.map((stage) => (
            <li
              className={`is-${stage.status}`}
              data-stage-id={stage.id}
              data-stage-status={stage.status}
              data-testid="progress-stage"
              key={stage.id}
            >
              <span aria-hidden="true" />
              <div>
                <strong>{stage.label}</strong>
                <small>{progressStatusLabel[stage.status]}</small>
              </div>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
