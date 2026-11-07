import { AppShell } from "@/components/shell/app-shell";
import { SkillDraftEditor } from "@/features/skills/authoring/skill-draft-editor";

export default async function SkillDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell title="Skill 草稿"><SkillDraftEditor id={id} /></AppShell>;
}
