import type { AppMode } from "./modes";
import { withMode } from "./modes";

export type NavigationIcon =
  | "chat"
  | "history"
  | "gis"
  | "knowledge"
  | "skill"
  | "mcp"
  | "settings";

export interface NavigationItem {
  id: NavigationIcon;
  label: string;
  href: string;
  icon: NavigationIcon;
  section?: "primary" | "capabilities" | "footer";
}

const navigationItems: NavigationItem[] = [
  { id: "chat", label: "新对话", href: "/chat", icon: "chat", section: "primary" },
  { id: "history", label: "历史对话", href: "/history", icon: "history", section: "primary" },
  { id: "gis", label: "GIS 工作台", href: "/gis", icon: "gis", section: "capabilities" },
  { id: "knowledge", label: "知识库", href: "/knowledge", icon: "knowledge", section: "capabilities" },
  { id: "skill", label: "Skill", href: "/skills", icon: "skill", section: "capabilities" },
  { id: "mcp", label: "MCP", href: "/mcp", icon: "mcp", section: "capabilities" },
  { id: "settings", label: "设置", href: "/settings?section=model", icon: "settings", section: "footer" },
];

export function getNavigation(mode: AppMode): NavigationItem[] {
  return navigationItems.map((item) => ({
    ...item,
    href: withMode(item.href, mode),
  }));
}
