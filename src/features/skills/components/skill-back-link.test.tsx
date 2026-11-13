import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SkillBackLink } from "./skill-back-link";

describe("SkillBackLink", () => {
  it("renders the shared gray back link with the arrow prefix and target href", () => {
    render(<SkillBackLink href="/skills?mode=1">返回 Skill 广场</SkillBackLink>);

    const link = screen.getByRole("link", { name: "← 返回 Skill 广场" });
    expect(link).toHaveAttribute("href", "/skills?mode=1");
    expect(link).toHaveClass("back-link");
  });
});
