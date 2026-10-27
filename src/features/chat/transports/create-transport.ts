import type { PublicRuntimeConfig } from "@/config/env";

import type { ChatTransport } from "../contracts/transport";
import { createMockTransport } from "./mock-transport";
import { createProjectsNewTransport } from "./projects-new-transport";

export function createChatTransport(config: PublicRuntimeConfig): ChatTransport {
  return config.transport === "mock"
    ? createMockTransport()
    : createProjectsNewTransport({ apiBaseUrl: config.apiBaseUrl });
}
