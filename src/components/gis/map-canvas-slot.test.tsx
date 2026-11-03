import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MapCanvasSlot } from "./map-canvas-slot";

const lazyMap = vi.hoisted(() => ({ render: vi.fn() }));
const media = vi.hoisted(() => ({
  matches: false,
  listeners: new Set<() => void>(),
  matchMedia: vi.fn(),
}));

function LazyMapStub() {
  lazyMap.render();
  return <div data-testid="lazy-map" />;
}

vi.mock("next/dynamic", () => ({ default: () => LazyMapStub }));

describe("MapCanvasSlot responsive loading", () => {
  beforeEach(() => {
    lazyMap.render.mockClear();
    media.matches = false;
    media.listeners.clear();
    media.matchMedia.mockReset();
    media.matchMedia.mockImplementation(() => ({
      get matches() {
        return media.matches;
      },
      addEventListener(_event: string, listener: () => void) {
        media.listeners.add(listener);
      },
      removeEventListener(_event: string, listener: () => void) {
        media.listeners.delete(listener);
      },
    }));
    vi.stubGlobal("matchMedia", media.matchMedia);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not mount the lazy map below the desktop breakpoint", () => {
    render(<MapCanvasSlot />);

    expect(screen.getByRole("region", { name: "地图画布" })).toBeInTheDocument();
    expect(screen.queryByTestId("lazy-map")).not.toBeInTheDocument();
    expect(lazyMap.render).not.toHaveBeenCalled();
  });

  it("unmounts the lazy map when the viewport becomes mobile", () => {
    media.matches = true;
    render(<MapCanvasSlot />);
    expect(screen.getByTestId("lazy-map")).toBeInTheDocument();

    act(() => {
      media.matches = false;
      for (const listener of media.listeners) listener();
    });

    expect(screen.queryByTestId("lazy-map")).not.toBeInTheDocument();
  });
});
