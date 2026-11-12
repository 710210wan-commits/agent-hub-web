import { AppShell } from "@/components/shell/app-shell";
import { SkillCreator } from "@/features/skills/creator/skill-creator";

export default async function SkillCreatorPage({
  searchParams,
}: {
  searchParams: Promise<{ draftId?: string }>;
}) {
  const { draftId } = await searchParams;
  return <AppShell title="Skill Creator"><SkillCreator draftId={draftId} /></AppShell>;
}
