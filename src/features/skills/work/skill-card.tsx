"use client";

import { BookMarked, Check, Minus, Plus } from "lucide-react";

import type { WorkSkill } from "./contracts";
import type { RecommendedSkill } from "./work-recommended";

const TINTS = ["violet", "cyan", "blue", "amber", "green", "rose"] as const;

export function workSkillTint(name: string): (typeof TINTS)[number] {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return TINTS[hash % TINTS.length];
}

export function WorkSkillIcon({ name }: { name: string }) {
  return (
    <span className={`work-card-icon work-tint-${workSkillTint(name)}`}>
      <BookMarked aria-hidden="true" size={15} />
    </span>
  );
}

export interface InstalledWorkSkillCardProps {
  selectable: boolean;
  selected: boolean;
  skill: WorkSkill;
  toggling: boolean;
  onOpen(): void;
  onSelect(): void;
  onToggleEnabled(): void;
}

/** 已安装 Skill 卡片：左侧复选（批量模式）、中部信息、右侧启停操作位。 */
export function InstalledWorkSkillCard({
  selectable,
  selected,
  skill,
  toggling,
  onOpen,
  onSelect,
  onToggleEnabled,
}: InstalledWorkSkillCardProps) {
  const enabled = skill.enabled !== false;
  return (
    <article className="work-card" data-selected={selected || undefined}>
      {selectable ? (
        <label className="work-card-select" onClick={(event) => event.stopPropagation()}>
          <input
            aria-label={`选择 ${skill.name}`}
            checked={selected}
            onChange={onSelect}
            type="checkbox"
          />
        </label>
      ) : null}
      <WorkSkillIcon name={skill.name} />
      <button
        aria-label={`查看 ${skill.name} 预览`}
        className="work-card-open"
        onClick={selectable ? onSelect : onOpen}
        type="button"
      >
        <span className="work-card-copy">
          <strong>{skill.name}</strong>
          <span>{skill.description || "暂无描述"}</span>
        </span>
      </button>
      {skill.can_manage ? (
        <button
          aria-label={enabled ? "禁用 Skill" : "启用 Skill"}
          className={enabled ? "work-status-action is-enabled" : "work-status-action"}
          disabled={toggling}
          onClick={(event) => {
            event.stopPropagation();
            onToggleEnabled();
          }}
          type="button"
        >
          {enabled ? (
            <>
              <Check aria-hidden="true" className="work-status-check" size={14} />
              <Minus aria-hidden="true" className="work-status-minus" size={14} />
            </>
          ) : (
            <Plus aria-hidden="true" size={14} />
          )}
        </button>
      ) : null}
    </article>
  );
}

export interface RecommendedWorkSkillCardProps {
  installing: boolean;
  item: RecommendedSkill;
  onInstall(): void;
}

/** 推荐 Skill 卡片：右侧固定为安装操作位（+）。 */
export function RecommendedWorkSkillCard({
  installing,
  item,
  onInstall,
}: RecommendedWorkSkillCardProps) {
  return (
    <article className="work-card work-card-recommendation">
      <WorkSkillIcon name={item.name} />
      <span className="work-card-copy">
        <strong>{item.name}</strong>
        <span>{item.description}</span>
      </span>
      <button
        aria-label="安装推荐 Skill"
        className="work-status-action"
        disabled={installing}
        onClick={onInstall}
        type="button"
      >
        <Plus aria-hidden="true" size={14} />
      </button>
    </article>
  );
}
