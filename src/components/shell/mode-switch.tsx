"use client";

import { copy } from "@/config/copy";
import type { AppMode } from "@/config/modes";
import { useAppMode } from "@/providers/mode-provider";

const options: Array<{ value: AppMode; label: string }> = [
  { value: "daily", label: copy.mode.daily },
  { value: "work", label: copy.mode.work },
];

export function ModeSwitch() {
  const { mode, setMode } = useAppMode();

  return (
    <div className="mode-switch" aria-label="使用模式">
      {options.map((option) => (
        <button
          aria-pressed={mode === option.value}
          className={mode === option.value ? "is-active" : undefined}
          key={option.value}
          onClick={() => setMode(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
