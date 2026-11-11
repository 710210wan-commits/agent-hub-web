"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { WorkSkill, WorkSkillDependencyOptions } from "./contracts";
import type { WorkSkillDependencies, WorkSkillsApi } from "./work-api";

interface DependencyGroup {
  key: "tools" | "mcps" | "skills";
  title: string;
  description: string;
  values: Array<{ label: string; value: string }>;
}

export interface SkillDependenciesProps {
  api: WorkSkillsApi;
  onSkillChange?(skill: WorkSkill): void;
  skill: WorkSkill;
}

export function SkillDependencies({ api, onSkillChange, skill }: SkillDependenciesProps) {
  const canEdit = skill.can_manage && !skill.is_builtin && skill.source_type !== "builtin";
  const [options, setOptions] = useState<WorkSkillDependencyOptions | null>(null);
  const [selected, setSelected] = useState<WorkSkillDependencies>({
    mcp_dependencies: [...skill.mcp_dependencies],
    skill_dependencies: [...skill.skill_dependencies],
    tool_dependencies: [...skill.tool_dependencies],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!canEdit) {
      setOptions({
        mcps: [...skill.mcp_dependencies],
        skills: [...skill.skill_dependencies],
        tools: skill.tool_dependencies.map((slug) => ({ slug })),
      });
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setOptions(await api.getDependencyOptions(skill.slug, signal));
    } catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
        setError(loadError instanceof Error && loadError.message ? loadError.message : "加载依赖选项失败");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [api, canEdit, skill.mcp_dependencies, skill.skill_dependencies, skill.slug, skill.tool_dependencies]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const groups: DependencyGroup[] = options
    ? [
        {
          key: "tools",
          title: "工具依赖",
          description: "声明此 Skill 运行时需要调用的工具能力。",
          values: options.tools.map((tool) => ({ label: tool.name || tool.slug, value: tool.slug })),
        },
        {
          key: "mcps",
          title: "MCP 依赖",
          description: "声明此 Skill 依赖的 MCP 服务。",
          values: options.mcps.map((value) => ({ label: value, value })),
        },
        {
          key: "skills",
          title: "Skill 依赖",
          description: "声明需要一起加载的其他 Skill。",
          values: options.skills
            .filter((value) => value !== skill.slug)
            .map((value) => ({ label: value, value })),
        },
      ]
    : [];

  function selectionKey(key: DependencyGroup["key"]): keyof WorkSkillDependencies {
    if (key === "tools") return "tool_dependencies";
    if (key === "mcps") return "mcp_dependencies";
    return "skill_dependencies";
  }

  function toggle(group: DependencyGroup, value: string) {
    if (!canEdit) return;
    const key = selectionKey(group.key);
    setSelected((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  }

  async function save() {
    if (!canEdit || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.updateSkillDependencies(skill.slug, selected);
      setSelected({
        mcp_dependencies: [...updated.mcp_dependencies],
        skill_dependencies: [...updated.skill_dependencies],
        tool_dependencies: [...updated.tool_dependencies],
      });
      onSkillChange?.(updated);
      setNotice("依赖已更新");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "更新依赖失败");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="work-config-view">
      <header className="work-config-header">
        <div><h2>依赖管理</h2><p>声明运行此 Skill 时需要一起加载的工具、MCP 和其他 Skill。</p></div>
        {canEdit ? (
          <button className="work-button work-button-primary" disabled={saving} onClick={() => void save()} type="button">
            {saving ? "更新中…" : "更新依赖"}
          </button>
        ) : null}
      </header>
      {error ? (
        <div className="work-inline-error" role="alert">
          <span>{error.includes("加载") ? error : "加载依赖选项失败"}</span>
          <button className="work-button work-button-small" onClick={() => void load()} type="button">重试</button>
        </div>
      ) : null}
      {notice ? <div className="work-inline-success" role="status">{notice}</div> : null}
      {loading ? <p className="work-inline-muted">正在加载依赖选项…</p> : null}
      <div className="work-dependency-stack">
        {groups.map((group) => {
          const key = selectionKey(group.key);
          return (
            <section className="work-dependency-card" data-kind={group.key} data-testid="work-dependency-group" key={group.key}>
              <div><h3>{group.title}</h3><p>{group.description}</p></div>
              <div className="work-dependency-options">
                {group.values.length ? group.values.map((option) => (
                  <label key={option.value}>
                    <input
                      aria-label={option.label}
                      checked={selected[key].includes(option.value)}
                      disabled={!canEdit}
                      onChange={() => toggle(group, option.value)}
                      type="checkbox"
                    />
                    <span>{option.label}</span>
                  </label>
                )) : <span className="work-inline-muted">暂无可用选项</span>}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
