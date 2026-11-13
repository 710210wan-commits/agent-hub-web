import type { ReactNode } from "react";

import { ModeSwitch } from "./mode-switch";

export function Topbar({
  title,
  menuButton,
  centerControl,
  showModeSwitch = true,
}: {
  title: string;
  menuButton?: ReactNode;
  centerControl?: ReactNode;
  showModeSwitch?: boolean;
}) {
  return (
    <header className="topbar">
      <div className="topbar-leading">
        {menuButton}
        <span className="topbar-title">{title}</span>
      </div>
      {centerControl ?? (showModeSwitch ? <ModeSwitch /> : <div aria-hidden="true" />)}
      <div className="topbar-trailing" aria-hidden="true" />
    </header>
  );
}
