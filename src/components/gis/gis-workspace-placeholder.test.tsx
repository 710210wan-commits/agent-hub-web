import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { GisWorkspacePlaceholder } from "./gis-workspace-placeholder";

describe("GisWorkspacePlaceholder", () => {
  it("renders named desktop extension slots and a lightweight mobile notice", () => {
    render(<GisWorkspacePlaceholder />);

    expect(screen.getByRole("region", { name: "地图画布" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "地图工具栏" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "图层面板" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "地图状态" })).toBeInTheDocument();
    expect(screen.getByText("GIS 工作台暂仅支持桌面端")).toBeInTheDocument();
  });

  it("does not introduce a map engine in the placeholder", () => {
    const packageJson = readFileSync("package.json", "utf8");
    const source = readFileSync("src/components/gis/gis-workspace-placeholder.tsx", "utf8");

    expect(packageJson.toLowerCase()).not.toMatch(/cesium|maplibre/);
    expect(source.toLowerCase()).not.toMatch(/from ["'](?:cesium|maplibre)/);
  });
});
