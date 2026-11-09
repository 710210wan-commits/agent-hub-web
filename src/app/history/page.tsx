"use client";

import { useMemo } from "react";

import { createDailySessionClient } from "@/features/chat/transports/daily-session-client";
import { createXiaozhiTransport } from "@/features/chat/transports/xiaozhi-transport";
import { useAppMode } from "@/providers/mode-provider";

import { HistoryPageClient } from "./history-page-client";

export default function HistoryPage() {
  const { mode } = useAppMode();
  const sessionTransport = useMemo(
    () => (mode === "work" ? createXiaozhiTransport().sessions : undefined),
    [mode],
  );
  const dailySessionClient = useMemo(
    () => (mode === "daily" ? createDailySessionClient() : undefined),
    [mode],
  );

  return (
    <HistoryPageClient
      dailySessionClient={dailySessionClient}
      mode={mode}
      sessionTransport={sessionTransport}
    />
  );
}
