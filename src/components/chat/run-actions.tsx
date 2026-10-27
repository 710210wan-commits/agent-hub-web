import type { ChatRunView } from "@/features/chat/reducer/chat-state";

import { InlineError } from "@/components/states/inline-error";

export function RunActions({
  run,
  kind,
  onContinue,
  onRegenerate,
}: {
  run: ChatRunView;
  kind: "mock" | "projects-new";
  onContinue: () => void;
  onRegenerate: () => void;
}) {
  if (!run.notice) return null;
  const terminal = ["stopped", "disconnected", "failed"].includes(run.status);
  if (!terminal) return null;

  return (
    <div className="run-actions">
      <InlineError message={run.notice} />
      <div className="run-action-buttons">
        {kind === "mock" && run.status !== "failed" ? (
          <button className="primary-action" onClick={onContinue} type="button">
            继续生成
          </button>
        ) : null}
        <button onClick={onRegenerate} type="button">
          重新生成
        </button>
      </div>
    </div>
  );
}
