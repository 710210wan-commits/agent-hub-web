import type { CatalogItemViewModel } from "../contracts/catalog-view-model";

const SOURCE_LABELS: Record<CatalogItemViewModel["source"], string> = {
  "built-in": "内置 Skill",
  market: "市场发布",
};

const INSTALL_STATE_LABELS: Record<CatalogItemViewModel["installState"], string> = {
  "built-in-active": "运行中",
  enabled: "已启用",
  installable: "可安装",
  blocked: "不可用",
};

export function SkillCatalogCard({ item }: { item: CatalogItemViewModel }) {
  const meta = [
    item.name,
    item.revision !== null ? `r${item.revision}` : null,
    item.tools.length > 0 ? `${item.tools.length} 个工具` : null,
    item.scopes.length > 0
      ? `加载于 ${item.scopes.map((scope) => scope.name).join("、")}`
      : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <article className="resource-card skill-catalog-card">
      <div className="resource-card-copy">
        <h2 className="skill-card-title">{item.title}</h2>
        <span>{item.description || "暂无描述"}</span>
        <small>{meta.join(" · ")}</small>
      </div>
      <div className="skill-catalog-badges" aria-label="Skill 状态">
        <span className="skill-badge">{SOURCE_LABELS[item.source]}</span>
        <span className="skill-badge">{INSTALL_STATE_LABELS[item.installState]}</span>
        {item.conflict ? <span className="skill-badge skill-badge-conflict">名称冲突</span> : null}
      </div>
    </article>
  );
}
