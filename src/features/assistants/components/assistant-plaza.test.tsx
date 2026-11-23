import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getNavigation } from "@/config/navigation";
import { AuthProvider, useAuth } from "@/providers/auth-provider";

import { AssistantClientError, type AssistantClient } from "../api/assistant-client";
import { AssistantPlaza } from "./assistant-plaza";

const assistant = {
  id: "resume-screening",
  version: 1,
  name: "简历筛选助手",
  summary: "根据岗位标准辅助筛选电子简历",
  icon: "file-search",
  tags: ["HR", "简历筛选"],
  status: "published" as const,
  runtime: "dsi-native" as const,
  requiredSkills: ["resume-screening"],
  allowedOptionalCapabilities: [],
  setupProfile: "resume-screening-v1",
  resultRenderer: "resume-screening-v1",
  modelPolicy: "hr-screening-default",
  retentionDays: 30,
};

function client(overrides: Partial<AssistantClient> = {}): AssistantClient {
  return {
    listAssistants: vi.fn().mockResolvedValue([assistant]),
    getAssistant: vi.fn().mockResolvedValue(assistant),
    createUploadDraft: vi.fn(),
    uploadDraftFile: vi.fn(),
    removeDraftFile: vi.fn(),
    createAssistantConversation: vi.fn(),
    ...overrides,
  };
}

const authClient = {
  getAuthStatus: vi.fn().mockResolvedValue({ enabled: true, user: { id: "u1", displayName: "管理员" } }),
  login: vi.fn(),
  loginDemo: vi.fn(),
  logout: vi.fn(),
};

function AuthStatusProbe() {
  const { status } = useAuth();
  return <output aria-label="auth-status">{status}</output>;
}

describe("AssistantPlaza", () => {
  it("is global, contains only curated assistants, and exposes no builder", async () => {
    render(
      <AuthProvider client={authClient}>
        <AssistantPlaza client={client()} />
      </AuthProvider>,
    );

    const link = await screen.findByRole("link", { name: /简历筛选助手/ });
    expect(link).toHaveAttribute("href", "/assistants/resume-screening");
    expect(screen.queryByText(/创建助手|智能体 Builder/i)).not.toBeInTheDocument();
    expect(getNavigation("daily").find((item) => item.id === "assistants")?.href).toBe("/assistants");
    expect(getNavigation("work").find((item) => item.id === "assistants")?.href).toBe("/assistants");
  });

  it("invalidates global auth on 401", async () => {
    const failing = client({
      listAssistants: vi.fn().mockRejectedValue(new AssistantClientError(401, "AUTH_REQUIRED", "login")),
    });
    render(
      <AuthProvider client={authClient}>
        <AuthStatusProbe />
        <AssistantPlaza client={failing} />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText("auth-status")).toHaveTextContent("anonymous"));
  });
});
