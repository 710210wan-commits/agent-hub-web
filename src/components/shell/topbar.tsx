import type { ReactNode } from "react";

import { ModeSwitch } from "./mode-switch";

export function Topbar({
  title,
  menuButton,
  centerControl,
}: {
  title: string;
  menuButton?: ReactNode;
  centerControl?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="topbar-leading">
        {menuButton}
        <span className="topbar-title">{title}</span>
      </div>
      {centerControl ?? <ModeSwitch />}
      <div className="topbar-trailing" aria-hidden="true" />
    </header>
  );
}
