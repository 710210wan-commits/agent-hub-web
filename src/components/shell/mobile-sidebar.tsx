"use client";

import { Menu, X } from "lucide-react";

export function MobileSidebar({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = expanded ? X : Menu;
  return (
    <button
      aria-expanded={expanded}
      aria-label={expanded ? "关闭导航" : "打开导航"}
      className="mobile-menu-button"
      onClick={onToggle}
      type="button"
    >
      <Icon aria-hidden="true" size={18} />
    </button>
  );
}
