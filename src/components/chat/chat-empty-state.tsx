import type { AppMode } from "@/config/modes";

const content = {
  daily: {
    greeting: "今天想聊些什么？",
    prompts: ["帮我整理今天的重点", "解释一个复杂概念", "为周末制定计划"],
  },
  work: {
    greeting: "今天要处理什么工作？",
    prompts: ["总结项目进展", "分析本周风险", "起草一份工作报告"],
  },
} as const;

export function ChatEmptyState({
  mode,
  onSelectPrompt,
}: {
  mode: AppMode;
  onSelectPrompt: (prompt: string) => void;
}) {
  const selected = content[mode];
  return (
    <section className="chat-empty-state">
      <h1>{selected.greeting}</h1>
      <div className="example-prompts">
        {selected.prompts.map((prompt) => (
          <button
            data-testid="example-prompt"
            key={prompt}
            onClick={() => onSelectPrompt(prompt)}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>
    </section>
  );
}
