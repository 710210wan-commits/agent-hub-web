import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { CapabilitySelector } from "./capability-selector";

function SelectorFixture() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  return (
    <div>
      <button type="button">选择器外部</button>
      <CapabilitySelector
        label="Skill"
        onChange={setSelectedIds}
        options={[{ id: "caveman", label: "Token Caveman Test" }]}
        selectedIds={selectedIds}
      />
    </div>
  );
}

describe("CapabilitySelector dismissal", () => {
  it("closes when the user clicks anywhere outside the selector", () => {
    render(<SelectorFixture />);
    fireEvent.click(screen.getByRole("button", { name: "Skill" }));
    expect(screen.getByRole("checkbox", { name: "Token Caveman Test" })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "选择器外部" }));
    expect(screen.queryByRole("checkbox", { name: "Token Caveman Test" })).not.toBeInTheDocument();
  });

  it("keeps the menu open for option clicks and closes it with Escape", () => {
    const onChange = vi.fn();
    render(
      <CapabilitySelector
        label="MCP"
        onChange={onChange}
        options={[{ id: "search", label: "搜索工具" }]}
        selectedIds={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "MCP" }));
    const option = screen.getByRole("checkbox", { name: "搜索工具" });
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith(["search"]);
    expect(option).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("checkbox", { name: "搜索工具" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MCP" })).toHaveFocus();
  });
});
