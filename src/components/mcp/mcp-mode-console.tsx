"use client";
import { McpConsole } from "./mcp-console";

/** MCP management uses one shared service pool; query mode only preserves navigation context. */
export function McpModeConsole() {
  return <McpConsole />;
}
