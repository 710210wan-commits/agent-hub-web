"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ChatPage } from "@/components/chat/chat-page";
import { DailySessionAuthGate } from "@/components/chat/daily-session-auth-gate";
import { DailySessionView } from "@/components/chat/daily-session-view";
import { AppShell } from "@/components/shell/app-shell";
import { readPublicRuntimeConfig } from "@/config/env";
import { parseMode } from "@/config/modes";
import type { MockRunScenario } from "@/features/chat/fixtures/default-run";
import { DailySessionAuthProvider } from "@/features/chat/session/daily-session-auth-provider";
import { createChatTransport } from "@/features/chat/transports/create-transport";
import { createDailySessionClient } from "@/features/chat/transports/daily-session-client";
import { createMockTransport } from "@/features/chat/transports/mock-transport";
import { createProjectsNewTransport } from "@/features/chat/transports/projects-new-transport";
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
  const dailyConversation = mode === "daily" ? requestedConversation : undefined;
  const draft = searchParams.get("draft") || undefined;
  const routeKey = workConversation
    ? `${mode}:conversation:${workConversation}`
    : `${mode}:draft:${draft ?? "default"}`;
  const backendOverride = e2eScenariosEnabled ? searchParams.get("backend") : null;
  const requestedScenario = e2eScenariosEnabled ? searchParams.get("scenario") : null;
  const requestedDelay = e2eScenariosEnabled ? Number(searchParams.get("delay")) : NaN;
  const transport = useMemo(
    () => {
      if (dailyConversation) return undefined;
      if (mode === "work") return createXiaozhiTransport();
      const config = readPublicRuntimeConfig();
      if (backendOverride === "real") {
        return createProjectsNewTransport({ apiBaseUrl: config.apiBaseUrl });
      }
      if (requestedScenario && mockScenarios.has(requestedScenario as MockRunScenario)) {
        const delayMs = Number.isFinite(requestedDelay)
          ? Math.min(2_000, Math.max(50, requestedDelay))
          : undefined;
        return createMockTransport({
          scenario: requestedScenario as MockRunScenario,
          delayMs,
        });
      }
      return createChatTransport(config);
    },
    [backendOverride, dailyConversation, mode, requestedDelay, requestedScenario],
  );
  const dailySessionClient = useMemo(
    () => (dailyConversation ? createDailySessionClient() : undefined),
    [dailyConversation],
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

  if (dailyConversation && dailySessionClient) {
    return (
      <AppShell title="历史会话">
        <div className="chat-page">
          <div className="chat-scroll-region daily-session-scroll-region">
            <DailySessionAuthProvider client={dailySessionClient}>
              <DailySessionAuthGate>
                <DailySessionView
                  client={dailySessionClient}
                  conversationId={dailyConversation}
                />
              </DailySessionAuthGate>
            </DailySessionAuthProvider>
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
