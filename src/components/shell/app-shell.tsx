"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { MobileSidebar } from "./mobile-sidebar";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({
  children,
  title,
  topbarControl,
}: {
  children: ReactNode;
  title: string;
  topbarControl?: ReactNode;
}) {
  const pathname = usePathname();
  const sharedResource = /^\/(?:knowledge|mcp)(?:\/|$)/.test(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      <div className="app-workspace">
        <Topbar
          centerControl={topbarControl}
          showModeSwitch={!sharedResource}
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
