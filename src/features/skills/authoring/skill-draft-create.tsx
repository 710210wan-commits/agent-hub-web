"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { SkillMarketErrorState } from "@/features/skills/components/skill-market-error-state";
import { SkillBackLink } from "@/features/skills/components/skill-back-link";
import { SkillMarketWorkPlaceholder } from "@/features/skills/catalog/skill-catalog-plaza";
import { useAppMode } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { getBrowserSkillMarketClient } from "../api/browser-client";
import { draftMutationAdapter, type DraftMutationViewModel } from "../contracts/authoring-view-model";
import type { SkillMarketError } from "../contracts/error";
import { buildDirectoryFiles, fileToBase64, validateZipFile } from "./draft-files";

type Selection = { kind: "directory"; files: File[] } | { kind: "zip"; file: File };

export function SkillDraftCreate({ client }: { client?: SkillMarketClient }) {
  const { mode } = useAppMode();
  if (mode === "work") return <SkillMarketWorkPlaceholder />;
  return <SkillDraftCreateDaily client={client ?? getBrowserSkillMarketClient()} />;
}

function SkillDraftCreateDaily({ client }: { client: SkillMarketClient }) {
  const pendingRef = useRef(false);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const [name, setName] = useState("");
  const [selection, setSelection] = useState<Selection>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SkillMarketError>();
  const [validation, setValidation] = useState<string>();
  const [result, setResult] = useState<DraftMutationViewModel>();

  async function createDraft() {
    if (pendingRef.current) return;
    const normalizedName = name.trim();
    if (!normalizedName || !selection) {
      setValidation("请填写草稿名称并选择 ZIP 或目录。");
      return;
    }
    if (selection.kind === "zip") {
      const message = validateZipFile(selection.file);
      if (message) { setValidation(message); return; }
    } else if (selection.files.length === 0) {
      setValidation("所选目录中没有文件。");
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setError(undefined);
    setValidation(undefined);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const body = selection.kind === "zip"
        ? { name: normalizedName, zipBase64: await fileToBase64(selection.file) }
        : { files: await buildDirectoryFiles(selection.files), name: normalizedName };
      const response = await client.mutate(
        { body, mode: "daily", operation: "createDraft", signal: controller.signal },
        draftMutationAdapter,
      );
      if (response.ok) setResult(response.value);
      else setError(response.error);
    } catch {
      setValidation("无法读取所选文件，请重新选择。");
    } finally {
      pendingRef.current = false;
      setPending(false);
      controllerRef.current = undefined;
    }
  }

  return (
    <section className="resource-page skill-draft-page">
      <SkillBackLink href="/skills/mine?mode=daily">返回我的 Skill</SkillBackLink>
      <header className="page-heading"><div><h1>上传草稿</h1><p>后端校验结果是最终依据，前端仅做文件选择检查。</p></div></header>
      <div className="skill-draft-panel">
        <label>草稿名称<input maxLength={64} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>ZIP 文件<input accept=".zip,application/zip" type="file" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) setSelection({ file, kind: "zip" });
        }} /></label>
        <span className="skill-draft-or">或</span>
        <label>文件目录<input type="file" multiple {...{ webkitdirectory: "" }} onChange={(event) => {
          setSelection({ files: Array.from(event.target.files ?? []), kind: "directory" });
        }} /></label>
        {selection ? <p>已选择：{selection.kind === "zip" ? selection.file.name : `${selection.files.length} 个文件`}</p> : null}
        {validation ? <p className="skill-draft-validation" role="alert">{validation}</p> : null}
        {error ? <SkillMarketErrorState error={error} onRecover={() => void createDraft()} /> : null}
        {result ? (
          <div className="skill-draft-success" role="status">
            <strong>草稿已创建</strong>
            <Link href={`/skills/drafts/${encodeURIComponent(result.draft.id)}?mode=daily`}>打开草稿</Link>
          </div>
        ) : null}
        {result?.diagnostics.length ? <Diagnostics diagnostics={result.diagnostics} /> : null}
        <div className="skill-draft-actions">
          <button disabled={pending || Boolean(result)} type="button" onClick={() => void createDraft()}>{pending ? "正在上传…" : "创建草稿"}</button>
          {pending ? <button type="button" onClick={() => controllerRef.current?.abort()}>取消</button> : null}
        </div>
      </div>
    </section>
  );
}

function Diagnostics({ diagnostics }: { diagnostics: { code: string; message: string; severity: string }[] }) {
  return <ul aria-label="校验结果">{diagnostics.map((item, index) => <li key={`${item.code}-${index}`}>{item.severity}：{item.message}</li>)}</ul>;
}
