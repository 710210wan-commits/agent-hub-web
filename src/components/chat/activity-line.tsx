"use client";

import { useState } from "react";
import { Check, ChevronDown, Wrench, X } from "lucide-react";

import type { ChatRunView } from "@/features/chat/reducer/chat-state";

export function ActivityLine({ run }: { run: ChatRunView }) {
  const [expanded, setExpanded] = useState(false);

  if (run.status === "working" && run.activity) {
    return (
      <div className="activity-line" data-testid="activity-line">
        <span className="activity-dot" />
        <span>{run.activity}</span>
      </div>
    );
  }

  const hasToolActivity = run.hasToolActivity ?? (run.completedStepCount > 0);
  if (
    hasToolActivity &&
    ["streaming", "completed", "stopped", "disconnected"].includes(run.status)
  ) {
    return (
      <div className="execution-process">
        <button
          aria-expanded={expanded}
          className="completed-steps"
          onClick={() => setExpanded(value => !value)}
          type="button"
        >
          <span>{run.completedStepCount > 0
            ? `已完成 ${run.completedStepCount} 个工具步骤`
            : "查看执行过程"}</span>
          <ChevronDown aria-hidden="true" className="execution-process-chevron" size={14} />
        </button>
        {expanded ? (
          <div className="execution-process-detail">
            {run.selectedSkillNames?.length ? (
              <div className="execution-skill-detail">
                <span>本轮 Skill</span>
                {run.selectedSkillNames.map(name => <strong key={name}>{name}</strong>)}
              </div>
            ) : null}
            {run.toolSteps?.length ? (
              <ul className="execution-tool-list">
                {run.toolSteps.map(step => (
                  <li key={step.id}>
                    <Wrench aria-hidden="true" size={13} />
                    <span className="execution-tool-name">{displayToolName(step.name)}</span>
                    <span className={`execution-tool-status is-${step.status}`}>
                      {step.status === "running" ? null : step.status === "completed"
                        ? <Check aria-hidden="true" size={12} />
                        : <X aria-hidden="true" size={12} />}
                      {step.status === "running" ? "执行中" : step.status === "completed" ? "已完成" : "执行失败"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <span>工具执行已开始</span>}
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}

function displayToolName(name: string): string {
  return name.replace(/[_-]+/g, " ").trim();
}
