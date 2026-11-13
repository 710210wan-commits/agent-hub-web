"use client";

import { ArrowUp, Paperclip, Square } from "lucide-react";

import type { ChatSelectionSnapshot } from "@/features/chat/contracts/chat";
import type { AppMode } from "@/config/modes";
import type { ChatRunState } from "@/features/chat/reducer/chat-state";

import { CapabilitySelector } from "./capability-selector";
import type { ConversationCapabilityCatalog } from "@/features/chat/capabilities/contracts";

function isRunning(status: ChatRunState) {
  return status === "submitting" || status === "working" || status === "streaming";
}

export function Composer({
  input,
  mode,
  selection,
  status,
  onChange,
  onSelectionChange,
  onSend,
  onStop,
  capabilityMode,
  capabilityCatalog,
  capabilityNotice,
}: {
  input: string;
  mode: AppMode;
  selection: ChatSelectionSnapshot;
  status: ChatRunState;
  onChange: (value: string) => void;
  onSelectionChange: (selection: ChatSelectionSnapshot) => void;
  onSend: () => void;
  onStop: () => void;
  capabilityMode?: "selectable" | "preconfigured" | "unavailable";
  capabilityCatalog?: ConversationCapabilityCatalog;
  capabilityNotice?: string;
}) {
  const running = isRunning(status);
  const resolvedCapabilityMode =
    capabilityMode ?? (mode === "work" ? "preconfigured" : "unavailable");
  const capabilitiesDisabled = resolvedCapabilityMode !== "selectable";
  const sectionHint = (section?: { status: string; items: unknown[] }) => capabilitiesDisabled ? undefined
    : capabilityNotice ?? (!section ? "加载中…" : section.status === "disabled" ? "已禁用"
      : section.status !== "available" ? "暂不可用" : section.items.length === 0 ? "暂无可用项" : undefined);
  return (
    <div className="composer-dock">
      <div className="composer">
        <textarea
          aria-label="消息"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!running) onSend();
            }
          }}
          placeholder="输入消息…"
          rows={2}
          value={input}
        />
        <div className="composer-tools">
          <button
            aria-label="附件（待接入）"
            className="composer-tool"
            disabled
            title="待接入"
            type="button"
          >
            <Paperclip aria-hidden="true" size={14} />
            附件
          </button>
          <CapabilitySelector
            disabled={capabilitiesDisabled || capabilityCatalog?.knowledgeBases.status !== "available" || !capabilityCatalog.knowledgeBases.items.length}
            statusText={sectionHint(capabilityCatalog?.knowledgeBases)}
            label="知识库"
            onChange={(knowledgeBaseIds) =>
              onSelectionChange({ ...selection, knowledgeBaseIds })
            }
            options={capabilityCatalog?.knowledgeBases.items.map(item => ({ id: item.id, label: item.name })) ?? []}
            selectedIds={selection.knowledgeBaseIds}
          />
          <CapabilitySelector
            disabled={capabilitiesDisabled || capabilityCatalog?.skills.status !== "available" || !capabilityCatalog.skills.items.length}
            statusText={sectionHint(capabilityCatalog?.skills)}
            label="Skill"
            onChange={(skillIds) => onSelectionChange({ ...selection, skillIds })}
            options={capabilityCatalog?.skills.items.map(item => ({ id: item.id, label: item.title })) ?? []}
            selectedIds={selection.skillIds}
          />
          <CapabilitySelector
            disabled
            statusText={capabilitiesDisabled ? undefined : "暂未接入"}
            label="MCP"
            onChange={(mcpServerIds) => onSelectionChange({ ...selection, mcpServerIds })}
            options={[]}
            selectedIds={selection.mcpServerIds}
          />
          {resolvedCapabilityMode === "preconfigured" ? (
            <span className="composer-capability-note">
              办公智能体已预配置知识库、Skill 与 MCP
            </span>
          ) : resolvedCapabilityMode === "unavailable" ? (
            <span className="composer-capability-note">
              当前持久会话暂未支持能力组合
            </span>
          ) : null}
          <button
            aria-label={running ? "停止" : "发送"}
            className="composer-send"
            disabled={!running && input.trim().length === 0}
            onClick={running ? onStop : onSend}
            type="button"
          >
            {running ? <Square aria-hidden="true" size={11} /> : <ArrowUp aria-hidden="true" size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
