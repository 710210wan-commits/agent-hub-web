import {
  progressStatusLabel,
  type ProgressState,
} from "@/features/gis/progress/progress-state";

export function StageRailVariant({ state }: { state: ProgressState }) {
  return (
    <section
      className="progress-variant progress-variant-c"
      data-testid="progress-variant-c"
    >
      <header>
        <small>演示流程</small>
        <strong>{state.terminal ? "本次流程已结束" : "按固定阶段执行"}</strong>
      </header>
      <ol className="progress-stage-rail" data-testid="stage-rail-layout">
        {state.stages.map((stage, index) => (
          <li
            className={`is-${stage.status}`}
            data-stage-id={stage.id}
            data-stage-status={stage.status}
            data-testid="progress-stage"
            key={stage.id}
          >
            <span className="progress-stage-index">{index + 1}</span>
            <div>
              <strong>{stage.label}</strong>
              <small>{progressStatusLabel[stage.status]}</small>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
