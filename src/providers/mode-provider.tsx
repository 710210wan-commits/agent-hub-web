"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { parseMode, serializeMode, withMode, type AppMode } from "@/config/modes";

interface ModeContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);
const SKILL_ROUTE_STORAGE_PREFIX = "agent-hub:skill-route:";

function isSkillPath(pathname: string): boolean {
  return pathname === "/skills" || pathname.startsWith("/skills/");
}

function routeHref(pathname: string, search: string): string {
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  return `${pathname}${search ? `?${search}` : ""}${hash}`;
}

function rememberSkillRoute(mode: AppMode, href: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(`${SKILL_ROUTE_STORAGE_PREFIX}${mode}`, href);
}

function readSkillRoute(mode: AppMode): string | null {
  if (typeof window === "undefined") return null;
  const stored = window.sessionStorage.getItem(`${SKILL_ROUTE_STORAGE_PREFIX}${mode}`);
  if (!stored?.startsWith("/")) return null;
  try {
    const url = new URL(stored, "https://agent-hub.local");
    if (url.origin !== "https://agent-hub.local" || !isSkillPath(url.pathname)) return null;
    if (parseMode(url.searchParams.get("mode")) !== mode) return null;
    return withMode(`${url.pathname}${url.search}${url.hash}`, mode);
  } catch {
    return null;
  }
}

export function ModeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const mode = parseMode(searchParams.get("mode"));

  useEffect(() => {
    if (searchParams.get("mode") !== serializeMode(mode)) {
      router.replace(withMode(routeHref(pathname, search), mode));
    }
  }, [mode, pathname, router, search, searchParams]);

  useEffect(() => {
    if (isSkillPath(pathname)) rememberSkillRoute(mode, routeHref(pathname, search));
  }, [mode, pathname, search]);

  const setMode = useCallback(
    (nextMode: AppMode) => {
      if (nextMode === mode) return;
      if (isSkillPath(pathname)) {
        rememberSkillRoute(mode, routeHref(pathname, search));
        router.replace(readSkillRoute(nextMode) ?? withMode("/skills", nextMode));
        return;
      }
      const next = new URLSearchParams(searchParams.toString());
      next.set("mode", serializeMode(nextMode));
      if (pathname === "/chat" || pathname === "/history") {
        next.delete("conversation");
        next.delete("draft");
      }
      router.replace(routeHref(pathname, next.toString()));
    },
    [mode, pathname, router, search, searchParams],
  );

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return (
    <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
  );
}

export function useAppMode(): ModeContextValue {
  const value = useContext(ModeContext);
  if (!value) throw new Error("useAppMode 必须在 ModeProvider 内使用");
  return value;
}
