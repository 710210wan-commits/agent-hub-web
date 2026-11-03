import type { GisProfile } from "@/config/gis-profiles";
import type { GisTransport } from "@/features/gis/contracts";

import { GisStandardWorkspace } from "./gis-standard-workspace";
import { LayerPanelSlot } from "./layer-panel-slot";
import { MapCanvasSlot } from "./map-canvas-slot";
import { MapStatusSlot } from "./map-status-slot";
import { MapToolbarSlot } from "./map-toolbar-slot";

interface GisWorkspacePlaceholderProps {
  profile: GisProfile;
  transport: GisTransport;
}

export function GisWorkspacePlaceholder({
  profile,
  transport,
}: GisWorkspacePlaceholderProps) {
  if (profile === "standard") {
    return <GisStandardWorkspace transport={transport} />;
  }

  return (
    <div className="gis-workspace-placeholder">
      <div className="gis-desktop-shell">
        <MapCanvasSlot />
        <MapToolbarSlot />
        <LayerPanelSlot />
        <MapStatusSlot />
      </div>
      <div className="gis-mobile-notice">
        <strong>GIS 工作台暂仅支持桌面端</strong>
        <p>移动端地图展示将在后续版本接入。</p>
      </div>
    </div>
  );
}
