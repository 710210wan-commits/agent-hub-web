"use client";

import { Bot, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { InlineError } from "@/components/states/inline-error";
import { LoadingState } from "@/components/states/loading-state";
import { useAuth } from "@/providers/auth-provider";

import { createAssistantClient, isAssistantClientError, type AssistantClient } from "../api/assistant-client";
import type { AssistantDefinition } from "../contracts/generated";

type State =
  | { kind: "loading" }
  | { kind: "ready"; assistants: AssistantDefinition[] }
  | { kind: "error"; message: string };

export function AssistantPlaza({ client: clientOverride }: { client?: AssistantClient }) {
  const client = useMemo(() => clientOverride ?? createAssistantClient(), [clientOverride]);
  const { identityGeneration, invalidate } = useAuth();
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<State>({ kind: "loading" });
  const retry = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    client.listAssistants(controller.signal).then((assistants) => {
      if (!controller.signal.aborted) setState({ kind: "ready", assistants });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (isAssistantClientError(error) && error.status === 401) {
        invalidate();
        return;
      }
      setState({ kind: "error", message: safeMessage(error) });
    });
    return () => controller.abort();
  }, [client, identityGeneration, invalidate, reload]);

  return (
    <section className="resource-page assistant-plaza">
      <header className="page-heading">
        <div>
          <h1>助手广场</h1>
          <p>使用平台预先配置的助手，直接完成特定任务。</p>
        </div>
      </header>
      {state.kind === "loading" ? <LoadingState label="正在加载助手…" /> : null}
      {state.kind === "error" ? (
        <div className="assistant-error-stack">
          <InlineError message={state.message} />
          <button className="assistant-secondary-button" onClick={retry} type="button">
            <RefreshCw aria-hidden size={14} />重试
          </button>
        </div>
      ) : null}
      {state.kind === "ready" && state.assistants.length === 0 ? (
        <EmptyState description="当前没有已发布助手。" title="助手广场暂无内容" />
      ) : null}
      {state.kind === "ready" && state.assistants.length > 0 ? (
        <div className="resource-grid">
          {state.assistants.map((assistant) => (
            <Link
              aria-label={`${assistant.name}：${assistant.summary}`}
              className="resource-card assistant-card"
              href={`/assistants/${encodeURIComponent(assistant.id)}`}
              key={`${assistant.id}:${assistant.version}`}
            >
              <span className="assistant-card-icon"><Bot aria-hidden size={20} /></span>
              <span className="resource-card-copy">
                <strong>{assistant.name}</strong>
                <span>{assistant.summary}</span>
                <small>{assistant.tags.join(" · ")}</small>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function safeMessage(error: unknown): string {
  if (isAssistantClientError(error) && error.status === 403) return "权限不足，无法查看助手。";
  return "助手列表加载失败，请稍后重试。";
}
