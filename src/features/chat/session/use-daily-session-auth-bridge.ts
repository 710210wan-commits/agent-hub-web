"use client";

import { useCallback } from "react";

import { useAuth } from "@/providers/auth-provider";

export interface DailySessionAuthBridge {
  enabled: boolean;
  identityGeneration: number;
  onAuthRequired(): void;
}

export function useDailySessionAuthBridge(): DailySessionAuthBridge {
  const { status, identityGeneration, invalidate } = useAuth();

  const onAuthRequired = useCallback(() => {
    if (status === "authenticated") invalidate();
  }, [invalidate, status]);

  return {
    enabled: status === "authenticated",
    identityGeneration,
    onAuthRequired,
  };
}
