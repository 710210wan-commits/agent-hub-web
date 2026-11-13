import { BookMarked } from "lucide-react";

const TINTS = ["violet", "cyan", "blue", "amber", "green", "rose"] as const;

export type SkillCardTint = (typeof TINTS)[number];

export function skillCardTint(name: string): SkillCardTint {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return TINTS[hash % TINTS.length];
}

export function SkillCardIcon({ name, size = 15 }: { name: string; size?: number }) {
  const tint = skillCardTint(name);
  return (
    <span className={`skill-card-icon work-card-icon skill-tint-${tint} work-tint-${tint}`}>
      <BookMarked aria-hidden="true" size={size} />
    </span>
  );
}
