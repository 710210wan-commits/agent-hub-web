"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

import type { MapRenderer } from "@/features/gis/map/map-renderer";

const LazyMapLibreCanvas = dynamic(
  () => import("./maplibre-canvas").then((module) => module.MapLibreCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="map-center-marker" role="status">
        <span>正在加载地图</span>
      </div>
    ),
  },
);

interface MapCanvasSlotProps {
  onRendererReady?: (renderer: MapRenderer | null) => void;
}

const desktopQuery = "(min-width: 768px)";

function subscribeToDesktop(callback: () => void): () => void {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function readDesktop(): boolean {
  return window.matchMedia(desktopQuery).matches;
}

function readServerDesktop(): boolean {
  return false;
}

export function MapCanvasSlot({ onRendererReady }: MapCanvasSlotProps) {
  const isDesktop = useSyncExternalStore(
    subscribeToDesktop,
    readDesktop,
    readServerDesktop,
  );

  return (
    <section aria-label="地图画布" className="map-canvas-slot">
      {isDesktop ? <LazyMapLibreCanvas onRendererReady={onRendererReady} /> : null}
    </section>
  );
}
