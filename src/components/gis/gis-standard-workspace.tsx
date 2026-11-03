"use client";

import { useState, type FormEvent } from "react";

import { MessageContent } from "@/components/chat/message-content";
import type { GisTransport } from "@/features/gis/contracts";
import { useGisController } from "@/features/gis/use-gis-controller";

import { MapCanvasSlot } from "./map-canvas-slot";
import { ExpandableTimelineVariant } from "./progress/expandable-timeline-variant";

export function GisStandardWorkspace({ transport }: { transport: GisTransport }) {
  const controller = useGisController(transport);
  const { state } = controller;
  const [draft, setDraft] = useState("");
  const active = state.status === "submitting" || state.status === "working";
  const terminal = ["completed", "failed", "stopped", "disconnected"].includes(
    state.status,
  );
  const keptCount = state.layers.filter((layer) => layer.kept).length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (controller.submit(draft)) setDraft("");
  };

  return (
    <div className="gis-workspace-placeholder gis-standard-workspace">
      <div className="gis-desktop-shell gis-standard-shell">
        <MapCanvasSlot onRendererReady={controller.setRenderer}>
          {state.progress.stages.length > 0 ? (
            <ExpandableTimelineVariant state={state.progress} />
          ) : null}
        </MapCanvasSlot>

        <aside className="gis-standard-panel" aria-label="标准 GIS 问答">
          <header className="gis-standard-heading">
            <strong>标准 GIS</strong>
            <small>实时 Agent Loop</small>
          </header>

          <form className="gis-standard-form" onSubmit={submit}>
            <label htmlFor="gis-standard-query">GIS 问题</label>
            <textarea
              id="gis-standard-query"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="查询区域、船舶或飞机态势"
              rows={4}
              value={draft}
            />
            <div className="gis-standard-actions">
              <button disabled={active || !draft.trim()} type="submit">发送</button>
              {active ? (
                <button onClick={controller.stop} type="button">停止任务</button>
              ) : null}
            </div>
          </form>

          <div className="gis-layer-status" role="status">
            <span>图层更新 {state.layers.length} 项</span>
            {keptCount > 0 ? <small>已保留 {keptCount} 项</small> : null}
          </div>

          {state.notice ? (
            <p className="gis-standard-notice" role="status">{state.notice}</p>
          ) : null}
          {state.answer ? (
            <section className="gis-standard-answer" aria-label="查询结果">
              <MessageContent content={state.answer} />
            </section>
          ) : null}

          <div className="gis-standard-result-actions">
            {terminal ? (
              <button onClick={controller.regenerate} type="button">重新生成</button>
            ) : null}
            {terminal && state.layers.length > 0 ? (
              <button
                disabled={keptCount === state.layers.length}
                onClick={controller.keepResult}
                type="button"
              >
                保留结果
              </button>
            ) : null}
            <button
              disabled={state.layers.length === 0}
              onClick={controller.clearMap}
              type="button"
            >
              清空地图
            </button>
          </div>
        </aside>
      </div>
      <div className="gis-mobile-notice">
        <strong>GIS 工作台暂仅支持桌面端</strong>
        <p>移动端地图展示将在后续版本接入。</p>
      </div>
    </div>
  );
}
