import { LocateFixed, Minus, Plus } from "lucide-react";

export function MapToolbarSlot() {
  return (
    <div aria-label="地图工具栏" className="map-toolbar-slot" role="toolbar">
      <button aria-label="放大（待接入）" disabled type="button"><Plus size={15} /></button>
      <button aria-label="缩小（待接入）" disabled type="button"><Minus size={15} /></button>
      <button aria-label="定位（待接入）" disabled type="button"><LocateFixed size={15} /></button>
    </div>
  );
}
