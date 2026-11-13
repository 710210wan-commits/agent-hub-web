"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { WorkSkill, WorkSkillAccessLevel } from "./contracts";
import { SkillDependencies } from "./skill-dependencies";
import { SkillFileEditor } from "./skill-file-editor";
import { SkillSettings } from "./skill-settings";
import { getBrowserWorkSkillsApi, type WorkSkillsApi } from "./work-api";

type EditorTab = "editor" | "settings" | "dependencies";

const TABS: Array<{ key: EditorTab; label: string }> = [
  { key: "editor", label: "代码管理" },
  { key: "settings", label: "生效范围" },
  { key: "dependencies", label: "依赖管理" },
];

export interface SkillEditorProps {
  api?: WorkSkillsApi;
  onBack?(): void;
  onDeleted?(slug: string): void;
  slug: string;
}

function sourceLabel(skill: WorkSkill): string {
  if (skill.source_type === "builtin") return "内置";
  if (skill.source_type === "remote") return "远程添加";
  return "上传";
}

export function SkillEditor({
  api = getBrowserWorkSkillsApi(),
  onBack,
  onDeleted,
  slug,
}: SkillEditorProps) {
  const [skill, setSkill] = useState<WorkSkill | null>(null);
  const [allowedAccessLevels, setAllowedAccessLevels] = useState<WorkSkillAccessLevel[]>(["user"]);
  const [tab, setTab] = useState<EditorTab>("editor");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const envelope = await api.listSkills(signal);
      const found = envelope.data.find((item) => item.slug === slug);
      if (!found) {
        setSkill(null);
        setError("未找到 Skill");
        return;
      }
      setSkill(found);
      setAllowedAccessLevels(envelope.allowed_access_levels);
    } catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
        setError(loadError instanceof Error && loadError.message ? loadError.message : "加载 Skill 失败");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [api, slug]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setSkill(null);
      setTab("editor");
      void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  async function exportSkill() {
    if (!skill || exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    setError(null);
    try {
      const result = await api.exportSkill(skill.slug);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("导出已开始");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出失败");
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }

  async function deleteSkill() {
    if (!skill || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteSkill(skill.slug);
      setDeleteOpen(false);
      onDeleted?.(skill.slug);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败");
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  if (loading && !skill) {
    return <section className="resource-detail work-detail-page"><p>正在加载 Skill…</p></section>;
  }

  if (!skill) {
    return (
      <section className="resource-detail work-detail-page">
        <div className="work-inline-error" role="alert">{error || "未找到 Skill"}</div>
        <button className="work-button" onClick={() => void load()} type="button">重试</button>
      </section>
    );
  }

  const canManage = skill.can_manage;
  const builtin = skill.is_builtin || skill.source_type === "builtin";

  return (
    <section className="resource-detail work-detail-page">
      <header className="work-detail-header" data-testid="work-detail-header">
        <div data-region="back">
          <button className="work-back-button" onClick={onBack} type="button">← 返回 Work Skill</button>
        </div>
        <div className="work-detail-identity" data-region="identity">
          <h1 className="skill-detail-title">{skill.name}</h1>
          <code className="skill-detail-slug">{skill.slug}</code>
          <p>{sourceLabel(skill)}{skill.enabled ? "" : " · 已禁用"}</p>
        </div>
        <div className="work-detail-actions" data-region="actions">
          {canManage ? (
            <button className="work-button" disabled={exporting} onClick={() => void exportSkill()} type="button">
              {exporting ? "导出中…" : "导出"}
            </button>
          ) : null}
          {canManage && !builtin ? (
            <button className="work-button work-button-danger" onClick={() => setDeleteOpen(true)} type="button">删除</button>
          ) : null}
        </div>
      </header>
      {!canManage ? <p className="work-readonly-hint">你可以查看并使用此 Skill，但没有管理权限。</p> : null}
      {error ? <div className="work-inline-error" role="alert">{error}</div> : null}
      {notice ? <div className="work-inline-success" role="status">{notice}</div> : null}
      <div aria-label="Skill 管理" className="work-detail-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            aria-selected={tab === item.key}
            className={tab === item.key ? "is-active" : ""}
            key={item.key}
            onClick={() => setTab(item.key)}
            role="tab"
            type="button"
          >{item.label}</button>
        ))}
      </div>
      <div className="work-detail-panel" role="tabpanel">
        {tab === "editor" ? <SkillFileEditor api={api} skill={skill} /> : null}
        {tab === "settings" ? (
          <SkillSettings
            allowedAccessLevels={allowedAccessLevels}
            api={api}
            onSkillChange={setSkill}
            skill={skill}
          />
        ) : null}
        {tab === "dependencies" ? (
          <SkillDependencies api={api} onSkillChange={setSkill} skill={skill} />
        ) : null}
      </div>

      {deleteOpen ? (
        <div aria-labelledby="work-delete-skill-title" aria-modal="true" className="work-modal-layer" role="dialog">
          <button aria-label="关闭" className="work-modal-backdrop" onClick={() => setDeleteOpen(false)} type="button" />
          <section className="work-modal work-confirm-dialog">
            <h2 id="work-delete-skill-title">删除 {skill.name}</h2>
            <p>删除后会移除数据库记录和本地 Skill 文件，操作不可恢复。</p>
            <footer className="work-modal-footer">
              <button className="work-button" onClick={() => setDeleteOpen(false)} type="button">取消</button>
              <button className="work-button work-button-danger-fill" disabled={deleting} onClick={() => void deleteSkill()} type="button">
                {deleting ? "删除中…" : "确认删除 Skill"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
