import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModeSwitch } from "@/components/shell/mode-switch";

import { ModeProvider } from "./mode-provider";

const navigation = vi.hoisted(() => ({
  pathname: "/skills/workspace-files",
  replace: vi.fn(),
  search: "mode=work",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

function renderModeSwitch() {
  return render(
    <ModeProvider>
      <ModeSwitch />
    </ModeProvider>,
  );
}

describe("ModeProvider Skill route memory", () => {
  beforeEach(() => {
    navigation.pathname = "/skills/workspace-files";
    navigation.search = "mode=work";
    navigation.replace.mockClear();
    window.sessionStorage.clear();
  });

  it("opens the Daily Skill home and restores the previous Work detail route", () => {
    const view = renderModeSwitch();

    fireEvent.click(screen.getByRole("button", { name: "决策" }));
    expect(navigation.replace).toHaveBeenLastCalledWith("/skills?mode=daily");

    navigation.pathname = "/skills";
    navigation.search = "mode=daily";
    view.rerender(<ModeProvider><ModeSwitch /></ModeProvider>);
    fireEvent.click(screen.getByRole("button", { name: "工作" }));

    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/skills/workspace-files?mode=work",
    );
  });

  it("opens the Work Skill home and restores a Daily-only subpage with its query state", () => {
    navigation.pathname = "/skills/creator";
    navigation.search = "mode=daily&draftId=draft-1";
    const view = renderModeSwitch();

    fireEvent.click(screen.getByRole("button", { name: "工作" }));
    expect(navigation.replace).toHaveBeenLastCalledWith("/skills?mode=work");

    navigation.pathname = "/skills";
    navigation.search = "mode=work";
    view.rerender(<ModeProvider><ModeSwitch /></ModeProvider>);
    fireEvent.click(screen.getByRole("button", { name: "决策" }));

    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/skills/creator?mode=daily&draftId=draft-1",
    );
  });

  it("keeps the existing same-route behavior outside Skill pages", () => {
    navigation.pathname = "/chat";
    navigation.search = "mode=work&panel=open";
    renderModeSwitch();

    fireEvent.click(screen.getByRole("button", { name: "决策" }));

    expect(navigation.replace).toHaveBeenCalledWith("/chat?mode=daily&panel=open");
  });
});
