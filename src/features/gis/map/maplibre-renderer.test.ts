import type { AddLayerObject, SourceSpecification } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import type { GisUpdate } from "../contracts";
import { gisDataSchema } from "./gis-data-schema";
import type { GeoJsonData, MapPort } from "./map-renderer";
import { createMapLibreRenderer } from "./maplibre-renderer";

interface FakeSource {
  specification: SourceSpecification;
  data?: GeoJsonData;
}

function makeMapPort() {
  const sources = new Map<string, FakeSource>();
  const layers = new Map<string, AddLayerObject>();
  const fitBounds = vi.fn();
  const flyTo = vi.fn();

  const port: MapPort = {
    addSource(id, specification) {
      if (sources.has(id)) throw new Error(`Duplicate source: ${id}`);
      sources.set(id, {
        specification,
        ...(specification.type === "geojson" && typeof specification.data !== "string"
          ? { data: specification.data as GeoJsonData }
          : {}),
      });
    },
    getSource(id) {
      const source = sources.get(id);
      if (!source) return undefined;
      return {
        setData(data) {
          source.data = data;
        },
        updateImage(options) {
          source.specification = {
            ...source.specification,
            ...options,
          } as SourceSpecification;
        },
      };
    },
    addLayer(layer) {
      if (layers.has(layer.id)) throw new Error(`Duplicate layer: ${layer.id}`);
      layers.set(layer.id, layer);
    },
    getLayer(id) {
      return layers.get(id);
    },
    removeLayer(id) {
      layers.delete(id);
    },
    removeSource(id) {
      sources.delete(id);
    },
    setPaintProperty(layerId, name, value) {
      const layer = layers.get(layerId);
      if (!layer || !("paint" in layer)) return;
      layers.set(layerId, {
        ...layer,
        paint: { ...layer.paint, [name]: value },
      } as AddLayerObject);
    },
    fitBounds,
    flyTo,
  };

  return { port, sources, layers, fitBounds, flyTo };
}

function makeFrameScheduler() {
  let nextId = 0;
  const callbacks = new Map<number, () => void>();
  return {
    requestFrame(callback: () => void) {
      callbacks.set(++nextId, callback);
      return nextId;
    },
    cancelFrame(id: number) {
      callbacks.delete(id);
    },
    flush() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback();
    },
  };
}

function makeEntityUpdate(key = "task-1:call-1", name = "船只 A"): GisUpdate {
  return {
    version: 1,
    taskId: "task-1",
    key,
    gisData: {
      type: "entity",
      entities: [
        {
          id: "ship-1",
          name,
          type: "ship",
          coordinates: [120.5, 30.5],
          importance: "high",
          status: "warning",
        },
        {
          id: "ship-2",
          name: "船只 B",
          type: "ship",
          coordinates: [121.5, 31.5],
          importance: "low",
          status: "normal",
        },
      ],
    },
  };
}

function setup() {
  const map = makeMapPort();
  const scheduler = makeFrameScheduler();
  const renderer = createMapLibreRenderer(map.port, {
    requestFrame: scheduler.requestFrame,
    cancelFrame: scheduler.cancelFrame,
  });
  return { ...map, scheduler, renderer };
}

describe("gisDataSchema", () => {
  it("accepts a bounded wind-field payload", () => {
    const result = gisDataSchema.safeParse({
      type: "wind-field",
      windField: {
        bbox: { west: 120, south: 30, east: 121, north: 31 },
        grid: { rows: 2, cols: 2 },
        u: [1, 2, 3, 4],
        v: [4, 3, 2, 1],
        speed: [4.1, 3.6, 3.6, 4.1],
        source: "fire-mock",
      },
    });

    expect(result.success).toBe(true);
  });
});

