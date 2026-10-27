"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { parseMode, type AppMode } from "@/config/modes";

interface ModeContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

export function ModeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = parseMode(searchParams.get("mode"));

  const setMode = useCallback(
    (nextMode: AppMode) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("mode", nextMode);
      router.replace(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams],
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
