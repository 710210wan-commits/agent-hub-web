"use client";

import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { SkillMarketErrorState } from "@/features/skills/components/skill-market-error-state";
import { useAppMode } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { getBrowserSkillMarketClient } from "../api/browser-client";
import { EMPTY_SKILL_CATALOG_FILTER } from "./catalog-filter";
import { catalogDetailHref } from "./catalog-navigation";
import { SkillCatalogCard } from "./skill-catalog-card";
import { SkillMarketWorkPlaceholder } from "./skill-catalog-plaza";
import { useSkillMine } from "./use-skill-mine";

export function SkillMine({ client }: { client?: SkillMarketClient }) {
  const { mode } = useAppMode();
  if (mode === "work") return <SkillMarketWorkPlaceholder />;
  return <SkillMineDaily client={client ?? getBrowserSkillMarketClient()} />;
}

function SkillMineDaily({ client }: { client: SkillMarketClient }) {
  const { refresh, state } = useSkillMine(client);
  if (state.kind === "loading") return <LoadingState label="正在加载我的 Skill…" />;
  if (state.kind === "error") {
    return <SkillMarketErrorState error={state.error} onRecover={refresh} />;
  }

  const { drafts, enabled, available } = state.data;
  return (
    <section className="resource-page skill-mine">
      <header className="page-heading">
        <div><h1>我的 Skill</h1><p>仅展示日常后端与当前 Principal 正式关联的数据</p></div>
        <div className="skill-page-actions">
          <Link href="/skills/manage?mode=daily">发布管理</Link>
          <Link href="/skills/review?mode=daily">审核</Link>
          <Link href="/skills/creator?mode=daily">Creator</Link>
          <Link href="/skills/drafts/new?mode=daily">上传草稿</Link>
          <Link href="/skills?mode=daily">返回广场</Link>
          <button type="button" onClick={refresh}>刷新</button>
        </div>
      </header>

      <MineSection title="我创建" empty="当前账号没有草稿。">
        {drafts.map((draft) => (
          <Link className="resource-card" href={`/skills/drafts/${encodeURIComponent(draft.id)}?mode=daily`} key={draft.id}>
            <span className="resource-card-copy">
              <strong>{draft.name}</strong>
              <span>状态：{draft.status}</span>
              <small>r{draft.revision} · {draft.fileCount} 个文件 · 更新时间未提供</small>
            </span>
          </Link>
        ))}
      </MineSection>

      <MineSection title="已安装/启用" empty="当前没有启用的市场 Skill。">
        {enabled.map((item) => (
          <SkillCatalogCard
            href={catalogDetailHref(item.id, EMPTY_SKILL_CATALOG_FILTER, "daily")}
            item={item}
            key={item.id}
          />
        ))}
      </MineSection>

      <MineSection title="可用未安装" empty="当前没有可安装的市场 Skill。">
        {available.map((item) => (
          <SkillCatalogCard
            href={catalogDetailHref(item.id, EMPTY_SKILL_CATALOG_FILTER, "daily")}
            item={item}
            key={item.id}
          />
        ))}
      </MineSection>
    </section>
  );
}

function MineSection({ children, empty, title }: { children: React.ReactNode; empty: string; title: string }) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="skill-mine-section">
      <h2>{title}</h2>
      {hasItems ? <div className="resource-grid">{children}</div> : <EmptyState title={empty} />}
    </section>
  );
}
