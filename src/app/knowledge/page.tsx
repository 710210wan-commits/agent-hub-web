"use client";

import { useEffect, useState } from "react";

import { ResourcePageTemplate } from "@/components/resources/resource-page-template";
import { ErrorState } from "@/components/states/error-state";
import { AppShell } from "@/components/shell/app-shell";

import { kbErrorMessage, listKbDatabases, type KbDatabase } from "@/lib/kb-api";

interface KnowledgeListItem {
  id: string;
  name: string;
  description: string;
  meta?: string;
}

function toListItem(db: KbDatabase): KnowledgeListItem {
  return {
    id: db.kb_id,
    name: db.name,
    description: db.description,
    meta: db.supports_documents ? `文档库 · ${db.type}` : db.type,
  };
}

type PageState = "loading" | "error" | "ready";

export default function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeListItem[]>([]);
  const [state, setState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("加载失败，请稍后重试");

  useEffect(() => {
    let cancelled = false;
    listKbDatabases()
      .then((databases) => {
        if (cancelled) return;
        setItems(databases.map(toListItem));
        setState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(kbErrorMessage(error));
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell title="知识库">
      <ResourcePageTemplate
        title="知识库"
        description="管理对话可选的知识来源"
        createLabel="新建知识库"
        detailBasePath="/knowledge"
        items={items}
        state={state}
        errorSlot={state === "error" ? <ErrorState message={errorMessage} /> : undefined}
      />
    </AppShell>
  );
}
