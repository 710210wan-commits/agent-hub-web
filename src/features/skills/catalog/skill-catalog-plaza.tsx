"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { InlineError } from "@/components/states/inline-error";
import { LoadingState } from "@/components/states/loading-state";
import { SkillMarketErrorState } from "@/features/skills/components/skill-market-error-state";
import { useAppMode } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { getBrowserSkillMarketClient } from "../api/browser-client";
import type { CatalogItemViewModel, SkillCatalogViewModel } from "../contracts/catalog-view-model";
import {
  areSkillCatalogCategoriesRedundant,
  buildSkillCatalogSearchIndex,
  EMPTY_SKILL_CATALOG_FILTER,
  filterSkillCatalogEntries,
  isSkillCatalogFilterActive,
  listSkillCatalogCategories,
  type SkillCatalogFilter,
} from "./catalog-filter";
import { parseSkillCatalogFilter } from "./catalog-navigation";
import { SkillCatalogCard } from "./skill-catalog-card";
import { SkillCatalogDrawer } from "./skill-catalog-drawer";
import { useSkillCatalog } from "./use-skill-catalog";

export function SkillCatalogPlaza({ client }: { client?: SkillMarketClient }) {
  const { mode } = useAppMode();
  const searchParams = useSearchParams();
  if (mode === "work") return <SkillMarketWorkPlaceholder />;
  const filter = parseSkillCatalogFilter(searchParams);
  return <SkillCatalogPlazaDaily client={client} initialFilter={filter} key={searchParams.toString()} />;
}

export function SkillMarketWorkPlaceholder() {
  return (
    <section className="state-card empty-state">
      <h1>办公场景暂未接入</h1>
      <p>办公 Skill Market 将使用独立后端，当前不会调用日常场景服务。</p>
    </section>
  );
}

function SkillCatalogPlazaDaily({
  client,
  initialFilter,
}: {
  client?: SkillMarketClient;
  initialFilter: SkillCatalogFilter;
}) {
  const { refresh, state } = useSkillCatalog({
    client: client ?? getBrowserSkillMarketClient(),
    mode: "daily",
  });
  const [filter, setFilter] = useState<SkillCatalogFilter>(initialFilter);
  const [selectedItem, setSelectedItem] = useState<CatalogItemViewModel | null>(null);
  const closeDrawer = useCallback(() => setSelectedItem(null), []);

  const catalog: SkillCatalogViewModel | undefined =
    state.kind === "success" || state.kind === "refreshing"
      ? state.catalog
      : state.kind === "error"
        ? state.catalog
        : undefined;

  const searchIndex = useMemo(
    () => (catalog ? buildSkillCatalogSearchIndex(catalog.items) : []),
    [catalog],
  );
  const categories = useMemo(
    () => (catalog ? listSkillCatalogCategories(catalog.items) : []),
    [catalog],
  );
  const categoriesRedundant = useMemo(
    () => (catalog ? areSkillCatalogCategoriesRedundant(catalog.items) : false),
    [catalog],
  );
  // 分类只是来源的换名时,忽略分类维度(包括 URL 带入的分类参数)。
  const effectiveFilter = useMemo(
    () => (categoriesRedundant ? { ...filter, category: "all" as const } : filter),
    [categoriesRedundant, filter],
  );
  if (catalog && filter.category !== "all" && !categories.includes(filter.category)) {
    setFilter({ ...filter, category: "all" });
  }
  const visibleItems = useMemo(
    () => filterSkillCatalogEntries(searchIndex, effectiveFilter),
    [searchIndex, effectiveFilter],
  );

  const patchFilter = (patch: Partial<SkillCatalogFilter>) => {
    setFilter((current) => ({ ...current, ...patch }));
  };

  return (
    <section className="resource-page skill-catalog-plaza">
      <header className="page-heading">
        <div>
          <h1>Skill 广场</h1>
          <p>浏览日常后端返回的内置与市场 Skill</p>
        </div>
        <div className="skill-page-actions skill-catalog-actions">
          <Link className="skill-page-action skill-page-action-primary" href="/skills/creator?mode=daily">创建 Skill</Link>
          <Link className="skill-page-action" href="/skills/manage?mode=daily">发布管理</Link>
          <Link className="skill-page-action" href="/skills/review?mode=daily">审核</Link>
          <Link className="skill-page-action" href="/skills/mine?mode=daily">我的</Link>
        </div>
      </header>

      {catalog ? (
        <>
          <div className="skill-catalog-controls">
            <label className="resource-search">
              <Search aria-hidden="true" size={16} />
              <input
                aria-label="搜索 Skill"
                onChange={(event) => patchFilter({ search: event.target.value })}
                placeholder="搜索名称、描述或工具"
                type="search"
                value={filter.search}
              />
            </label>
            {categoriesRedundant ? null : (
              <select
                aria-label="分类"
                onChange={(event) => patchFilter({ category: event.target.value })}
                value={filter.category}
              >
                <option value="all">全部分类</option>
                {categories.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
            )}
            <select
              aria-label="来源"
              onChange={(event) =>
                patchFilter({ source: event.target.value as SkillCatalogFilter["source"] })}
              value={filter.source}
            >
              <option value="all">全部来源</option>
              <option value="built-in">内置</option>
              <option value="market">市场</option>
            </select>
            <select
              aria-label="状态"
              onChange={(event) =>
                patchFilter({ status: event.target.value as SkillCatalogFilter["status"] })}
              value={filter.status}
            >
              <option value="all">全部状态</option>
              <option value="available">可用</option>
              <option value="conflict">名称冲突</option>
            </select>
            {isSkillCatalogFilterActive(effectiveFilter) ? (
              <button
                className="skill-catalog-clear"
                onClick={() => setFilter(EMPTY_SKILL_CATALOG_FILTER)}
                type="button"
              >
                清除筛选
              </button>
            ) : null}
          </div>

          {state.kind === "refreshing" ? (
            <p className="skill-catalog-status" role="status">正在刷新…</p>
          ) : null}
          {state.kind === "error" ? <InlineError message={state.error.userMessage} /> : null}

          {visibleItems.length > 0 ? (
            <div className="resource-grid">
              {visibleItems.map((item) => (
                <SkillCatalogCard
                  item={item}
                  key={item.id}
                  onSelect={() => setSelectedItem(item)}
                />
              ))}
            </div>
          ) : catalog.items.length === 0 ? (
            <EmptyState
              description="日常后端尚未返回任何内置或市场 Skill，可稍后刷新重试。"
              title="Skill 广场暂无内容"
            />
          ) : (
            <EmptyState
              description="尝试调整关键词或清除筛选条件。"
              title="没有符合条件的 Skill"
            />
          )}
        </>
      ) : state.kind === "empty" ? (
        <EmptyState
          description="日常后端尚未返回任何内置或市场 Skill，可稍后刷新重试。"
          title="Skill 广场暂无内容"
        />
      ) : state.kind === "error" ? (
        <SkillMarketErrorState error={state.error} onRecover={() => refresh()} />
      ) : (
        <LoadingState label="正在加载 Skill 广场…" />
      )}
      {selectedItem ? <SkillCatalogDrawer item={selectedItem} onClose={closeDrawer} /> : null}
    </section>
  );
}
