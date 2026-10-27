import { Layers3 } from "lucide-react";

export function LayerPanelSlot() {
  return (
    <aside aria-label="图层面板" className="layer-panel-slot">
      <header><Layers3 aria-hidden="true" size={15} /><strong>图层</strong></header>
      <div className="layer-placeholder"><span>图层管理待接入</span><small>LAYER PANEL SLOT</small></div>
    </aside>
  );
}
