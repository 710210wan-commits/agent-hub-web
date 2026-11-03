"use client";

import dynamic from "next/dynamic";

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

export function MapCanvasSlot({ onRendererReady }: MapCanvasSlotProps) {
  return (
    <section aria-label="地图画布" className="map-canvas-slot">
      <LazyMapLibreCanvas onRendererReady={onRendererReady} />
    </section>
  );
}
