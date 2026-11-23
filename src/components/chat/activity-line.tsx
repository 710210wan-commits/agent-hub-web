"use client";

import { useState } from "react";

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
          查看执行过程
        </button>
        {expanded ? (
          <div className="execution-process-detail">
            {run.completedStepCount > 0
              ? `已完成 ${run.completedStepCount} 个工具步骤`
              : "工具执行已开始"}
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}
