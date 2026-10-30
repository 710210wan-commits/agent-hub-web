"use client";

import { useEffect, useState } from "react";

import { ResourcePageTemplate } from "@/components/resources/resource-page-template";
import { ErrorState } from "@/components/states/error-state";
import { AppShell } from "@/components/shell/app-shell";

import { knowledgeFixtures } from "@/config/resource-fixtures";

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
  const [isDemo, setIsDemo] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("加载失败，请稍后重试");

  useEffect(() => {
    // 演示模式：URL 带 ?demo=1 时用本地演示数据渲染页面（不请求后端），
    // 用于在登录/后端依赖未就绪时预览最终 UI 效果。
    // 演示与真实取数走同一条异步流程，保证状态流转一致。
    let cancelled = false;
    const url = new URLSearchParams(window.location.search);
    const isDemoMode = url.has("demo");
    const load: Promise<KnowledgeListItem[]> = isDemoMode
      ? Promise.resolve(knowledgeFixtures.map((entry) => ({ ...entry })))
      : listKbDatabases().then((databases) => databases.map(toListItem));

    load
      .then((rows) => {
        if (cancelled) return;
        setIsDemo(isDemoMode);
        setItems(rows);
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
        description={isDemo ? "管理对话可选的知识来源（当前为演示数据）" : "管理对话可选的知识来源"}
        createLabel="新建知识库"
        detailBasePath="/knowledge"
        items={items}
        state={state}
        errorSlot={state === "error" ? <ErrorState message={errorMessage} /> : undefined}
      />
    </AppShell>
  );
}
