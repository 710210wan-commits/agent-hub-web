"use client";

import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { SkillMarketWorkPlaceholder } from "@/features/skills/catalog/skill-catalog-plaza";
import { SkillMarketErrorState } from "@/features/skills/components/skill-market-error-state";
import { SkillBackLink } from "@/features/skills/components/skill-back-link";
import { useAppMode } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { getBrowserSkillMarketClient } from "../api/browser-client";
import { ReviewEvidence } from "./review-evidence";
import type { ReviewSubmissionViewModel } from "./review-view-model";
import { useReviewQueue } from "./use-review-queue";

export function SkillReviewQueue({ client }: { client?: SkillMarketClient }) {
  const { mode } = useAppMode();
  if (mode === "work") return <SkillMarketWorkPlaceholder />;
  return <SkillReviewQueueDaily client={client ?? getBrowserSkillMarketClient()} />;
}

function SkillReviewQueueDaily({ client }: { client: SkillMarketClient }) {
  const { refresh, state } = useReviewQueue(client);
  if (state.kind === "loading") return <LoadingState label="正在加载审核队列…" />;
  if (state.kind === "error") return <SkillMarketErrorState error={state.error} onRecover={refresh} />;

  return (
    <section className="resource-page skill-review-queue">
      <SkillBackLink href="/skills?mode=1">返回 Skill 广场</SkillBackLink>
      <header className="page-heading">
        <div><h1>Skill 审核队列</h1><p>审查冻结快照、Tool 事实、Validator、Diff、Smoke 与 Trigger 证据</p></div>
      </header>
      {state.submissions.length ? (
        <div className="skill-review-queue-list">
          {state.submissions.map((submission) => (
            <article className="skill-review-queue-card" key={submission.id}>
              <div className="skill-review-queue-heading">
                <div>
                  <h2>{submission.name}</h2>
                  <p>作者 {submission.authorId} · 修订 r{submission.revision} · {submission.status}</p>
                  <code>Artifact SHA-256 {submission.contentHash}</code>
                </div>
                <div className="skill-review-queue-actions skill-catalog-actions">
                  <span className="skill-badge">{submission.triggerRuns.length} 次 Trigger</span>
                  <Link
                    aria-label={`进入审核 ${submission.name}`}
                    className="skill-page-action skill-page-action-primary"
                    href={`/skills/review/${encodeURIComponent(submission.id)}?mode=1`}
                  >
                    {reviewActionLabel(submission)}
                  </Link>
                </div>
              </div>
              <details className="skill-review-snapshot" open>
                <summary>冻结审核快照</summary>
                <ReviewEvidence submission={submission} />
              </details>
            </article>
          ))}
        </div>
      ) : <EmptyState title="当前没有可审核的提交" description="队列由后端按当前 Principal 权限返回。" />}
    </section>
  );
}

function reviewActionLabel(submission: ReviewSubmissionViewModel): string {
  return submission.status === "pending_review"
    ? "进入审核"
    : submission.status === "approved"
      ? "发布"
      : "查看详情";
}