describe("createMapLibreRenderer", () => {
  it("batches entities into stable source and layer IDs", () => {
    const { renderer, scheduler, sources, layers } = setup();

    renderer.apply(makeEntityUpdate());
    expect(sources.size).toBe(0);
    scheduler.flush();

    const sourceId = "gis:task-1%3Acall-1:entity";
    expect([...sources.keys()]).toEqual([sourceId]);
    expect(sources.get(sourceId)?.data).toMatchObject({
      type: "FeatureCollection",
      features: [
        { geometry: { type: "Point", coordinates: [120.5, 30.5] } },
        { geometry: { type: "Point", coordinates: [121.5, 31.5] } },
      ],
    });
    expect([...layers.keys()]).toEqual([
      `${sourceId}:circle`,
      `${sourceId}:label`,
    ]);
  });

  it("applies only the latest queued value for a repeated key", () => {
    const { renderer, scheduler, sources } = setup();

    renderer.apply(makeEntityUpdate("task-1:call-1", "旧位置"));
    renderer.apply(makeEntityUpdate("task-1:call-1", "新位置"));
    scheduler.flush();

    const data = sources.get("gis:task-1%3Acall-1:entity")?.data;
    expect(data).toMatchObject({
      features: [{ properties: { name: "新位置" } }, { properties: { name: "船只 B" } }],
    });
  });

  it("replaces same-key source data without duplicating layers", () => {
    const { renderer, scheduler, sources, layers } = setup();
    renderer.apply(makeEntityUpdate());
    scheduler.flush();

    renderer.apply(makeEntityUpdate("task-1:call-1", "更新后的船只"));
    scheduler.flush();

    expect(sources.size).toBe(1);
    expect(layers.size).toBe(2);
    expect(sources.get("gis:task-1%3Acall-1:entity")?.data).toMatchObject({
      features: [{ properties: { name: "更新后的船只" } }, {}],
    });
  });

  it("keeps distinct update keys in separate sources", () => {
    const { renderer, scheduler, sources } = setup();

    renderer.apply(makeEntityUpdate("task-1:call-1"));
    renderer.apply(makeEntityUpdate("task-1:call-2"));
    scheduler.flush();

    expect([...sources.keys()]).toEqual([
      "gis:task-1%3Acall-1:entity",
      "gis:task-1%3Acall-2:entity",
    ]);
  });

  it("projects regions as closed polygons and trajectories as lines", () => {
    const { renderer, scheduler, sources } = setup();
    const update: GisUpdate = {
      version: 1,
      taskId: "task-1",
      key: "task-1:geo",
      gisData: {
        type: "region",
        regions: [
          {
            id: "region-1",
            name: "监测区",
            type: "monitor",
            coordinates: [[120, 30], [121, 30], [121, 31]],
          },
        ],
        trajectories: [
          {
            id: "track-1",
            name: "航迹",
            type: "route",
            coordinates: [[120, 30], [120.5, 30.5]],
            status: "history",
          },
        ],
      },
    };

    renderer.apply(update);
    scheduler.flush();

    expect(sources.get("gis:task-1%3Ageo:region")?.data).toMatchObject({
      features: [{
        geometry: {
          type: "Polygon",
          coordinates: [[[120, 30], [121, 30], [121, 31], [120, 30]]],
        },
      }],
    });
    expect(sources.get("gis:task-1%3Ageo:trajectory")?.data).toMatchObject({
      features: [{
        geometry: { type: "LineString", coordinates: [[120, 30], [120.5, 30.5]] },
      }],
    });
  });

  it("uses clockwise image corners and removes stale overlays on replacement", () => {
    const { renderer, scheduler, sources } = setup();
    const imageUpdate = (id: string, url: string): GisUpdate => ({
      version: 1,
      taskId: "task-1",
      key: "task-1:image",
      gisData: {
        type: "image",
        imageOverlays: [{
          id,
          url,
          rectangle: { west: 120, south: 30, east: 121, north: 31 },
        }],
      },
    });

    renderer.apply(imageUpdate("before", "/local-tiles/before.png"));
    scheduler.flush();

    const firstId = "gis:task-1%3Aimage:image:before";
    expect(sources.get(firstId)?.specification).toEqual({
      type: "image",
      url: "/agent-api/local-tiles/before.png",
      coordinates: [[120, 31], [121, 31], [121, 30], [120, 30]],
    });

    renderer.apply(imageUpdate("after", "/satellite/after.png"));
    scheduler.flush();

    expect(sources.has(firstId)).toBe(false);
    expect(sources.get("gis:task-1%3Aimage:image:after")?.specification).toMatchObject({
      url: "/agent-api/satellite/after.png",
    });
  });

  it("replaces URL, bounds and opacity for the same image ID", () => {
    const { renderer, scheduler, sources, layers } = setup();
    const imageUpdate = (url: string, alpha: number, east: number): GisUpdate => ({
      version: 1,
      taskId: "task-1",
      key: "task-1:image",
      gisData: {
        type: "image",
        imageOverlays: [{
          id: "comparison",
          url,
          alpha,
          rectangle: { west: 120, south: 30, east, north: 31 },
        }],
      },
    });

    renderer.apply(imageUpdate("https://images.test/before.png", 1, 121));
    scheduler.flush();
    renderer.apply(imageUpdate("https://images.test/after.png", 0, 122));
    scheduler.flush();

    const sourceId = "gis:task-1%3Aimage:image:comparison";
    expect(sources.get(sourceId)?.specification).toMatchObject({
      url: "https://images.test/after.png",
      coordinates: [[120, 31], [122, 31], [122, 30], [120, 30]],
    });
    expect(layers.get(`${sourceId}:raster`)).toMatchObject({
      paint: { "raster-opacity": 0 },
    });
  });

  it("maps fit-bbox camera views to fitBounds", () => {
    const { renderer, scheduler, fitBounds } = setup();
    renderer.apply({
      version: 1,
      taskId: "task-1",
      key: "task-1:camera",
      gisData: {
        type: "region",
        cameraView: {
          type: "fit-bbox",
          bbox: { west: 120, south: 30, east: 121, north: 31 },
          padding: 0,
        },
      },
    });
    scheduler.flush();

    expect(fitBounds).toHaveBeenCalledWith(
      [[120, 30], [121, 31]],
      { maxZoom: 16 },
    );
  });

  it("maps point altitude to a bounded flyTo zoom", () => {
    const { renderer, scheduler, flyTo } = setup();
    renderer.apply({
      version: 1,
      taskId: "task-1",
      key: "task-1:camera",
      gisData: {
        type: "entity",
        cameraView: { type: "point", lng: 120, lat: 30, altitude: 1_000 },
      },
    });
    scheduler.flush();

    expect(flyTo).toHaveBeenCalledOnce();
    expect(flyTo).toHaveBeenCalledWith({
      center: [120, 30],
      zoom: expect.closeTo(15.081, 2),
    });
  });

  it("ignores invalid coordinates and unknown GIS types without throwing", () => {
    const { renderer, scheduler, sources, fitBounds } = setup();
    const invalidEntity = makeEntityUpdate();
    (invalidEntity.gisData.entities as Array<{ coordinates: number[] }>)[0]
      .coordinates = [181, 30.5];

    expect(() => renderer.apply(invalidEntity)).not.toThrow();
    expect(() => renderer.apply({
      version: 1,
      taskId: "task-1",
      key: "task-1:unknown",
      gisData: { type: "unknown" },
    })).not.toThrow();
    scheduler.flush();

    expect(sources.size).toBe(0);
    expect(fitBounds).not.toHaveBeenCalled();
  });

  it("removes only the requested key and clears all remaining resources", () => {
    const { renderer, scheduler, sources, layers } = setup();
    renderer.apply(makeEntityUpdate("task-1:call-1"));
    renderer.apply(makeEntityUpdate("task-1:call-2"));
    scheduler.flush();

    renderer.remove("task-1:call-1");
    expect([...sources.keys()]).toEqual(["gis:task-1%3Acall-2:entity"]);

    renderer.clear();
    expect(sources.size).toBe(0);
    expect(layers.size).toBe(0);
  });

  it("cancels pending work and rejects updates after destroy", () => {
    const { renderer, scheduler, sources } = setup();
    renderer.apply(makeEntityUpdate());

    renderer.destroy();
    scheduler.flush();
    renderer.apply(makeEntityUpdate("task-1:call-2"));
    scheduler.flush();

    expect(sources.size).toBe(0);
  });
});
