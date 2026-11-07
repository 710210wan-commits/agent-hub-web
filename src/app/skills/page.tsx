"use client";

import { AppShell } from "@/components/shell/app-shell";
import { SkillCatalogPlaza } from "@/features/skills/catalog/skill-catalog-plaza";

export default function SkillsPage() {
  return (
    <AppShell title="Skill">
      <SkillCatalogPlaza />
    </AppShell>
  );
}
