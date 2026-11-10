"use client";

import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { SkillMarketWorkPlaceholder } from "@/features/skills/catalog/skill-catalog-plaza";
import { SkillMarketErrorState } from "@/features/skills/components/skill-market-error-state";
import { useAppMode } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { getBrowserSkillMarketClient } from "../api/browser-client";
import { usePublications } from "./use-publications";

export function SkillPublicationList({ client }: { client?: SkillMarketClient }) {
  const { mode } = useAppMode();
  if (mode === "work") return <SkillMarketWorkPlaceholder />;
  return <SkillPublicationListDaily client={client ?? getBrowserSkillMarketClient()} />;
}

function SkillPublicationListDaily({ client }: { client: SkillMarketClient }) {
  const { refresh, state } = usePublications(client);
  if (state.kind === "loading") return <LoadingState label="正在加载发布记录…" />;
  if (state.kind === "error") {
    return <section className="resource-page"><Link className="back-link" href="/skills?mode=daily">← 返回 Skill 广场</Link><SkillMarketErrorState error={state.error} onRecover={state.error.recovery === "back" ? undefined : refresh} /></section>;
  }

  return (
    <section className="resource-page skill-publication-list">
      <header className="page-heading">
        <div><h1>发布管理</h1><p>Publication、Artifact 与 daily 安装状态</p></div>
        <div className="skill-page-actions skill-catalog-actions">
          <Link className="skill-page-action" href="/skills?mode=daily">返回广场</Link>
        </div>
      </header>
      {state.publications.length ? <div className="resource-grid">{state.publications.map((publication) => (
        <Link className="resource-card" href={`/skills/manage/${encodeURIComponent(publication.id)}?mode=daily`} key={publication.id}>
          <span className="resource-card-copy">
            <strong>{publication.skillName}</strong>
            <span>状态：{publication.status} · {publication.installationSummary}</span>
            <small>r{publication.revision} · {shortHash(publication.contentHash)}</small>
          </span>
          <span className="skill-badge">{publication.isLatest ? "最新修订" : "历史版本"}</span>
        </Link>
      ))}</div> : <EmptyState title="当前没有 Publication" description="发布成功后会出现在这里。" />}
    </section>
  );
}

function shortHash(value: string) { return `${value.slice(0, 10)}…${value.slice(-8)}`; }
