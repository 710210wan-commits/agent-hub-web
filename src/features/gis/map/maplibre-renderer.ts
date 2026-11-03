import type { AddLayerObject, SourceSpecification } from "maplibre-gl";

import type { GisUpdate } from "../contracts";
import {
  gisDataSchema,
  type ValidatedGisData,
} from "./gis-data-schema";
import type {
  GeoJsonData,
  ImageCoordinates,
  MapPort,
  MapRenderer,
} from "./map-renderer";

type Category = "region" | "entity" | "trajectory";

interface KeyResources {
  categories: Set<Category>;
  imageIds: Set<string>;
}

interface RendererOptions {
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (id: number) => void;
}

const categories: Array<{
  id: Category;
  field: "regions" | "entities" | "trajectories";
}> = [
  { id: "region", field: "regions" },
  { id: "entity", field: "entities" },
  { id: "trajectory", field: "trajectories" },
];

function keyPrefix(key: string): string {
  return `gis:${encodeURIComponent(key)}`;
}

function categorySourceId(key: string, category: Category): string {
  return `${keyPrefix(key)}:${category}`;
}

function imageSourceId(key: string, imageId: string): string {
  return `${keyPrefix(key)}:image:${encodeURIComponent(imageId)}`;
}

function categoryLayerIds(key: string, category: Category): string[] {
  const sourceId = categorySourceId(key, category);
  if (category === "region") return [`${sourceId}:fill`, `${sourceId}:outline`];
  if (category === "entity") return [`${sourceId}:circle`, `${sourceId}:label`];
  return [`${sourceId}:line`];
}

function categoryLayers(key: string, category: Category): AddLayerObject[] {
  const sourceId = categorySourceId(key, category);
  if (category === "region") {
    return [
      {
        id: `${sourceId}:fill`,
        type: "fill",
        source: sourceId,
        filter: ["!=", ["get", "fill"], false],
        paint: {
          "fill-color": ["coalesce", ["get", "fillColor"], "#5f78cf"],
          "fill-opacity": 0.18,
        },
      },
      {
        id: `${sourceId}:outline`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": ["coalesce", ["get", "outlineColor"], "#5f78cf"],
          "line-width": ["coalesce", ["get", "outlineWidth"], 2],
        },
      },
    ];
  }
  if (category === "entity") {
    return [
      {
        id: `${sourceId}:circle`,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-color": [
            "coalesce",
            ["get", "color"],
            ["match", ["get", "status"], "danger", "#cf5f5f", "warning", "#d0aa72", "#5f78cf"],
          ],
          "circle-radius": ["coalesce", ["get", "size"], 6],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      },
      {
        id: `${sourceId}:label`,
        type: "symbol",
        source: sourceId,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-optional": true,
        },
        paint: {
          "text-color": "#24272a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1,
        },
      },
    ];
  }
  return [{
    id: `${sourceId}:line`,
    type: "line",
    source: sourceId,
    paint: { "line-color": "#5f78cf", "line-width": 2 },
  }];
}

function featureCollection(features: unknown[]): GeoJsonData {
  return { type: "FeatureCollection", features };
}

function categoryData(data: ValidatedGisData, category: Category): GeoJsonData {
  if (category === "entity") {
    return featureCollection((data.entities ?? []).map((entity) => ({
      type: "Feature",
      id: entity.id,
      geometry: { type: "Point", coordinates: entity.coordinates },
      properties: {
        name: entity.name,
        entityType: entity.type,
        importance: entity.importance,
        status: entity.status,
        color: entity.color,
        size: entity.size,
      },
    })));
  }
  if (category === "trajectory") {
    return featureCollection((data.trajectories ?? []).map((trajectory) => ({
      type: "Feature",
      id: trajectory.id,
      geometry: { type: "LineString", coordinates: trajectory.coordinates },
      properties: {
        name: trajectory.name,
        trajectoryType: trajectory.type,
        status: trajectory.status,
      },
    })));
  }
  return featureCollection((data.regions ?? []).map((region) => {
    const ring = [...region.coordinates];
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
    return {
      type: "Feature",
      id: region.id,
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: {
        name: region.name,
        regionType: region.type,
        fill: region.style?.fill,
        fillColor: region.style?.fillColor,
        outlineColor: region.style?.outlineColor,
        outlineWidth: region.style?.outlineWidth,
      },
    };
  }));
}

function imageCoordinates(
  rectangle: { west: number; south: number; east: number; north: number },
): ImageCoordinates {
  return [
    [rectangle.west, rectangle.north],
    [rectangle.east, rectangle.north],
    [rectangle.east, rectangle.south],
    [rectangle.west, rectangle.south],
  ];
}

function pointZoom(latitude: number, altitude: number): number {
  const earthCircumference = 40_075_016.68557849;
  const visibleMeters = earthCircumference * Math.cos(latitude * Math.PI / 180);
  const zoom = Math.log2(visibleMeters / Math.max(1, altitude));
  return Math.min(22, Math.max(0, zoom));
}

