"use client";

import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { ResourceDetailSlot } from "@/components/resources/resource-detail-slot";
import { SkillMarketErrorState } from "@/features/skills/components/skill-market-error-state";
import { useAppMode } from "@/providers/mode-provider";
import { useSearchParams } from "next/navigation";

import type { SkillMarketClient } from "../api/client";
import { getBrowserSkillMarketClient } from "../api/browser-client";
import { catalogPlazaHref, parseSkillCatalogFilter } from "./catalog-navigation";
import { SkillMarketWorkPlaceholder } from "./skill-catalog-plaza";
import { useSkillCatalog } from "./use-skill-catalog";

export function SkillCatalogDetail({ client, id }: { client?: SkillMarketClient; id: string }) {
  const { mode } = useAppMode();
  if (mode === "work") return <SkillMarketWorkPlaceholder />;
  return <SkillCatalogDetailDaily client={client ?? getBrowserSkillMarketClient()} id={id} />;
}

function SkillCatalogDetailDaily({ client, id }: { client: SkillMarketClient; id: string }) {
  const params = useSearchParams();
  const { refresh, state } = useSkillCatalog({ client, mode: "daily" });
  const backHref = catalogPlazaHref(parseSkillCatalogFilter(params), "daily");
  const catalog = state.kind === "success" || state.kind === "refreshing"
    ? state.catalog
    : state.kind === "error"
      ? state.catalog
      : undefined;

  if (!catalog && state.kind === "error") {
    return <SkillMarketErrorState error={state.error} onRecover={refresh} />;
  }
  if (!catalog && state.kind !== "empty") return <LoadingState label="正在加载 Skill 详情…" />;
  const item = catalog?.items.find((entry) => entry.id === decodeCatalogId(id));
  if (!item) return <EmptyState title="未找到该 Skill" description="该 Skill 不存在或当前 Principal 不可见。" />;

  return (
    <ResourceDetailSlot backHref={backHref} backLabel="返回 Skill 广场" title={item.title}>
      <div className="skill-detail-grid">
        <p>{item.description || "暂无描述"}</p>
        <dl>
          <div><dt>名称</dt><dd>{item.name}</dd></div>
          <div><dt>来源</dt><dd>{item.source === "built-in" ? "内置 Skill" : "市场发布"}</dd></div>
          <div><dt>修订</dt><dd>{item.revision ?? "内置"}</dd></div>
          <div><dt>状态</dt><dd>{item.conflict ? "名称冲突，不可安装或运行" : item.installState}</dd></div>
          <div><dt>作用域</dt><dd>{item.scopes.length ? item.scopes.map((scope) => scope.name).join("、") : "未加载"}</dd></div>
        </dl>
        <section><h2>工具</h2>{item.tools.length ? <ul>{item.tools.map((tool) => <li key={tool}>{tool}</li>)}</ul> : <p>未声明工具</p>}</section>
      </div>
    </ResourceDetailSlot>
  );
}

function decodeCatalogId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}
