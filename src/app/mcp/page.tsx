import { ResourcePageTemplate } from "@/components/resources/resource-page-template";
import { AppShell } from "@/components/shell/app-shell";
import { mcpFixtures } from "@/config/resource-fixtures";

export default function McpPage() {
  return <AppShell title="MCP"><ResourcePageTemplate createLabel="接入 MCP" description="管理智能体可访问的外部服务" detailBasePath="/mcp" items={mcpFixtures} title="MCP" /></AppShell>;
}
