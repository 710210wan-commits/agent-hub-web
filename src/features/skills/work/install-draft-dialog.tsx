import { useMemo, useState } from "react";

import type {
  WorkSkillAccessLevel,
  WorkSkillInstallDraft,
  WorkSkillInstallDraftItem,
  WorkSkillShareConfig,
} from "./contracts";

/** 生效范围文案（与原 Vue ShareConfigForm 单选项一致；本期提交语义见计划 §6.1）。 */
export const WORK_SHARE_LEVEL_OPTIONS: Record<
  WorkSkillAccessLevel,
  { description: string; title: string }
> = {
  global: { title: "全局共享", description: "所有用户都可以访问" },
  department: { title: "部门共享", description: "选中的部门成员可以访问" },
  user: { title: "指定人", description: "选中的用户可以访问" },
};

export interface MergedInstallDraft {
  allowedAccessLevels: WorkSkillAccessLevel[];
  defaultShareConfig: WorkSkillShareConfig;
  draftIds: string[];
  items: Array<WorkSkillInstallDraftItem & { source: string; sourceType: string }>;
  sourceLabel: string;
}

/** 合并多个安装草稿为一个确认视图（远程搜索按来源分组可能产生多个草稿）。 */
export function mergeInstallDrafts(drafts: WorkSkillInstallDraft[]): MergedInstallDraft {
  const first = drafts[0];
  return {
    allowedAccessLevels: first?.allowed_access_levels ?? ["user"],
    defaultShareConfig: first?.default_share_config ?? {
      access_level: "user",
      department_ids: [],
      user_uids: [],
    },
    draftIds: drafts.map((draft) => draft.draft_id),
    items: drafts.flatMap((draft) =>
      draft.items.map((item) => ({
        ...item,
        source: draft.source,
        sourceType: draft.source_type,
      })),
    ),
    sourceLabel: drafts.length === 1 ? (first?.source ?? "") : `${drafts.length} 个来源`,
  };
}

/** 按 §6.1 提交语义构造 share_config：保留草稿默认值中的原配置数组。 */
export function buildDraftShareConfig(
  level: WorkSkillAccessLevel,
  draft: MergedInstallDraft,
): WorkSkillShareConfig {
  if (level === "global") {
    return { access_level: "global", department_ids: [], user_uids: [] };
  }
  if (level === "department") {
    return {
      access_level: "department",
      department_ids: [...draft.defaultShareConfig.department_ids],
      user_uids: [],
    };
  }
  return {
    access_level: "user",
    department_ids: [],
    user_uids: [...draft.defaultShareConfig.user_uids],
  };
}

function sourceTypeLabel(sourceType: string): string {
  if (sourceType === "remote") return "远程";
  return "上传";
}

export interface InstallDraftDialogProps {
  confirming?: boolean;
  drafts: WorkSkillInstallDraft[];
  onCancel(): void;
  onConfirm(shareConfig: WorkSkillShareConfig): void;
}

/** 安装草稿确认弹窗：来源 → 解析项 → 生效范围；取消在左、确认添加在右。 */
export function InstallDraftDialog({
  confirming = false,
  drafts,
  onCancel,
  onConfirm,
}: InstallDraftDialogProps) {
  const merged = useMemo(() => mergeInstallDrafts(drafts), [drafts]);
  const initialLevel = merged.defaultShareConfig.access_level;
  const [level, setLevel] = useState<WorkSkillAccessLevel>(
    merged.allowedAccessLevels.includes(initialLevel) ? initialLevel : merged.allowedAccessLevels[0],
  );
  const hasInstallableItem = merged.items.some((item) => item.success !== false);

  return (
    <div className="work-overlay">
      <button aria-label="关闭草稿确认" className="work-overlay-backdrop" onClick={confirming ? undefined : onCancel} type="button" />
      <section aria-modal="true" className="work-modal work-draft-dialog" role="dialog">
        <header className="work-modal-heading">
          <h2>确认添加 Skill</h2>
          <button aria-label="关闭" className="work-icon-button" disabled={confirming} onClick={onCancel} type="button">
            ×
          </button>
        </header>

        <div className="work-draft-source">
          <span>来源</span>
          <strong>{merged.sourceLabel}</strong>
        </div>

        <div className="work-draft-items">
          {merged.items.map((item, index) => (
            <article className="work-draft-item" data-failed={item.success === false || undefined} key={`${item.source}:${item.slug || index}`}>
              <div>
                <strong>{item.success === false ? item.slug || "解析失败" : item.name}</strong>
                <p>{item.success === false ? item.error : item.description || "暂无描述"}</p>
                {"warnings" in item && item.warnings?.length ? (
                  <p className="work-draft-warning">{item.warnings.join("；")}</p>
                ) : null}
              </div>
              <span className={item.success === false ? "work-tag work-tag-danger" : "work-tag"}>
                {item.success === false ? "解析失败" : sourceTypeLabel(item.sourceType)}
              </span>
            </article>
          ))}
        </div>

        <h3 className="work-draft-scope-title">生效范围</h3>
        <div className="work-radio-list" role="radiogroup">
          {merged.allowedAccessLevels.map((option) => (
            <label data-active={level === option || undefined} key={option}>
              <input
                aria-label={WORK_SHARE_LEVEL_OPTIONS[option].title}
                checked={level === option}
                disabled={confirming}
                name="work-draft-scope"
                onChange={() => setLevel(option)}
                type="radio"
              />
              <span>
                <strong>{WORK_SHARE_LEVEL_OPTIONS[option].title}</strong>
                <small>{WORK_SHARE_LEVEL_OPTIONS[option].description}</small>
              </span>
            </label>
          ))}
        </div>

        <footer className="work-modal-footer">
          <button className="work-button" disabled={confirming} onClick={onCancel} type="button">
            取消
          </button>
          <button
            className="work-button work-button-primary"
            disabled={confirming || !hasInstallableItem}
            onClick={() => onConfirm(buildDraftShareConfig(level, merged))}
            type="button"
          >
            {confirming ? "正在添加…" : "确认添加"}
          </button>
        </footer>
      </section>
    </div>
  );
}
