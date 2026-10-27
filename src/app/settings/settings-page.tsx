"use client";

import { useState } from "react";

const sections = [
  { id: "model", label: "模型", title: "模型设置", copy: "模型配置待接入" },
  { id: "evaluation", label: "评测", title: "评测设置", copy: "评测配置待接入" },
  { id: "api", label: "API", title: "API 设置", copy: "API 配置待接入" },
] as const;

export function SettingsPageContent() {
  const [activeId, setActiveId] = useState<(typeof sections)[number]["id"]>("model");
  const active = sections.find((section) => section.id === activeId) ?? sections[0];
  return (
    <section className="settings-page">
      <header className="page-heading"><div><h1>设置</h1><p>平台级配置入口</p></div></header>
      <div className="settings-layout">
        <div aria-label="设置分类" className="settings-tabs" role="tablist">
          {sections.map((section) => (
            <button aria-selected={activeId === section.id} className={activeId === section.id ? "is-active" : ""} key={section.id} onClick={() => setActiveId(section.id)} role="tab" type="button">{section.label}</button>
          ))}
        </div>
        <div className="settings-panel" role="tabpanel">
          <span className="placeholder-label">扩展槽位</span>
          <h2>{active.title}</h2>
          <p>{active.copy}</p>
        </div>
      </div>
    </section>
  );
}
