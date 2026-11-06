import {
  type SkillMarketError,
  type SkillMarketErrorArea,
  type SkillMarketRecoveryAction,
  skillMarketErrorPresentation,
} from "../contracts/error";

export interface SkillMarketErrorStateProps {
  error: SkillMarketError;
  onRecover?: (action: SkillMarketRecoveryAction) => void;
}

const AREA_LABELS: Record<SkillMarketErrorArea, string> = {
  creator: "Creator",
  draft: "草稿",
  review: "审核",
  publication: "发布管理",
  general: "Skill Market",
};

export function SkillMarketErrorState({ error, onRecover }: SkillMarketErrorStateProps) {
  const presentation = skillMarketErrorPresentation(error);
  return (
    <section className="state-card error-state skill-market-error-state" role="alert">
      <h2>{presentation.title}</h2>
      <p>{error.userMessage}</p>
      {error.area ? <small>区域：{AREA_LABELS[error.area]}</small> : null}
      {error.diagnostics?.length ? (
        <ul aria-label="校验问题">
          {error.diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}-${diagnostic.field ?? "general"}-${diagnostic.line ?? index}`}>
              <p>{diagnostic.message}</p>
              {diagnostic.field || diagnostic.line ? (
                <small>
                  位置：{diagnostic.field ?? "未指定"}
                  {diagnostic.line ? `（第 ${diagnostic.line} 行）` : ""}
                </small>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error.requestId ? <small>排障 ID：{error.requestId}</small> : null}
      {onRecover ? (
        <button type="button" onClick={() => onRecover(error.recovery)}>
          {presentation.actionLabel}
        </button>
      ) : null}
    </section>
  );
}
