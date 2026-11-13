"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import type { CatalogItemViewModel } from "../contracts/catalog-view-model";
import { SKILL_INSTALL_STATE_LABELS, SKILL_SOURCE_LABELS } from "./skill-catalog-labels";

export function SkillCatalogDrawer({
  item,
  onClose,
}: {
  item: CatalogItemViewModel;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="skill-detail-drawer-layer">
      <button
        aria-label="关闭 Skill 详情"
        className="skill-detail-drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="skill-detail-dialog"
        role="dialog"
      >
        <header className="skill-detail-drawer-heading">
          <div>
            <span className="skill-detail-drawer-source">{SKILL_SOURCE_LABELS[item.source]}</span>
            <h2 className="skill-detail-title" id={titleId}>{item.title}</h2>
            <code className="skill-detail-slug">{item.name}</code>
          </div>
          <button
            aria-label="关闭 Skill 详情"
            className="skill-detail-drawer-close"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <section className="skill-detail-drawer-section">
          <h3>能力说明</h3>
          <p>{item.description || "暂无描述"}</p>
        </section>

        {item.argumentHint ? (
          <section className="skill-detail-drawer-section">
            <h3>触发参数</h3>
            <p className="skill-detail-drawer-code">{item.argumentHint}</p>
          </section>
        ) : null}

        <section className="skill-detail-drawer-section">
          <h3>基本信息</h3>
          <dl className="skill-detail-drawer-metadata">
            <div><dt>来源</dt><dd>{SKILL_SOURCE_LABELS[item.source]}</dd></div>
            <div><dt>修订</dt><dd>{item.revision === null ? "内置" : `r${item.revision}`}</dd></div>
            <div><dt>状态</dt><dd>{item.conflict ? "名称冲突" : SKILL_INSTALL_STATE_LABELS[item.installState]}</dd></div>
            <div><dt>作用域</dt><dd>{item.scopes.length ? item.scopes.map((scope) => scope.name).join("、") : "未加载"}</dd></div>
          </dl>
        </section>

        <section className="skill-detail-drawer-section">
          <h3>可用工具</h3>
          {item.tools.length ? (
            <div className="skill-detail-drawer-tools">
              {item.tools.map((tool) => <code key={tool}>{tool}</code>)}
            </div>
          ) : <p>未声明工具</p>}
        </section>
      </section>
    </div>
  );
}
