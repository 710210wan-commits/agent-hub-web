import { ResourceDetailSlot } from "@/components/resources/resource-detail-slot";
import { AppShell } from "@/components/shell/app-shell";
import { knowledgeFixtures } from "@/config/resource-fixtures";

export default async function KnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = knowledgeFixtures.find((entry) => entry.id === id);
  return <AppShell title="知识库详情"><ResourceDetailSlot backHref="/knowledge" title={item?.name ?? "知识库详情"} /></AppShell>;
}
