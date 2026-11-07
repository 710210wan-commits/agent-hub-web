"use client";

import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { SkillMarketWorkPlaceholder } from "@/features/skills/catalog/skill-catalog-plaza";
import { SkillMarketErrorState } from "@/features/skills/components/skill-market-error-state";
import { useAppMode } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { getBrowserSkillMarketClient } from "../api/browser-client";
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
      <header className="page-heading">
        <div><h1>Skill 审核</h1><p>仅展示后端授权给当前 Principal 的提交</p></div>
        <div className="skill-page-actions">
          <Link href="/skills?mode=daily">返回广场</Link>
          <button type="button" onClick={refresh}>刷新</button>
        </div>
      </header>
      {state.submissions.length ? (
        <div className="resource-grid">
          {state.submissions.map((submission) => (
            <Link className="resource-card" href={`/skills/review/${encodeURIComponent(submission.id)}?mode=daily`} key={submission.id}>
              <span className="resource-card-copy">
                <strong>{submission.name}</strong>
                <span>状态：{submission.status}</span>
                <small>r{submission.revision} · {new Date(submission.submittedAt).toLocaleString("zh-CN")}</small>
              </span>
              <span className="skill-badge">{submission.triggerRuns.length} 次 Trigger</span>
            </Link>
          ))}
        </div>
      ) : <EmptyState title="当前没有可审核的提交" description="队列由后端按当前 Principal 权限返回。" />}
    </section>
  );
}
