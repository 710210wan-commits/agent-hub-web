"use client";

import { Clock3, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { useDailySessionStore } from "@/features/chat/session/daily-session-store";
import { useDailySessionAuthBridge } from "@/features/chat/session/use-daily-session-auth-bridge";
import type { DailySessionClient } from "@/features/chat/transports/daily-session-client";
import type { ConversationMetadata } from "@/features/chat/transports/daily-session-contract";

import { DailySessionAuthNotice } from "./daily-session-auth-notice";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function DailySessionHistory({ client }: { client: DailySessionClient }) {
  const auth = useDailySessionAuthBridge();
  if (!auth.enabled) return <DailySessionAuthNotice />;

  return (
    <AuthenticatedDailySessionHistory
      client={client}
      identityGeneration={auth.identityGeneration}
      onAuthRequired={auth.onAuthRequired}
    />
  );
}

function AuthenticatedDailySessionHistory({
  client,
  identityGeneration,
  onAuthRequired,
}: {
  client: DailySessionClient;
  identityGeneration: number;
  onAuthRequired(): void;
}) {
  const store = useDailySessionStore(client, identityGeneration, {
    onAuthRequired,
  });
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const startRename = (conversation: ConversationMetadata) => {
    store.clearRenameError();
    setEditingId(conversation.conversationId);
    setDraftTitle(conversation.title);
  };

  const submitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId || !draftTitle.trim()) return;
    const outcome = await store.renameConversation(editingId, draftTitle);
    if (outcome !== "failed") {
      setEditingId(null);
      setDraftTitle("");
    }
  };

  return (
    <section className="daily-history">
      <div className="daily-history-toolbar">
        <button
          className="primary-button"
          onClick={() => router.push("/chat?mode=1")}
          type="button"
        >
          新对话
        </button>
      </div>

      {store.renameError || store.deleteError ? (
        <div className="inline-error daily-history-feedback" role="alert">
          {store.renameError || store.deleteError}
        </div>
      ) : null}

      {renderHistoryContent({
        store,
        editingId,
        draftTitle,
        setDraftTitle,
        startRename,
        submitRename,
        removeConversation: (conversation) => {
          if (window.confirm(`删除“${conversation.title || "未命名会话"}”？删除后无法继续查看此会话。`)) {
            void store.deleteConversation(conversation.conversationId);
          }
        },
        cancelRename: () => {
          setEditingId(null);
          setDraftTitle("");
        },
      })}
    </section>
  );
}

type Store = ReturnType<typeof useDailySessionStore>;

function renderHistoryContent(input: {
  store: Store;
  editingId: string | null;
  draftTitle: string;
  setDraftTitle(value: string): void;
  startRename(conversation: ConversationMetadata): void;
  submitRename(event: FormEvent<HTMLFormElement>): Promise<void>;
  cancelRename(): void;
  removeConversation(conversation: ConversationMetadata): void;
}) {
  const { store } = input;
  if (store.status === "loading") {
    return <LoadingState label="正在加载决策历史…" />;
  }
  if (store.status === "error") {
    return (
      <div className="daily-history-state">
        <ErrorState message={store.errorMessage ?? "决策历史加载失败，请稍后重试"} />
        <button className="secondary-button" onClick={() => void store.retry()} type="button">
          重试加载
        </button>
      </div>
    );
  }

  return (
    <>
      {store.conversations.length === 0 ? (
        <EmptyState
          description="首次发送消息后，会话将显示在这里"
          title="暂无决策历史会话"
        />
      ) : (
        <ul aria-label="决策历史会话" className="history-list">
          {store.conversations.map((conversation) => (
            <li className="daily-history-item" key={conversation.conversationId}>
              {input.editingId === conversation.conversationId ? (
                <form className="daily-history-rename" onSubmit={input.submitRename}>
                  <label>
                    <span className="sr-only">会话标题</span>
                    <input
                      aria-label="会话标题"
                      autoFocus
                      maxLength={200}
                      onChange={(event) => input.setDraftTitle(event.target.value)}
                      required
                      value={input.draftTitle}
                    />
                  </label>
                  <button
                    className="primary-button"
                    disabled={store.renamingId === conversation.conversationId}
                    type="submit"
                  >
                    保存
                  </button>
                  <button className="text-button" onClick={input.cancelRename} type="button">
                    取消
                  </button>
                </form>
              ) : (
                <>
                  <Link
                    className="history-item daily-history-link"
                    href={`/chat?mode=1&conversation=${encodeURIComponent(conversation.conversationId)}`}
                  >
                    <Clock3 aria-hidden="true" size={17} />
                    <span className="history-item-copy">
                      <strong>{conversation.title || "未命名会话"}</strong>
                    </span>
                    <time dateTime={conversation.updatedAt}>
                      {dateFormatter.format(new Date(conversation.updatedAt))}
                    </time>
                  </Link>
                  <button
                    aria-label={`重命名 ${conversation.title || "未命名会话"}`}
                    className="daily-history-rename-button"
                    disabled={Boolean(store.deletingId)}
                    onClick={() => input.startRename(conversation)}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={14} />
                  </button>
                  <button
                    aria-label={`删除 ${conversation.title || "未命名会话"}`}
                    className="daily-history-rename-button daily-history-delete-button"
                    disabled={Boolean(store.deletingId) || Boolean(store.renamingId)}
                    onClick={() => input.removeConversation(conversation)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {store.nextCursor ? (
        <div className="daily-history-load-more">
          {store.errorMessage ? (
            <div className="inline-error" role="alert">
              {store.errorMessage}
            </div>
          ) : null}
          <button
            className="secondary-button"
            disabled={store.isLoadingMore}
            onClick={() => void store.loadMore()}
            type="button"
          >
            {store.isLoadingMore ? "正在加载…" : "加载更多"}
          </button>
        </div>
      ) : null}
    </>
  );
}
