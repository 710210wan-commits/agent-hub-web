"use client";

import {
  BookOpen,
  Clock3,
  DatabaseZap,
  Map,
  MessageSquarePlus,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";

import { copy } from "@/config/copy";
import {
  getNavigation,
  type NavigationIcon,
  type NavigationItem,
} from "@/config/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useAppMode } from "@/providers/mode-provider";

const icons: Record<NavigationIcon, LucideIcon> = {
  chat: MessageSquarePlus,
  history: Clock3,
  gis: Map,
  knowledge: BookOpen,
  skill: Sparkles,
  mcp: DatabaseZap,
  settings: Settings,
};

function NavigationLink({
  item,
  active,
  onNavigate,
}: {
  item: NavigationItem;
  active: boolean;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const Icon = icons[item.icon];
  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={`sidebar-link${active ? " is-active" : ""}`}
      href={item.href}
      onClick={onNavigate}
    >
      <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
      <span className="sidebar-link-label">{item.label}</span>
    </Link>
  );
}

export function Sidebar({
  mobileOpen,
  onNavigate,
}: {
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode } = useAppMode();
  const { user } = useAuth();
  const items = getNavigation(mode);
  const primary = items.filter((item) => item.section === "primary");
  const capabilities = items.filter((item) => item.section === "capabilities");
  const footer = items.filter((item) => item.section === "footer");

  const renderLink = (item: NavigationItem) => (
    <NavigationLink
      active={pathname === item.href.split("?")[0]}
      item={item}
      key={item.id}
      onNavigate={(event) => {
        if (item.id === "chat") {
          event.preventDefault();
          const conversationId =
            typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `${Date.now()}`;
          router.push(`/chat?mode=${mode}&conversation=${conversationId}`);
        }
        onNavigate();
      }}
    />
  );

  return (
    <aside className={`sidebar${mobileOpen ? " is-mobile-open" : ""}`}>
      <div className="brand">
        <span className="brand-mark">AI</span>
        <span className="brand-copy">
          <strong>{copy.productName}</strong>
          <small>{copy.productTagline}</small>
        </span>
      </div>

      <nav aria-label="主导航" className="sidebar-navigation">
        <div className="sidebar-group">{primary.map(renderLink)}</div>
        <div className="sidebar-section-label">能力</div>
        <div className="sidebar-group">{capabilities.map(renderLink)}</div>
        <div className="sidebar-footer">
          {footer.map(renderLink)}
          <div className="sidebar-user">
            <span className="sidebar-avatar">{user.initials}</span>
            <span className="sidebar-user-copy">
              <strong>{user.name}</strong>
              <small>{user.workspace}</small>
            </span>
          </div>
        </div>
      </nav>
    </aside>
  );
}
