import { AppShell } from "@/components/shell/app-shell";
import { SkillPublicationDetail } from "@/features/skills/publication/skill-publication-detail";

export default async function SkillPublicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell title="Publication 详情"><SkillPublicationDetail id={id} /></AppShell>;
}
