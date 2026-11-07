import { AppShell } from "@/components/shell/app-shell";
import { SkillPublicationList } from "@/features/skills/publication/skill-publication-list";

export default function SkillPublicationPage() {
  return <AppShell title="Skill 发布管理"><SkillPublicationList /></AppShell>;
}
