import { AppShell } from "@/components/shell/app-shell";
import { SkillCatalogDetail } from "@/features/skills/catalog/skill-catalog-detail";

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell title="Skill 详情"><SkillCatalogDetail id={id} /></AppShell>;
}
