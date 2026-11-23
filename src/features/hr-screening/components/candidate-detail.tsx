import type {
  HrConversationState,
  HrCriterion,
  HrScreeningBatchItem,
} from "@/features/assistants/contracts/generated";

const tierLabels = {
  recommended: "推荐进入下一轮",
  manual_review: "待人工复核",
  not_matched: "暂不匹配",
} as const;

const decisionLabels = {
  meets: "满足",
  does_not_meet: "不满足",
  insufficient_evidence: "证据不足",
} as const;

export function CandidateDetail({
  candidate,
  item,
  criteria,
  onRetry,
}: {
  candidate?: HrConversationState["candidates"][number];
  item: HrScreeningBatchItem;
  criteria: HrCriterion[];
  onRetry?(item: HrScreeningBatchItem): void;
}) {
  return (
    <article aria-label="候选人评估详情">
      <header>
        <h3>{candidate?.displayName ?? "候选人"}</h3>
        {item.advisoryTier ? <strong>{tierLabels[item.advisoryTier]}</strong> : null}
      </header>
      {item.status === "failed" ? <p>该候选人评估失败，可单独重试。</p> : null}
      {item.status === "cancelled" ? <p>该候选人的本轮评估已取消。</p> : null}
      {criteria.map(criterion => {
        const assessment = item.assessments.find(entry => entry.criterionId === criterion.criterionId);
        return (
          <section key={criterion.criterionId}>
            <h4>{criterion.title}</h4>
            <p>{assessment ? decisionLabels[assessment.decision] : "证据不足"}</p>
            {assessment?.evidence.length ? (
              <ul aria-label="已校验证据">
                {assessment.evidence.map(reference => (
                  <li key={reference.blockId}>
                    <blockquote>{reference.quote}</blockquote>
                    <small>{reference.blockId}</small>
                  </li>
                ))}
              </ul>
            ) : null}
            {assessment?.missingInformation.length ? (
              <div>
                <strong>缺失信息</strong>
                <ul>{assessment.missingInformation.map(value => <li key={value}>{value}</li>)}</ul>
              </div>
            ) : null}
            {assessment?.followUpQuestions.length ? (
              <div>
                <strong>建议追问</strong>
                <ul>{assessment.followUpQuestions.map(value => <li key={value}>{value}</li>)}</ul>
              </div>
            ) : null}
          </section>
        );
      })}
      {item.status === "failed" && onRetry ? (
        <button onClick={() => onRetry(item)} type="button">重试该候选人</button>
      ) : null}
    </article>
  );
}
