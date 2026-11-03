import type { AddLayerObject, SourceSpecification } from "maplibre-gl";

import type { GisUpdate } from "../contracts";

export type GeoJsonData = Record<string, unknown>;
export type ImageCoordinates = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

export interface MapSourcePort {
  setData(data: GeoJsonData): void | Promise<void>;
  updateImage(options: { url: string; coordinates: ImageCoordinates }): unknown;
}

export interface MapPort {
  addSource(id: string, source: SourceSpecification): unknown;
  getSource(id: string): MapSourcePort | undefined;
  addLayer(layer: AddLayerObject): unknown;
  getLayer(id: string): unknown;
  removeLayer(id: string): unknown;
  removeSource(id: string): unknown;
  setPaintProperty(
    layerId: string,
    name: "raster-opacity",
    value: number,
  ): unknown;
  fitBounds(
    bounds: [[number, number], [number, number]],
    options: { maxZoom: number },
  ): unknown;
  flyTo(options: { center: [number, number]; zoom: number }): unknown;
}

export interface MapRenderer {
  apply(update: GisUpdate): void;
  remove(key: string): void;
  clear(): void;
  destroy(): void;
}

export function resolveGisImageUrl(url: string): string {
  if (url.startsWith("/") && !url.startsWith("//")) return `/agent-api${url}`;
  return url;
}
