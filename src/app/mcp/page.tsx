import { Suspense } from "react";
import { McpModeConsole } from "@/components/mcp/mcp-mode-console";
import { AppShell } from "@/components/shell/app-shell";

export default function McpPage() {
  return <AppShell title="MCP"><Suspense fallback={<p>加载 MCP 服务…</p>}><McpModeConsole /></Suspense></AppShell>;
}
