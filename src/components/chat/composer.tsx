"use client";

import { ArrowUp, Paperclip, Square } from "lucide-react";

import type { ChatSelectionSnapshot } from "@/features/chat/contracts/chat";
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
  selection,
  status,
  onChange,
  onSelectionChange,
  onSend,
  onStop,
}: {
  input: string;
  selection: ChatSelectionSnapshot;
  status: ChatRunState;
  onChange: (value: string) => void;
  onSelectionChange: (selection: ChatSelectionSnapshot) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  const running = isRunning(status);
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
            label="知识库"
            onChange={(knowledgeBaseIds) =>
              onSelectionChange({ ...selection, knowledgeBaseIds })
            }
            options={knowledgeOptions}
            selectedIds={selection.knowledgeBaseIds}
          />
          <CapabilitySelector
            label="Skill"
            onChange={(skillIds) => onSelectionChange({ ...selection, skillIds })}
            options={skillOptions}
            selectedIds={selection.skillIds}
          />
          <CapabilitySelector
            label="MCP"
            onChange={(mcpIds) => onSelectionChange({ ...selection, mcpIds })}
            options={mcpOptions}
            selectedIds={selection.mcpIds}
          />
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
