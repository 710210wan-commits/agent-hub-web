import { ResourceDetailSlot } from "@/components/resources/resource-detail-slot";
import { AppShell } from "@/components/shell/app-shell";
import { skillFixtures } from "@/config/resource-fixtures";

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = skillFixtures.find((entry) => entry.id === id);
  return <AppShell title="Skill 详情"><ResourceDetailSlot backHref="/skills" backLabel="返回 Skill" title={item?.name ?? "Skill 详情"} /></AppShell>;
}
