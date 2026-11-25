"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/providers/auth-provider";

import {
  isAssistantClientError,
  type AssistantClient,
  type UploadRole,
} from "../api/assistant-client";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_RESUMES = 20;
const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export interface UploadDraftItem {
  localId: string;
  file: File;
  role: UploadRole;
  status: "uploading" | "ready" | "failed" | "removing";
  fileId?: string;
  error?: string;
}

type DraftState =
  | { kind: "preparing" }
  | { kind: "ready"; draftId: string }
  | { kind: "error"; message: string };

export function useUploadDraft({
  assistantId,
  client,
  createRequestId,
  jobDescriptionText,
}: {
  assistantId: string;
  client: AssistantClient;
  createRequestId: () => string;
  jobDescriptionText?: string;
}) {
  const { identityGeneration, invalidate } = useAuth();
  const [draftAttempt, setDraftAttempt] = useState(0);
  const [draft, setDraft] = useState<DraftState>({ kind: "preparing" });
  const [items, setItems] = useState<UploadDraftItem[]>([]);
  const [validationError, setValidationError] = useState<string>();
  const draftRequestId = useRef(createRequestId());
  const controllers = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const controller = new AbortController();
    setDraft({ kind: "preparing" });
    setItems([]);
    setValidationError(undefined);
    client.createUploadDraft(assistantId, draftRequestId.current, controller.signal).then((result) => {
      if (!controller.signal.aborted) setDraft({ kind: "ready", draftId: result.draft.draftId });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (isAssistantClientError(error) && error.status === 401) {
        invalidate();
        return;
      }
      setDraft({ kind: "error", message: localMessage(error, "无法准备上传，请稍后重试。") });
    });
    return () => controller.abort();
  }, [assistantId, client, draftAttempt, identityGeneration, invalidate]);

  useEffect(() => () => {
    for (const controller of controllers.current.values()) controller.abort();
    controllers.current.clear();
  }, []);

  const uploadItem = useCallback(async (item: UploadDraftItem) => {
    if (draft.kind !== "ready") return;
    const controller = new AbortController();
    controllers.current.set(item.localId, controller);
    setItems((current) => current.map((value) => value.localId === item.localId
      ? { ...value, status: "uploading", error: undefined }
      : value));
    try {
      const uploaded = await client.uploadDraftFile(draft.draftId, item.role, item.file, controller.signal);
      if (controller.signal.aborted) return;
      setItems((current) => current.map((value) => value.localId === item.localId
        ? { ...value, status: "ready", fileId: uploaded.fileId, error: undefined }
        : value));
    } catch (error) {
      if (controller.signal.aborted) return;
      if (isAssistantClientError(error) && error.status === 401) {
        invalidate();
        return;
      }
      setItems((current) => current.map((value) => value.localId === item.localId
        ? { ...value, status: "failed", error: localMessage(error, "上传失败") }
        : value));
    } finally {
      controllers.current.delete(item.localId);
    }
  }, [client, draft, invalidate]);

  const addFiles = useCallback((role: UploadRole, selected: readonly File[]) => {
    setValidationError(undefined);
    if (draft.kind !== "ready") {
      setValidationError("上传尚未准备完成。");
      return;
    }
    if (selected.length === 0) return;
    const existing = items.filter((item) => item.role === role).length;
    const limit = role === "job_description" ? 1 : MAX_RESUMES;
    if (existing + selected.length > limit) {
      setValidationError(role === "job_description" ? "岗位描述只能上传 1 份。" : "最多上传 20 份简历。");
      return;
    }
    const invalid = selected.find((file) => !validFile(file));
    if (invalid) {
      setValidationError(`${invalid.name} 仅支持 10 MiB 内的 PDF 或 DOCX。`);
      return;
    }
    const next = selected.map<UploadDraftItem>((file) => ({
      localId: createRequestId(),
      file,
      role,
      status: "uploading",
    }));
    setItems((current) => [...current, ...next]);
    for (const item of next) void uploadItem(item);
  }, [createRequestId, draft, items, uploadItem]);

  const retryFile = useCallback((localId: string) => {
    const item = items.find((value) => value.localId === localId && value.status === "failed");
    if (item) void uploadItem(item);
  }, [items, uploadItem]);

  const removeFile = useCallback(async (localId: string) => {
    const item = items.find((value) => value.localId === localId);
    if (!item || draft.kind !== "ready") return;
    controllers.current.get(localId)?.abort();
    if (!item.fileId) {
      setItems((current) => current.filter((value) => value.localId !== localId));
      return;
    }
    const controller = new AbortController();
    controllers.current.set(localId, controller);
    setItems((current) => current.map((value) => value.localId === localId
      ? { ...value, status: "removing", error: undefined }
      : value));
    try {
      await client.removeDraftFile(draft.draftId, item.fileId, controller.signal);
      if (!controller.signal.aborted) {
        setItems((current) => current.filter((value) => value.localId !== localId));
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (isAssistantClientError(error) && error.status === 401) {
        invalidate();
        return;
      }
      setItems((current) => current.map((value) => value.localId === localId
        ? { ...value, status: "ready", error: localMessage(error, "移除失败") }
        : value));
    } finally {
      controllers.current.delete(localId);
    }
  }, [client, draft, invalidate, items]);

  const counts = useMemo(() => ({
    total: items.length,
    ready: items.filter((item) => item.status === "ready").length,
    resumes: items.filter((item) => item.role === "resume" && item.status === "ready").length,
    jobDescriptions: items.filter((item) => item.role === "job_description" && item.status === "ready").length,
  }), [items]);

  return {
    draft,
    draftId: draft.kind === "ready" ? draft.draftId : undefined,
    items,
    counts,
    validationError,
    canSubmit: draft.kind === "ready"
      && (jobDescriptionText !== undefined
        ? jobDescriptionText.length > 0 && counts.jobDescriptions === 0
        : counts.jobDescriptions === 1)
      && counts.resumes >= 1
      && counts.resumes <= MAX_RESUMES
      && counts.ready === counts.total,
    retryDraft: () => setDraftAttempt((value) => value + 1),
    addFiles,
    retryFile,
    removeFile,
  };
}

function validFile(file: File): boolean {
  const extension = file.name.toLocaleLowerCase().match(/\.(pdf|docx)$/)?.[1];
  return file.size > 0
    && file.size <= MAX_FILE_BYTES
    && (extension === "pdf" || extension === "docx")
    && ACCEPTED_TYPES.has(file.type);
}

function localMessage(error: unknown, fallback: string): string {
  if (isAssistantClientError(error) && error.status === 403) return "权限不足，无法执行此操作。";
  return fallback;
}
