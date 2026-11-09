"use client";

import { useMemo } from "react";

import { createXiaozhiTransport } from "@/features/chat/transports/xiaozhi-transport";
import { useAppMode } from "@/providers/mode-provider";

import { HistoryPageClient } from "./history-page-client";

export default function HistoryPage() {
  const { mode } = useAppMode();
  const sessionTransport = useMemo(
    () => (mode === "work" ? createXiaozhiTransport().sessions : undefined),
    [mode],
  );

  return (
    <HistoryPageClient mode={mode} sessionTransport={sessionTransport} />
  );
}
