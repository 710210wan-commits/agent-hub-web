"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { InlineError } from "@/components/states/inline-error";

import type { RemoteSearchResult, WorkSkillInstallDraft } from "./contracts";
import type { WorkSkillsApi } from "./work-api";

const HISTORY_STORAGE_KEY = "xiaozhi_remote_repo_history";
const HISTORY_MAX = 10;

type RemoteTab = "repo" | "search";

export interface RemoteInstallDialogProps {
  api: WorkSkillsApi;
  initialSource?: string;
  onClose(): void;
  onDraftsPrepared(drafts: WorkSkillInstallDraft[]): void;
}

interface RepoOption {
  description: string;
  name: string;
}

function readHistory(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(HISTORY_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeHistory(history: string[]): void {
  try {
    globalThis.localStorage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage 不可用时静默降级，历史仅辅助功能。
  }
}

/** 远程安装弹窗：按仓库拉取 / 全局搜索发现两页签；取消在左、解析并确认在右。 */
export function RemoteInstallDialog({
  api,
  initialSource,
  onClose,
  onDraftsPrepared,
}: RemoteInstallDialogProps) {
  const [tab, setTab] = useState<RemoteTab>("repo");
  const [source, setSource] = useState(initialSource ?? "https://github.com/anthropics/skills");
  const [history, setHistory] = useState<string[]>(readHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement | null>(null);

  const [listing, setListing] = useState(false);
  const [repoOptions, setRepoOptions] = useState<RepoOption[] | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string[]>([]);
  const [filterKeyword, setFilterKeyword] = useState("");

  const [searching, setSearching] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searched, setSearched] = useState<RemoteSearchResult[] | null>(null);
  const [selectedSearch, setSelectedSearch] = useState<RemoteSearchResult[]>([]);

  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!historyOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [historyOpen]);

  const filteredRepoOptions = useMemo(() => {
    if (!repoOptions) return [];
    const keyword = filterKeyword.trim().toLowerCase();
    if (!keyword) return repoOptions;
    return repoOptions.filter(
      (option) =>
        option.name.toLowerCase().includes(keyword) ||
        option.description.toLowerCase().includes(keyword),
    );
  }, [filterKeyword, repoOptions]);

  const selectedCount = tab === "repo" ? selectedRepo.length : selectedSearch.length;

  function rememberSource(value: string) {
    const next = [value, ...history.filter((item) => item !== value)].slice(0, HISTORY_MAX);
    setHistory(next);
    writeHistory(next);
  }

  function switchTab(next: RemoteTab) {
    setTab(next);
    setSelectedRepo([]);
    setSelectedSearch([]);
    setError(null);
  }

  async function handleListRepo() {
    const value = source.trim();
    if (!value) {
      setError("请输入来源仓库");
      return;
    }
    setListing(true);
    setError(null);
    try {
      const options = await api.listRemoteSkills(value);
      setRepoOptions(options);
      setSelectedRepo(options.length === 1 ? [options[0].name] : []);
      rememberSource(value);
    } catch (cause) {
      setRepoOptions(null);
      setError(cause instanceof Error ? cause.message : "获取远程 Skills 失败");
    } finally {
      setListing(false);
    }
  }

  async function handleSearch() {
    const query = searchKeyword.trim();
    if (!query) {
      setError("请输入搜索关键字");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const results = await api.searchRemoteSkills(query);
      setSearched(results);
      setSelectedSearch(results.length === 1 ? [...results] : []);
    } catch (cause) {
      setSearched(null);
      setError(cause instanceof Error ? cause.message : "搜索远程 Skills 失败");
    } finally {
      setSearching(false);
    }
  }

  function toggleRepo(name: string, checked: boolean) {
    setSelectedRepo((current) =>
      checked ? [...new Set([...current, name])] : current.filter((item) => item !== name),
    );
  }

  function toggleSearch(item: RemoteSearchResult, checked: boolean) {
    setSelectedSearch((current) => {
      const exists = current.some((entry) => entry.name === item.name && entry.source === item.source);
      if (checked) return exists ? current : [...current, item];
      return current.filter((entry) => !(entry.name === item.name && entry.source === item.source));
    });
  }

  async function handlePrepare() {
    setPreparing(true);
    setError(null);
    try {
      const drafts: WorkSkillInstallDraft[] = [];
      if (tab === "repo") {
        drafts.push(await api.prepareRemoteSkills(source.trim(), [...selectedRepo]));
      } else {
        const groups = new Map<string, string[]>();
        for (const item of selectedSearch) {
          const list = groups.get(item.source) ?? [];
          list.push(item.name);
          groups.set(item.source, list);
        }
        for (const [groupSource, names] of groups) {
          drafts.push(await api.prepareRemoteSkills(groupSource, names));
        }
      }
      onDraftsPrepared(drafts);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "解析远程 Skill 失败");
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="work-overlay">
      <button aria-label="关闭远程安装" className="work-overlay-backdrop" onClick={preparing ? undefined : onClose} type="button" />
      <section aria-modal="true" className="work-modal work-remote-dialog" role="dialog">
        <header className="work-modal-heading">
          <h2>远程安装 Skill</h2>
          <button aria-label="关闭" className="work-icon-button" disabled={preparing} onClick={onClose} type="button">
            ×
          </button>
        </header>

        <div className="work-tabs" role="tablist">
          <button aria-selected={tab === "repo"} className={tab === "repo" ? "is-active" : ""} onClick={() => switchTab("repo")} role="tab" type="button">
            按仓库拉取
          </button>
          <button aria-selected={tab === "search"} className={tab === "search" ? "is-active" : ""} onClick={() => switchTab("search")} role="tab" type="button">
            全局搜索发现
          </button>
        </div>

        {tab === "repo" ? (
          <div className="work-remote-panel">
            <div className="work-input-row">
              <div className="work-history-input" ref={historyRef}>
                <input
                  aria-label="来源仓库"
                  disabled={preparing}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="来源仓库，如 anthropics/skills 或 GitHub URL"
                  value={source}
                />
                <button
                  aria-label="历史仓库"
                  className="work-history-trigger"
                  disabled={preparing}
                  onClick={() => setHistoryOpen((open) => !open)}
                  type="button"
                >
                  ◷
                </button>
                {historyOpen ? (
                  <div className="work-history-menu">
                    {history.length === 0 ? <p className="work-history-empty">暂无使用历史</p> : null}
                    {history.map((item) => (
                      <button
                        key={item}
                        onClick={() => {
                          setSource(item);
                          setHistoryOpen(false);
                        }}
                        type="button"
                      >
                        {item}
                      </button>
                    ))}
                    {history.length > 0 ? (
                      <button
                        className="work-danger-text"
                        onClick={() => {
                          setHistory([]);
                          writeHistory([]);
                          setHistoryOpen(false);
                        }}
                        type="button"
                      >
                        清空历史记录
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button className="work-button work-button-primary" disabled={preparing || listing} onClick={() => void handleListRepo()} type="button">
                {listing ? "拉取中…" : "拉取技能"}
              </button>
            </div>
            <p className="work-hint">支持 owner/repo、GitHub URL 或 ModelScope 单个 Skill 地址。可前往 skills.sh 查询开源 skills。</p>

            {repoOptions && repoOptions.length > 1 ? (
              <>
                <div className="work-list-operations">
                  <div>
                    <button className="work-link-button" onClick={() => setSelectedRepo(filteredRepoOptions.map((option) => option.name))} type="button">
                      全选
                    </button>
                    <button
                      className="work-link-button"
                      onClick={() =>
                        setSelectedRepo((current) =>
                          filteredRepoOptions.map((option) => option.name).filter((name) => !current.includes(name)),
                        )
                      }
                      type="button"
                    >
                      反选
                    </button>
                    <button className="work-link-button" onClick={() => setSelectedRepo([])} type="button">
                      清空
                    </button>
                  </div>
                  <input
                    aria-label="本地过滤检索"
                    className="work-mini-filter"
                    onChange={(event) => setFilterKeyword(event.target.value)}
                    placeholder="本地过滤检索..."
                    value={filterKeyword}
                  />
                </div>
                <div className="work-remote-list">
                  {filteredRepoOptions.map((option) => (
                    <label key={option.name}>
                      <input
                        checked={selectedRepo.includes(option.name)}
                        disabled={preparing}
                        onChange={(event) => toggleRepo(option.name, event.target.checked)}
                        type="checkbox"
                      />
                      <span>
                        <strong>{option.name}</strong>
                        <small>{option.description || "暂无描述"}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            ) : null}
            {repoOptions?.length === 1 ? (
              <div className="work-remote-list">
                <div className="work-single-remote" data-selected="true">
                  <strong>{repoOptions[0].name}</strong>
                  <small>{repoOptions[0].description || "暂无描述"}</small>
                </div>
              </div>
            ) : null}
            {repoOptions ? (
              <p className="work-summary">已选 {selectedRepo.length} / 共发现 {repoOptions.length} 个 skills。</p>
            ) : null}
          </div>
        ) : (
          <div className="work-remote-panel">
            <div className="work-input-row">
              <input
                aria-label="搜索关键字"
                disabled={preparing}
                onChange={(event) => setSearchKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleSearch();
                }}
                placeholder="输入 web、python 等关键字进行全局查找"
                value={searchKeyword}
              />
              <button className="work-button work-button-primary" disabled={preparing || searching} onClick={() => void handleSearch()} type="button">
                {searching ? "查找中…" : "查找技能"}
              </button>
            </div>
            <p className="work-hint">直接输入关键字检索 skills.sh 上的开源 Skills 并批量拉取安装。</p>

            {searched && searched.length > 1 ? (
              <div className="work-list-operations">
                <div>
                  <button className="work-link-button" onClick={() => setSelectedSearch([...searched])} type="button">
                    全选
                  </button>
                  <button
                    className="work-link-button"
                    onClick={() =>
                      setSelectedSearch((current) =>
                        searched.filter((item) => !current.some((entry) => entry.name === item.name && entry.source === item.source)),
                      )
                    }
                    type="button"
                  >
                    反选
                  </button>
                  <button className="work-link-button" onClick={() => setSelectedSearch([])} type="button">
                    清空
                  </button>
                </div>
              </div>
            ) : null}
            {searched ? (
              <div className="work-remote-list">
                {searched.map((item) => (
                  <label key={`${item.source}:${item.name}`}>
                    <input
                      checked={selectedSearch.some((entry) => entry.name === item.name && entry.source === item.source)}
                      disabled={preparing}
                      onChange={(event) => toggleSearch(item, event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.source}</small>
                    </span>
                    {item.installs ? <em>{item.installs}</em> : null}
                  </label>
                ))}
              </div>
            ) : null}
            {searched ? (
              <p className="work-summary">已选择 {selectedSearch.length} / 共找到 {searched.length} 个 skills。</p>
            ) : null}
          </div>
        )}

        {error ? <InlineError message={error} /> : null}

        <footer className="work-modal-footer">
          <button className="work-button" disabled={preparing} onClick={onClose} type="button">
            取消
          </button>
          <button
            className="work-button work-button-primary"
            disabled={preparing || selectedCount === 0}
            onClick={() => void handlePrepare()}
            type="button"
          >
            {preparing ? "解析中…" : `解析并确认 (已选 ${selectedCount} 个)`}
          </button>
        </footer>
      </section>
    </div>
  );
}