export function createMapLibreRenderer(
  port: MapPort,
  options: RendererOptions = {},
): MapRenderer {
  const requestFrame = options.requestFrame ?? requestAnimationFrame;
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
  const resources = new Map<string, KeyResources>();
  const pending = new Map<string, ValidatedGisData>();
  let frameId: number | null = null;
  let destroyed = false;

  function removeLayersAndSource(sourceId: string, layerIds: string[]): void {
    for (const layerId of [...layerIds].reverse()) {
      if (port.getLayer(layerId)) port.removeLayer(layerId);
    }
    if (port.getSource(sourceId)) port.removeSource(sourceId);
  }

  function removeCategory(key: string, category: Category): void {
    removeLayersAndSource(
      categorySourceId(key, category),
      categoryLayerIds(key, category),
    );
  }

  function removeImage(key: string, imageId: string): void {
    const sourceId = imageSourceId(key, imageId);
    removeLayersAndSource(sourceId, [`${sourceId}:raster`]);
  }

  function upsertCategory(
    key: string,
    category: Category,
    data: ValidatedGisData,
  ): void {
    const sourceId = categorySourceId(key, category);
    const geoJson = categoryData(data, category);
    const source = port.getSource(sourceId);
    if (source) {
      const result = source.setData(geoJson);
      if (result) void result.catch(() => undefined);
      return;
    }
    port.addSource(sourceId, { type: "geojson", data: geoJson } as SourceSpecification);
    for (const layer of categoryLayers(key, category)) port.addLayer(layer);
  }

  function upsertImages(key: string, data: ValidatedGisData): void {
    for (const overlay of data.imageOverlays ?? []) {
      const sourceId = imageSourceId(key, overlay.id);
      const coordinates = imageCoordinates(overlay.rectangle);
      const source = port.getSource(sourceId);
      if (source) {
        source.updateImage({ url: overlay.url, coordinates });
        continue;
      }
      port.addSource(sourceId, {
        type: "image",
        url: overlay.url,
        coordinates,
      });
      port.addLayer({
        id: `${sourceId}:raster`,
        type: "raster",
        source: sourceId,
        paint: {
          "raster-opacity": overlay.alpha ?? 1,
          "raster-fade-duration": 0,
        },
      });
    }
  }

  function applyCamera(data: ValidatedGisData): void {
    const camera = data.cameraView;
    if (!camera) return;
    if (camera.type === "point") {
      port.flyTo({
        center: [camera.lng, camera.lat],
        zoom: pointZoom(camera.lat, camera.altitude),
      });
      return;
    }
    const padding = camera.padding ?? 0.2;
    const { west, south, east, north } = camera.bbox;
    const horizontalPadding = (east - west) * padding / 2;
    const verticalPadding = (north - south) * padding / 2;
    port.fitBounds([
      [Math.max(-180, west - horizontalPadding), Math.max(-90, south - verticalPadding)],
      [Math.min(180, east + horizontalPadding), Math.min(90, north + verticalPadding)],
    ], { maxZoom: 16 });
  }

  function applyNow(key: string, data: ValidatedGisData): void {
    const previous = resources.get(key) ?? {
      categories: new Set<Category>(),
      imageIds: new Set<string>(),
    };
    const nextCategories = new Set<Category>();
    for (const category of categories) {
      if (data[category.field] === undefined) continue;
      nextCategories.add(category.id);
      upsertCategory(key, category.id, data);
    }
    for (const category of previous.categories) {
      if (!nextCategories.has(category)) removeCategory(key, category);
    }

    const nextImageIds = new Set((data.imageOverlays ?? []).map((overlay) => overlay.id));
    for (const imageId of previous.imageIds) {
      if (!nextImageIds.has(imageId)) removeImage(key, imageId);
    }
    upsertImages(key, data);
    applyCamera(data);
    resources.set(key, { categories: nextCategories, imageIds: nextImageIds });
  }

  function removeNow(key: string): void {
    const current = resources.get(key);
    if (!current) return;
    for (const category of current.categories) removeCategory(key, category);
    for (const imageId of current.imageIds) removeImage(key, imageId);
    resources.delete(key);
  }

  function flush(): void {
    frameId = null;
    const batch = [...pending];
    pending.clear();
    for (const [key, data] of batch) applyNow(key, data);
  }

  function clear(): void {
    pending.clear();
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    for (const key of [...resources.keys()]) removeNow(key);
  }

  return {
    apply(update: GisUpdate) {
      if (destroyed) return;
      const parsed = gisDataSchema.safeParse(update.gisData);
      if (!parsed.success) return;
      pending.set(update.key, parsed.data);
      if (frameId === null) frameId = requestFrame(flush);
    },
    remove(key: string) {
      pending.delete(key);
      removeNow(key);
    },
    clear,
    destroy() {
      if (destroyed) return;
      clear();
      destroyed = true;
    },
  };
}
