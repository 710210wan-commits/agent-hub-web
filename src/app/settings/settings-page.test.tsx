import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingsPageContent } from "./settings-page";

describe("SettingsPageContent", () => {
  it("shows only model, evaluation and API placeholders, defaulting to model", () => {
    render(<SettingsPageContent />);

    expect(screen.getByRole("tab", { name: "模型" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "模型设置" })).toBeInTheDocument();
    expect(screen.getByText("模型配置待接入")).toBeInTheDocument();
    expect(screen.queryByText(/Workflow/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "评测" }));
    expect(screen.getByRole("heading", { name: "评测设置" })).toBeInTheDocument();
    expect(screen.getByText("评测配置待接入")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "API" }));
    expect(screen.getByRole("heading", { name: "API 设置" })).toBeInTheDocument();
    expect(screen.getByText("API 配置待接入")).toBeInTheDocument();
  });
});
