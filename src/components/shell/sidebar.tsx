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
import { useAuth, type AuthStatus } from "@/providers/auth-provider";
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

/** 头像缩写：取显示名前两个字符（中文按字，英文按字母大写） */
function userInitials(displayName?: string): string {
  if (!displayName) return "--";
  return displayName.trim().slice(0, 2).toUpperCase() || "--";
}

/** 侧栏用户槽的状态文案（统一登录后的真实登录态） */
function authStatusLabel(status: AuthStatus): string {
  switch (status) {
    case "authenticated":
      return "已登录";
    case "demo":
      return "演示模式";
    case "checking":
      return "登录状态确认中";
    case "error":
      return "登录服务异常";
    default:
      return "未登录";
  }
}

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
  const content = (
    <>
      <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
      <span className="sidebar-link-label">{item.label}</span>
    </>
  );

  if (item.id === "gis") {
    return (
      <a
        aria-label={item.label}
        className="sidebar-link"
        href={item.href}
        onClick={onNavigate}
        rel="noopener noreferrer"
        target="_blank"
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      className={`sidebar-link${active ? " is-active" : ""}`}
      href={item.href}
      onClick={onNavigate}
    >
      {content}
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
  const { user, status } = useAuth();
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
          const draftId =
            typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `${Date.now()}`;
          router.push(`/chat?mode=${mode}&draft=${draftId}`);
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
            <span className="sidebar-avatar">{userInitials(user?.displayName)}</span>
            <span className="sidebar-user-copy">
              <strong>{user?.displayName ?? "未登录"}</strong>
              <small>{authStatusLabel(status)}</small>
            </span>
          </div>
        </div>
      </nav>
    </aside>
  );
}
