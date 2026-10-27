import { ResourceDetailSlot } from "@/components/resources/resource-detail-slot";
import { AppShell } from "@/components/shell/app-shell";
import { mcpFixtures } from "@/config/resource-fixtures";

export default async function McpDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = mcpFixtures.find((entry) => entry.id === id);
  return <AppShell title="MCP 详情"><ResourceDetailSlot backHref="/mcp" backLabel="返回 MCP" title={item?.name ?? "MCP 详情"} /></AppShell>;
}
