"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ChatPage } from "@/components/chat/chat-page";
import { DailySessionView } from "@/components/chat/daily-session-view";
import { AppShell } from "@/components/shell/app-shell";
import { parseMode } from "@/config/modes";
import type { MockRunScenario } from "@/features/chat/fixtures/default-run";
import { createDailySessionClient } from "@/features/chat/transports/daily-session-client";
import { createMockTransport } from "@/features/chat/transports/mock-transport";
import { createXiaozhiTransport } from "@/features/chat/transports/xiaozhi-transport";

const mockScenarios = new Set<MockRunScenario>([
  "completed",
  "stopped",
  "disconnected",
  "failed",
]);

export default function ChatRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const mode = parseMode(searchParams.get("mode"));
  const e2eScenariosEnabled =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_E2E_SCENARIOS === "1";
  const requestedConversation = searchParams.get("conversation") || undefined;
  const workConversation = mode === "work" ? requestedConversation : undefined;
  const requestedScenario = e2eScenariosEnabled ? searchParams.get("scenario") : null;
  const requestedDelay = e2eScenariosEnabled ? Number(searchParams.get("delay")) : NaN;
  const requestedMockScenario =
    e2eScenariosEnabled &&
    requestedScenario &&
    mockScenarios.has(requestedScenario as MockRunScenario)
      ? (requestedScenario as MockRunScenario)
      : undefined;
  const useCanonicalDaily = mode === "daily" && !requestedMockScenario;
  const dailyConversation = useCanonicalDaily ? requestedConversation : undefined;
  const draft = searchParams.get("draft") || undefined;
  const routeKey = workConversation
    ? `${mode}:conversation:${workConversation}`
    : `${mode}:draft:${draft ?? "default"}`;
  const transport = useMemo(
    () => {
      if (mode === "work") return createXiaozhiTransport();
      if (requestedMockScenario) {
        const delayMs = Number.isFinite(requestedDelay)
          ? Math.min(2_000, Math.max(50, requestedDelay))
          : undefined;
        return createMockTransport({
          scenario: requestedMockScenario,
          delayMs,
        });
      }
      return undefined;
    },
    [mode, requestedDelay, requestedMockScenario],
  );
  const dailySessionClient = useMemo(
    () => (useCanonicalDaily ? createDailySessionClient() : undefined),
    [useCanonicalDaily],
  );
  const onSessionResolved = useCallback(
    (sessionId: string) => {
      if (mode !== "work") return;
      const next = new URLSearchParams(search);
      next.set("mode", "work");
      next.set("conversation", sessionId);
      next.delete("draft");
      router.replace(`/chat?${next.toString()}`);
    },
    [mode, router, search],
  );
  const onDailyConversationResolved = useCallback(
    (conversationId: string) => {
      if (!useCanonicalDaily) return;
      const next = new URLSearchParams(search);
      next.set("mode", "daily");
      next.set("conversation", conversationId);
      next.delete("draft");
      router.replace(`/chat?${next.toString()}`);
    },
    [router, search, useCanonicalDaily],
  );

  if (useCanonicalDaily && dailySessionClient) {
    return (
      <AppShell title={dailyConversation ? "历史会话" : "新对话"}>
        <div className="chat-page">
          <div className="chat-scroll-region daily-session-scroll-region">
            <DailySessionView
              client={dailySessionClient}
              conversationId={dailyConversation}
              onConversationResolved={onDailyConversationResolved}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!transport) return null;

  return (
    <ChatPage
      initialSessionId={workConversation}
      key={mode}
      onSessionResolved={onSessionResolved}
      routeKey={routeKey}
      transport={transport}
    />
  );
}
