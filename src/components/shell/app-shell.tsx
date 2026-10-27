"use client";

import { useState, type ReactNode } from "react";

import { MobileSidebar } from "./mobile-sidebar";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      <div className="app-workspace">
        <Topbar
          title={title}
          menuButton={
            <MobileSidebar
              expanded={mobileOpen}
              onToggle={() => setMobileOpen((value) => !value)}
            />
          }
        />
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
