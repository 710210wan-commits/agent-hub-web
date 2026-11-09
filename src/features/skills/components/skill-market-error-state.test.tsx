import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SkillMarketError } from "../contracts/error";
import { SkillMarketErrorState } from "./skill-market-error-state";

describe("SkillMarketErrorState", () => {
  it("renders a persistent validation state with located diagnostics", () => {
    const onRecover = vi.fn();
    const error = new SkillMarketError({
      area: "draft",
      code: "skill.validation_failed",
      diagnostics: [{
        code: "skill.name.required",
        field: "name",
        message: "名称不能为空",
        severity: "error",
      }],
      presentation: "validation",
      recovery: "edit",
      requestId: "request-422",
      retryable: false,
      status: 422,
      userMessage: "请修正标记的问题后重试。",
    });

    render(<SkillMarketErrorState error={error} onRecover={onRecover} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "请检查输入" })).toBeInTheDocument();
    expect(screen.getByText("名称不能为空")).toBeInTheDocument();
    expect(screen.getByText("区域：草稿")).toBeInTheDocument();
    expect(screen.getByText("位置：name")).toBeInTheDocument();
    expect(screen.getByText("排障 ID：request-422")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "修改内容" }));
    expect(onRecover).toHaveBeenCalledWith("edit");
  });

  it("uses a distinct retry action for gateway timeout", () => {
    const onRecover = vi.fn();
    const error = new SkillMarketError({
      code: "SKILL_MARKET_UPSTREAM_TIMEOUT",
      presentation: "timeout",
      recovery: "retry",
      retryable: true,
      status: 504,
      userMessage: "服务响应超时，请重试。",
    });

    render(<SkillMarketErrorState error={error} onRecover={onRecover} />);
    expect(screen.getByRole("heading", { name: "服务响应超时" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRecover).toHaveBeenCalledWith("retry");
  });
});
