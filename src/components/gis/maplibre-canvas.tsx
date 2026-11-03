"use client";

import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import {
  createMapLibreRenderer,
} from "@/features/gis/map/maplibre-renderer";
import type {
  GeoJsonData,
  MapPort,
  MapRenderer,
} from "@/features/gis/map/map-renderer";

import "maplibre-gl/dist/maplibre-gl.css";

const MAPLIBRE_WORKER_URL =
  "/vendor/maplibre-gl-6.16.0/maplibre-gl-worker.mjs";

interface MapLibreCanvasProps {
  onRendererReady?: (renderer: MapRenderer | null) => void;
}

function createPort(map: MapLibreMap): MapPort {
  return {
    addSource(id, source) {
      map.addSource(id, source);
    },
    getSource(id) {
      const source = map.getSource(id);
      if (!source) return undefined;
      return {
        setData(data) {
          if (source.type !== "geojson" || !("setData" in source)) return;
          const geoJsonSource = source as unknown as {
            setData(value: GeoJsonData): Promise<void>;
          };
          return geoJsonSource.setData(data as GeoJsonData);
        },
        updateImage(options) {
          if (source.type !== "image" || !("updateImage" in source)) return;
          const imageSource = source as unknown as {
            updateImage(value: typeof options): unknown;
          };
          return imageSource.updateImage(options);
        },
      };
    },
    addLayer(layer) {
      map.addLayer(layer);
    },
    getLayer(id) {
      return map.getLayer(id);
    },
    removeLayer(id) {
      map.removeLayer(id);
    },
    removeSource(id) {
      map.removeSource(id);
    },
    setPaintProperty(layerId, name, value) {
      map.setPaintProperty(layerId, name, value);
    },
    fitBounds(bounds, options) {
      map.fitBounds(bounds, options);
    },
    flyTo(options) {
      map.flyTo(options);
    },
  };
}

export function MapLibreCanvas({ onRendererReady }: MapLibreCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const readyCallbackRef = useRef(onRendererReady);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    readyCallbackRef.current = onRendererReady;
  }, [onRendererReady]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let map: MapLibreMap | undefined;
    let renderer: MapRenderer | undefined;
    let disposed = false;
    let ready = false;
    const handleLoad = () => {
      if (disposed || !renderer) return;
      ready = true;
      readyCallbackRef.current?.(renderer);
    };

    try {
      setWorkerUrl(MAPLIBRE_WORKER_URL);
      map = new MapLibreMap({
        container,
        style: "https://demotiles.maplibre.org/style.json",
        center: [120, 30],
        zoom: 4,
      });
      renderer = createMapLibreRenderer(createPort(map));
      map.on("load", handleLoad);
    } catch {
      queueMicrotask(() => {
        if (!disposed) setFailed(true);
      });
    }

    return () => {
      disposed = true;
      if (ready) readyCallbackRef.current?.(null);
      if (map) map.off("load", handleLoad);
      renderer?.destroy();
      map?.remove();
    };
  }, []);

  if (failed) {
    return (
      <div className="map-center-marker" role="status">
        <span>当前浏览器无法初始化地图</span>
      </div>
    );
  }

  return <div ref={containerRef} className="maplibre-canvas" />;
}
