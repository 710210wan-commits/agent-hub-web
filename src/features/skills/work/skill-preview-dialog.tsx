"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { SkillCardIcon } from "@/features/skills/components/skill-card-icon";
import type { WorkSkill } from "./contracts";

export function workSkillSourceLabel(sourceType: string): string {
  if (sourceType === "builtin") return "内置";
  if (sourceType === "remote") return "远程";
  return "上传";
}

export function stripWorkSkillFrontmatter(markdown: string): string {
  return markdown
    .replace(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "")
    .trimStart();
}

export interface SkillPreviewDialogProps {
  canManage: boolean;
  error?: string | null;
  loading?: boolean;
  markdown: string;
  onClose(): void;
  onManage(): void;
  onToggleEnabled(): void;
  onUninstall(): void;
  skill: WorkSkill;
  toggling?: boolean;
}

/** 已安装 Skill 的 SKILL.md 居中预览弹窗：卸载在左，关闭/去管理在右。 */
export function SkillPreviewDialog({
  canManage,
  error = null,
  loading = false,
  markdown,
  onClose,
  onManage,
  onToggleEnabled,
  onUninstall,
  skill,
  toggling = false,
}: SkillPreviewDialogProps) {
  const enabled = skill.enabled !== false;
  const canDelete = canManage && !skill.is_builtin;
  const visibleMarkdown = stripWorkSkillFrontmatter(markdown);

  return (
    <div className="work-overlay">
      <button aria-label="关闭预览" className="work-overlay-backdrop" onClick={onClose} type="button" />
      <section aria-modal="true" className="work-modal work-preview-dialog" role="dialog">
        <header className="work-preview-head">
          <div className="work-preview-title">
            <SkillCardIcon name={skill.slug} size={16} />
            <div>
              <h2 className="skill-detail-title">{skill.name}</h2>
              <code className="skill-detail-slug">{skill.slug}</code>
              <p>
                {workSkillSourceLabel(skill.source_type)} Skill
                {!enabled ? <em className="work-preview-disabled-tag">已禁用</em> : null}
              </p>
            </div>
          </div>
          <button
            aria-checked={enabled}
            aria-label="切换启用状态"
            className={enabled ? "work-switch is-on" : "work-switch"}
            disabled={!canManage || toggling}
            onClick={onToggleEnabled}
            role="switch"
            type="button"
          >
            <span />
          </button>
        </header>

        <div className="work-preview-body">
          {loading ? <p className="work-preview-status">正在读取 SKILL.md…</p> : null}
          {!loading && error ? <p className="work-preview-status">{error}</p> : null}
          {!loading && !error && visibleMarkdown ? (
            <div className="work-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{visibleMarkdown}</ReactMarkdown>
            </div>
          ) : null}
          {!loading && !error && !visibleMarkdown ? <p className="work-preview-status">未读取到 SKILL.md</p> : null}
        </div>

        <footer className="work-preview-footer">
          <div className="work-preview-footer-left">
            {canDelete ? (
              <button className="work-button work-button-danger" onClick={onUninstall} type="button">
                卸载
              </button>
            ) : null}
          </div>
          <div className="work-preview-footer-right">
            <button className="work-button skill-action-secondary" onClick={onClose} type="button">
              关闭
            </button>
            <button className="work-button work-button-primary skill-action-primary" onClick={onManage} type="button">
              去管理
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
