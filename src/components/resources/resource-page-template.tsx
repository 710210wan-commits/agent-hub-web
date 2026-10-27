"use client";

import { Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { withMode } from "@/config/modes";
import { useAppMode } from "@/providers/mode-provider";

import { ResourceCard } from "./resource-card";

export interface ResourceListItem {
  id: string;
  name: string;
  description: string;
  meta?: string;
}

export function ResourcePageTemplate<T extends ResourceListItem>({
  title,
  description,
  createLabel,
  detailBasePath,
  items,
  renderItem,
}: {
  title: string;
  description: string;
  createLabel: string;
  detailBasePath: string;
  items: T[];
  renderItem?: (item: T, href: string) => ReactNode;
}) {
  const { mode } = useAppMode();
  const [query, setQuery] = useState("");
  const visibleItems = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) return items;
    return items.filter((item) => `${item.name} ${item.description}`.toLocaleLowerCase().includes(keyword));
  }, [items, query]);

  return (
    <section className="resource-page">
      <header className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <button aria-label={`${createLabel}（待接入）`} disabled type="button">{createLabel}</button>
      </header>
      <label className="resource-search">
        <Search aria-hidden="true" size={16} />
        <input
          aria-label={`搜索${title}`}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`搜索${title}`}
          type="search"
          value={query}
        />
      </label>
      {visibleItems.length > 0 ? (
        <div className="resource-grid">
          {visibleItems.map((item) => {
            const href = withMode(`${detailBasePath}/${item.id}`, mode);
            return renderItem ? renderItem(item, href) : <ResourceCard {...item} href={href} key={item.id} />;
          })}
        </div>
      ) : (
        <EmptyState description="尝试使用其他关键词" title="没有匹配的内容" />
      )}
    </section>
  );
}
