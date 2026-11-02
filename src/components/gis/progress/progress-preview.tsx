"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  getProgressFixture,
  progressFixtureOptions,
} from "@/features/gis/progress/progress-fixtures";
import {
  createProgressState,
  progressReducer,
} from "@/features/gis/progress/progress-reducer";
import type {
  ProgressFixtureId,
  ProgressViewVariant,
} from "@/features/gis/progress/progress-state";

import { ActivityLineVariant } from "./activity-line-variant";
import { ExpandableTimelineVariant } from "./expandable-timeline-variant";
import { StageRailVariant } from "./stage-rail-variant";

const variants: Array<{ id: ProgressViewVariant; label: string }> = [
  { id: "a", label: "单行动作" },
  { id: "b", label: "展开时间线" },
  { id: "c", label: "阶段轨道" },
];

export function ProgressPreviewContent({
  variant,
  fixtureId,
}: {
  variant: ProgressViewVariant;
  fixtureId: ProgressFixtureId;
}) {
  const fixture = getProgressFixture(fixtureId);
  const state = useMemo(
    () => fixture.events.reduce(progressReducer, createProgressState(fixture.stages)),
    [fixture],
  );
  const Variant = variant === "a"
    ? ActivityLineVariant
    : variant === "b"
      ? ExpandableTimelineVariant
      : StageRailVariant;

  return (
    <div className={`progress-preview progress-preview-${variant}`}>
      <header className="progress-preview-copy">
        <span>PROGRESS UI · {variant.toUpperCase()}</span>
        <h1>{fixture.title}</h1>
        <p>{fixture.description}</p>
      </header>
      <div className="progress-map-context" aria-label="地图工作区预览">
        <div className="progress-map-label">
          <span>GIS WORKSPACE</span>
          <strong>Kensai 火情态势</strong>
        </div>
        <div className="progress-map-marker marker-one" aria-hidden="true" />
        <div className="progress-map-marker marker-two" aria-hidden="true" />
        <Variant state={state} />
      </div>
    </div>
  );
}

export function ProgressPreview() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const variant = parseVariant(searchParams.get("variant"));
  const fixtureId = parseFixtureId(searchParams.get("fixture"));

  const navigate = (nextVariant: ProgressViewVariant, nextFixture = fixtureId) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("variant", nextVariant);
    next.set("fixture", nextFixture);
    router.replace(`${pathname}?${next.toString()}`);
  };

  const cycle = (direction: -1 | 1) => {
    const index = variants.findIndex((item) => item.id === variant);
    const next = variants[(index + direction + variants.length) % variants.length];
    navigate(next.id);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <>
      <ProgressPreviewContent fixtureId={fixtureId} variant={variant} />
      {process.env.NODE_ENV !== "production" ? (
        <div className="prototype-switcher" aria-label="进度方案切换器">
          <button aria-label="上一个方案" onClick={() => cycle(-1)} type="button">
            ←
          </button>
          <div>
            <strong>{variant.toUpperCase()} · {variants.find((item) => item.id === variant)?.label}</strong>
            <select
              aria-label="预览状态"
              onChange={(event) => navigate(variant, event.target.value as ProgressFixtureId)}
              value={fixtureId}
            >
              {progressFixtureOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.title}</option>
              ))}
            </select>
          </div>
          <button aria-label="下一个方案" onClick={() => cycle(1)} type="button">
            →
          </button>
        </div>
      ) : null}
    </>
  );
}

function parseVariant(value: string | null): ProgressViewVariant {
  return value === "a" || value === "c" ? value : "b";
}

function parseFixtureId(value: string | null): ProgressFixtureId {
  return value === "failed" || value === "stopped" || value === "long-running"
    ? value
    : "completed";
}
