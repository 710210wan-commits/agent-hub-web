import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ConversationCapabilityCatalog } from "@/features/chat/capabilities/contracts";
import { createEmptySelection } from "@/features/chat/reducer/chat-state";
import { Composer } from "./composer";

const catalog: ConversationCapabilityCatalog = {
  schemaVersion: 1, scenarioId: "daily",
  knowledgeBases: { status: "available", items: [] },
  skills: { status: "available", items: [] },
  mcpServers: { status: "available", items: [
    { id: "server-a", name: "船舶查询", description: "" },
    { id: "server-b", name: "飞机查询", description: "" },
  ] },
};

function SelectableComposer({ current = catalog, mode = "daily" }: {
  current?: ConversationCapabilityCatalog; mode?: "daily" | "work";
}) {
  const [selection, setSelection] = useState(createEmptySelection);
  return <Composer input="" mode={mode} selection={selection} status="idle"
    onChange={vi.fn()} onSelectionChange={setSelection} onSend={vi.fn()} onStop={vi.fn()}
    capabilityMode={mode === "daily" ? "selectable" : "preconfigured"} capabilityCatalog={current} />;
}

describe("Daily MCP composer", () => {
  it("multi-selects only catalog server IDs and supports deselection", () => {
    render(<SelectableComposer />);
    const trigger = screen.getByRole("button", { name: "MCP" });
    expect(trigger).toBeEnabled();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("checkbox", { name: "船舶查询" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "飞机查询" }));
    expect(screen.getByRole("button", { name: "MCP · 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "船舶查询" }));
    expect(screen.getByRole("button", { name: "MCP · 1" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "飞机查询" })).toBeChecked();
    expect(screen.queryByText("Agent Loop")).not.toBeInTheDocument();
  });

  it.each([
    ["unavailable", "暂不可用"], ["disabled", "已禁用"], ["available", "暂无可用项"],
  ] as const)("disables MCP for %s with an empty catalog", (status, text) => {
    render(<SelectableComposer current={{ ...catalog, mcpServers: { status, items: [] } }} />);
    expect(screen.getByRole("button", { name: "MCP" })).toBeDisabled();
    expect(screen.getByText(`MCP：${text}`)).toBeInTheDocument();
  });

  it("does not enable stale items in an unavailable section", () => {
    render(<SelectableComposer current={{ ...catalog, mcpServers: { ...catalog.mcpServers, status: "unavailable" } }} />);
    expect(screen.getByRole("button", { name: "MCP" })).toBeDisabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("keeps Work preconfigured even with an available Daily catalog", () => {
    render(<SelectableComposer mode="work" />);
    expect(screen.getByRole("button", { name: "MCP" })).toBeDisabled();
    expect(screen.getByText("办公智能体已预配置知识库、Skill 与 MCP")).toBeInTheDocument();
  });
});
