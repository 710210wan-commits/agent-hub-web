import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/providers/auth-provider";
import { ModeProvider } from "@/providers/mode-provider";

import GisPage from "./page";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/gis",
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams("mode=work"),
}));

describe("GisPage", () => {
  beforeEach(() => replace.mockClear());

  it("uses standard/demo profiles instead of daily/work chat modes", () => {
    render(
      <AuthProvider>
        <ModeProvider>
          <GisPage />
        </ModeProvider>
      </AuthProvider>,
    );

    expect(screen.getByRole("button", { name: "标准" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "演示" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.queryByRole("button", { name: "日常" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "办公" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "演示" }));
    expect(replace).toHaveBeenCalledWith("/gis?profile=demo");
  });
});
