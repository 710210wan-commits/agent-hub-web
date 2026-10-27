"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { ChatPage } from "@/components/chat/chat-page";
import { resolvePublicRuntimeConfig } from "@/config/env";
import type { MockRunScenario } from "@/features/chat/fixtures/default-run";
import { createChatTransport } from "@/features/chat/transports/create-transport";
import { createMockTransport } from "@/features/chat/transports/mock-transport";
import { createProjectsNewTransport } from "@/features/chat/transports/projects-new-transport";

const mockScenarios = new Set<MockRunScenario>([
  "completed",
  "stopped",
  "disconnected",
  "failed",
]);

export default function ChatRoute() {
  const searchParams = useSearchParams();
  const e2eScenariosEnabled = process.env.NEXT_PUBLIC_E2E_SCENARIOS === "1";
  const backendOverride = e2eScenariosEnabled ? searchParams.get("backend") : null;
  const requestedScenario = e2eScenariosEnabled ? searchParams.get("scenario") : null;
  const requestedDelay = e2eScenariosEnabled ? Number(searchParams.get("delay")) : NaN;
  const transport = useMemo(
    () => {
      const config = resolvePublicRuntimeConfig(process.env);
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
    [backendOverride, requestedDelay, requestedScenario],
  );
  return <ChatPage transport={transport} />;
}
