import type { CatalogItemViewModel } from "../contracts/catalog-view-model";
import { SKILL_INSTALL_STATE_LABELS, SKILL_SOURCE_LABELS } from "./skill-catalog-labels";

export function SkillCatalogCard({
  href,
  item,
  onSelect,
}: {
  href?: string;
  item: CatalogItemViewModel;
  onSelect?: () => void;
}) {
  const meta = [
    item.name,
    item.revision !== null ? `r${item.revision}` : null,
    item.tools.length > 0 ? `${item.tools.length} 个工具` : null,
    item.scopes.length > 0
      ? `加载于 ${item.scopes.map((scope) => scope.name).join("、")}`
      : null,
  ].filter((part): part is string => Boolean(part));

  const content = (
    <>
      <div className="resource-card-copy">
        <h2 className="skill-card-title">{item.title}</h2>
        <span>{item.description || "暂无描述"}</span>
        <small>{meta.join(" · ")}</small>
      </div>
      <div className="skill-catalog-badges" aria-label="Skill 状态">
        <span className="skill-badge">{SKILL_SOURCE_LABELS[item.source]}</span>
        <span className="skill-badge">{SKILL_INSTALL_STATE_LABELS[item.installState]}</span>
        {item.conflict ? <span className="skill-badge skill-badge-conflict">名称冲突</span> : null}
      </div>
    </>
  );

  return (
    <article className="resource-card skill-catalog-card">
      {onSelect ? (
        <button
          aria-label={`查看 ${item.title} 详情`}
          className="skill-catalog-card-trigger"
          onClick={onSelect}
          type="button"
        >
          {content}
        </button>
      ) : href ? (
        <a className="skill-catalog-card-link" href={href}>{content}</a>
      ) : content}
    </article>
  );
}
