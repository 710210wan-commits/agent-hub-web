"use client";

import { ArrowUp, Paperclip, Square } from "lucide-react";

import type { ChatSelectionSnapshot } from "@/features/chat/contracts/chat";
import type { AppMode } from "@/config/modes";
import type { ChatRunState } from "@/features/chat/reducer/chat-state";

import { CapabilitySelector } from "./capability-selector";

const knowledgeOptions = [
  { id: "project", label: "项目资料库" },
  { id: "policy", label: "政策规范库" },
  { id: "internal", label: "内部问答资料" },
];
const skillOptions = [
  { id: "risk", label: "风险分析" },
  { id: "report", label: "报告生成" },
];
const mcpOptions = [
  { id: "weather", label: "天气数据" },
  { id: "internal-data", label: "内部数据服务" },
];

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
}) {
  const running = isRunning(status);
  const resolvedCapabilityMode =
    capabilityMode ?? (mode === "work" ? "preconfigured" : "selectable");
  const capabilitiesDisabled = resolvedCapabilityMode !== "selectable";
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
            disabled={capabilitiesDisabled}
            label="知识库"
            onChange={(knowledgeBaseIds) =>
              onSelectionChange({ ...selection, knowledgeBaseIds })
            }
            options={knowledgeOptions}
            selectedIds={selection.knowledgeBaseIds}
          />
          <CapabilitySelector
            disabled={capabilitiesDisabled}
            label="Skill"
            onChange={(skillIds) => onSelectionChange({ ...selection, skillIds })}
            options={skillOptions}
            selectedIds={selection.skillIds}
          />
          <CapabilitySelector
            disabled={capabilitiesDisabled}
            label="MCP"
            onChange={(mcpIds) => onSelectionChange({ ...selection, mcpIds })}
            options={mcpOptions}
            selectedIds={selection.mcpIds}
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
