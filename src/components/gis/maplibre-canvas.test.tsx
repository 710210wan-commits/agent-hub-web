import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MapLibreCanvas } from "./maplibre-canvas";

const maplibre = vi.hoisted(() => ({
  Map: vi.fn(),
  setWorkerUrl: vi.fn(),
}));

vi.mock("maplibre-gl", () => ({
  Map: maplibre.Map,
  setWorkerUrl: maplibre.setWorkerUrl,
}));

function makeMap() {
  const listeners = new Map<string, () => void>();
  const map = {
    on: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener);
      return map;
    }),
    off: vi.fn((event: string) => {
      listeners.delete(event);
      return map;
    }),
    remove: vi.fn(),
  };
  return { map, listeners };
}

describe("MapLibreCanvas", () => {
  beforeEach(() => {
    maplibre.Map.mockReset();
    maplibre.setWorkerUrl.mockClear();
  });

  it("exposes a renderer after load and tears down listeners and map on unmount", () => {
    const fake = makeMap();
    maplibre.Map.mockImplementation(function () {
      return fake.map;
    });
    const onRendererReady = vi.fn();

    const { unmount } = render(
      <MapLibreCanvas onRendererReady={onRendererReady} />,
    );

    expect(onRendererReady).not.toHaveBeenCalled();
    expect(maplibre.setWorkerUrl).toHaveBeenCalledWith(
      "/vendor/maplibre-gl-6.16.0/maplibre-gl-worker.mjs",
    );
    act(() => fake.listeners.get("load")?.());
    expect(onRendererReady).toHaveBeenCalledWith(expect.objectContaining({
      apply: expect.any(Function),
      remove: expect.any(Function),
      clear: expect.any(Function),
      destroy: expect.any(Function),
    }));

    unmount();
    expect(fake.map.off).toHaveBeenCalledWith("load", expect.any(Function));
    expect(fake.map.remove).toHaveBeenCalledOnce();
    expect(onRendererReady).toHaveBeenLastCalledWith(null);
  });

  it("shows a truthful fallback when WebGL map construction fails", async () => {
    maplibre.Map.mockImplementation(() => {
      throw new Error("WebGL unavailable");
    });
    const onRendererReady = vi.fn();

    render(<MapLibreCanvas onRendererReady={onRendererReady} />);

    expect(await screen.findByText("当前浏览器无法初始化地图")).toBeInTheDocument();
    expect(onRendererReady).not.toHaveBeenCalled();
  });
});
