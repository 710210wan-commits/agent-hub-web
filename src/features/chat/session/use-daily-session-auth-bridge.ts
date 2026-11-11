"use client";

import { useCallback, useEffect, useRef } from "react";

import { useAuth } from "@/providers/auth-provider";

export interface DailySessionAuthBridge {
  enabled: boolean;
  identityGeneration: number;
  onAuthRequired(): void;
}

export function useDailySessionAuthBridge(): DailySessionAuthBridge {
  const { status, identityGeneration, invalidate } = useAuth();
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const onAuthRequired = useCallback(() => {
    if (statusRef.current === "authenticated") invalidate();
  }, [invalidate]);

  return {
    enabled: status === "authenticated",
    identityGeneration,
    onAuthRequired,
  };
}
