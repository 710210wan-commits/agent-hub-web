"use client";

import { useMemo } from "react";

import { ChatPage } from "@/components/chat/chat-page";
import { resolvePublicRuntimeConfig } from "@/config/env";
import { createChatTransport } from "@/features/chat/transports/create-transport";

export default function ChatRoute() {
  const transport = useMemo(
    () => createChatTransport(resolvePublicRuntimeConfig(process.env)),
    [],
  );
  return <ChatPage transport={transport} />;
}
