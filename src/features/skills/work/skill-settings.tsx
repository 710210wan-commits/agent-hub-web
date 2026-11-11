"use client";

import { useMemo, useRef, useState } from "react";

import {
  type WorkSkill,
  type WorkSkillAccessLevel,
  type WorkSkillShareConfig,
} from "./contracts";
import type { WorkSkillsApi } from "./work-api";

const SCOPE_COPY: Record<WorkSkillAccessLevel, { description: string; title: string }> = {
  global: { description: "所有用户都可以访问", title: "全局共享" },
  department: { description: "保留当前配置中的部门范围", title: "所在部门" },
  user: { description: "单用户模式下仅当前操作员", title: "仅自己" },
};

export function buildShareConfigForAccessLevel(
  accessLevel: WorkSkillAccessLevel,
  loaded: WorkSkillShareConfig,
): WorkSkillShareConfig {
  if (accessLevel === "global") {
    return { access_level: "global", department_ids: [], user_uids: [] };
  }
  if (accessLevel === "department") {
    return {
      access_level: "department",
      department_ids: [...loaded.department_ids],
      user_uids: [],
    };
  }
  return {
    access_level: "user",
    department_ids: [],
    user_uids: [...loaded.user_uids],
  };
}

export interface SkillSettingsProps {
  allowedAccessLevels: WorkSkillAccessLevel[];
  api: WorkSkillsApi;
  onSkillChange?(skill: WorkSkill): void;
  skill: WorkSkill;
}

export function SkillSettings({
  allowedAccessLevels,
  api,
  onSkillChange,
  skill,
}: SkillSettingsProps) {
  const builtin = skill.is_builtin || skill.source_type === "builtin";
  const canManage = skill.can_manage;
  const levels = useMemo(
    () => builtin
      ? (["global"] as WorkSkillAccessLevel[])
      : allowedAccessLevels.length
        ? allowedAccessLevels
        : (["global"] as WorkSkillAccessLevel[]),
    [allowedAccessLevels, builtin],
  );
  const initialLevel = builtin
    ? "global"
    : levels.includes(skill.share_config.access_level)
      ? skill.share_config.access_level
      : levels[0];
  const [enabled, setEnabled] = useState(skill.enabled);
  const [accessLevel, setAccessLevel] = useState<WorkSkillAccessLevel>(initialLevel);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    if (!canManage || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      let withScope = skill;
      if (!builtin) {
        withScope = await api.updateSkillShareConfig(
          skill.slug,
          buildShareConfigForAccessLevel(accessLevel, skill.share_config),
        );
      }
      const withEnabled = await api.setSkillEnabled(skill.slug, enabled);
      const updated = { ...withEnabled, share_config: withScope.share_config };
      onSkillChange?.(updated);
      setNotice("设置已保存");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存设置失败");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="work-config-view">
      <header className="work-config-header">
        <div>
          <h2>共享与启用状态</h2>
          <p>控制此 Skill 是否可用，以及哪些用户可以选择和运行它。</p>
        </div>
        {canManage ? (
          <button className="work-button work-button-primary" disabled={saving} onClick={() => void save()} type="button">
            {saving ? "保存中…" : "保存设置"}
          </button>
        ) : null}
      </header>
      {error ? <div className="work-inline-error" role="alert">{error}</div> : null}
      {notice ? <div className="work-inline-success" role="status">{notice}</div> : null}
      {!canManage ? <p className="work-readonly-hint">当前 Skill 对你只读，不能修改设置。</p> : null}
      <div className="work-settings-stack">
        <section className="work-settings-card" data-kind="enabled" data-testid="work-settings-card">
          <div>
            <h3>启用状态</h3>
            <p>禁用后此 Skill 不会出现在可选资源中，也不会参与 Agent 运行时加载。</p>
          </div>
          <div className="work-setting-action">
            <span className={`work-status-pill ${enabled ? "is-enabled" : "is-disabled"}`}>
              {enabled ? "已启用" : "已禁用"}
            </span>
            <button
              aria-checked={enabled}
              aria-label="启用状态"
              className={`work-switch ${enabled ? "is-on" : ""}`}
              disabled={!canManage}
              onClick={() => setEnabled((value) => !value)}
              role="switch"
              type="button"
            ><span /></button>
          </div>
        </section>
        <section className="work-settings-card work-scope-card" data-kind="scope" data-testid="work-settings-card">
          <div>
            <h3>生效范围</h3>
            <p>{builtin ? "内置 Skill 固定为全局生效范围。" : "选择此 Skill 的可见范围；不可见明细保持原配置。"}</p>
          </div>
          <div className="work-radio-list" role="radiogroup" aria-label="生效范围">
            {levels.map((level) => (
              <label data-active={accessLevel === level ? "true" : undefined} key={level}>
                <input
                  aria-label={SCOPE_COPY[level].title}
                  checked={accessLevel === level}
                  disabled={!canManage || builtin}
                  name={`work-scope-${skill.slug}`}
                  onChange={() => setAccessLevel(level)}
                  type="radio"
                />
                <span><strong>{SCOPE_COPY[level].title}</strong><small>{SCOPE_COPY[level].description}</small></span>
              </label>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
