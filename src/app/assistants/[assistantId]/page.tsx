"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { InlineError } from "@/components/states/inline-error";
import { LoadingState } from "@/components/states/loading-state";
import {
  createAssistantClient,
  isAssistantClientError,
} from "@/features/assistants/api/assistant-client";
import type { AssistantDefinition } from "@/features/assistants/contracts/generated";
import { ResumeScreeningSetupForm } from "@/features/assistants/resume-screening/setup-form";
import { useAuth } from "@/providers/auth-provider";

type State =
  | { kind: "loading" }
  | { kind: "ready"; assistant: AssistantDefinition }
  | { kind: "error"; message: string };

export default function AssistantDetailPage() {
  const params = useParams<{ assistantId: string }>();
  const assistantId = Array.isArray(params.assistantId) ? params.assistantId[0] : params.assistantId;
  const client = useMemo(() => createAssistantClient(), []);
  const { identityGeneration, invalidate } = useAuth();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    client.getAssistant(assistantId, controller.signal).then((assistant) => {
      if (!controller.signal.aborted) setState({ kind: "ready", assistant });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (isAssistantClientError(error) && error.status === 401) {
        invalidate();
        return;
      }
      setState({
        kind: "error",
        message: isAssistantClientError(error) && error.status === 403
          ? "权限不足，无法查看此助手。"
          : "助手加载失败，请稍后重试。",
      });
    });
    return () => controller.abort();
  }, [assistantId, client, identityGeneration, invalidate]);

  return (
    <AppShell title="助手广场">
      <div className="assistant-detail-page">
        {state.kind === "loading" ? <LoadingState label="正在加载助手…" /> : null}
        {state.kind === "error" ? <InlineError message={state.message} /> : null}
        {state.kind === "ready" && state.assistant.id === "resume-screening" ? (
          <ResumeScreeningSetupForm assistant={state.assistant} client={client} />
        ) : null}
        {state.kind === "ready" && state.assistant.id !== "resume-screening" ? (
          <InlineError message="此助手的设置页尚未接入。" />
        ) : null}
      </div>
    </AppShell>
  );
}
