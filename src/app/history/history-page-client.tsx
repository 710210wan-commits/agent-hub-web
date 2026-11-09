"use client";

import { Clock3, Pin } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { DailySessionAuthGate } from "@/components/chat/daily-session-auth-gate";
import { DailySessionHistory } from "@/components/chat/daily-session-history";
import { AppShell } from "@/components/shell/app-shell";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import type { AppMode } from "@/config/modes";
import { DailySessionAuthProvider } from "@/features/chat/session/daily-session-auth-provider";
import type { DailySessionClient } from "@/features/chat/transports/daily-session-client";
import type {
  ChatSessionSummary,
  ChatSessionTransport,
} from "@/features/chat/contracts/session";

interface HistoryLoadResult {
  source: ChatSessionTransport;
  status: "ready" | "error";
  sessions: ChatSessionSummary[];
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function HistoryPageClient({
  dailySessionClient,
  mode,
  sessionTransport,
}: {
  dailySessionClient?: DailySessionClient;
  mode: AppMode;
  sessionTransport?: ChatSessionTransport;
}) {
  const [loadResult, setLoadResult] = useState<HistoryLoadResult | null>(null);

  useEffect(() => {
    if (mode !== "work" || !sessionTransport) return;

    const abortController = new AbortController();
    void (async () => {
      try {
        const sessions = await sessionTransport.listSessions(
          abortController.signal,
        );
        if (abortController.signal.aborted) return;
        setLoadResult({
          source: sessionTransport,
          status: "ready",
          sessions: sortSessions(sessions),
        });
      } catch {
        if (abortController.signal.aborted) return;
        setLoadResult({
          source: sessionTransport,
          status: "error",
          sessions: [],
        });
      }
    })();

    return () => abortController.abort();
  }, [mode, sessionTransport]);

  const currentResult =
    mode === "work" && loadResult?.source === sessionTransport
      ? loadResult
      : null;

  return (
    <AppShell title="历史对话">
      <section className="resource-page">
        <header className="page-heading">
          <div>
            <h1>历史对话</h1>
            <p>
              {mode === "work"
                ? "查看并继续办公智能体会话"
                : "查看、创建并管理日常持久会话"}
            </p>
          </div>
        </header>
        {renderContent(
          mode,
          sessionTransport,
          currentResult,
          dailySessionClient,
        )}
      </section>
    </AppShell>
  );
}

function renderContent(
  mode: AppMode,
  sessionTransport: ChatSessionTransport | undefined,
  result: HistoryLoadResult | null,
  dailySessionClient: DailySessionClient | undefined,
) {
  if (mode === "daily") {
    if (!dailySessionClient) {
      return <ErrorState message="当前模式不支持历史会话" />;
    }
    return (
      <DailySessionAuthProvider client={dailySessionClient}>
        <DailySessionAuthGate>
          <DailySessionHistory client={dailySessionClient} />
        </DailySessionAuthGate>
      </DailySessionAuthProvider>
    );
  }
  if (!sessionTransport) {
    return <ErrorState message="当前模式不支持历史会话" />;
  }
  if (!result) {
    return <LoadingState label="正在加载办公历史…" />;
  }
  if (result.status === "error") {
    return <ErrorState message="历史会话加载失败，请稍后重试" />;
  }
  if (result.sessions.length === 0) {
    return (
      <EmptyState
        description="开始一次办公对话后，会话将显示在这里"
        title="暂无办公历史会话"
      />
    );
  }
  return (
    <ul aria-label="办公历史会话" className="history-list">
      {result.sessions.map((session) => (
        <li key={session.id}>
          <Link
            className="history-item"
            href={`/chat?mode=work&conversation=${encodeURIComponent(session.id)}`}
          >
            <Clock3 aria-hidden="true" size={17} />
            <span className="history-item-copy">
              <strong>{session.title}</strong>
              {session.isPinned ? (
                <span className="history-pin">
                  <Pin aria-hidden="true" size={11} />
                  置顶
                </span>
              ) : null}
            </span>
            <time dateTime={new Date(session.updatedAt).toISOString()}>
              {dateFormatter.format(session.updatedAt)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function sortSessions(sessions: ChatSessionSummary[]): ChatSessionSummary[] {
  return [...sessions].sort(
    (left, right) =>
      Number(right.isPinned) - Number(left.isPinned) ||
      right.updatedAt - left.updatedAt ||
      left.id.localeCompare(right.id),
  );
}
