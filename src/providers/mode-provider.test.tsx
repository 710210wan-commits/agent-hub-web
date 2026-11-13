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
    expect(navigation.replace).toHaveBeenLastCalledWith("/skills?mode=1");

    navigation.pathname = "/skills";
    navigation.search = "mode=daily";
    view.rerender(<ModeProvider><ModeSwitch /></ModeProvider>);
    fireEvent.click(screen.getByRole("button", { name: "工作" }));

    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/skills/workspace-files?mode=2",
    );
  });

  it("opens the Work Skill home and restores a Daily-only subpage with its query state", () => {
    navigation.pathname = "/skills/creator";
    navigation.search = "mode=daily&draftId=draft-1";
    const view = renderModeSwitch();

    fireEvent.click(screen.getByRole("button", { name: "工作" }));
    expect(navigation.replace).toHaveBeenLastCalledWith("/skills?mode=2");

    navigation.pathname = "/skills";
    navigation.search = "mode=work";
    view.rerender(<ModeProvider><ModeSwitch /></ModeProvider>);
    fireEvent.click(screen.getByRole("button", { name: "决策" }));

    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/skills/creator?mode=1&draftId=draft-1",
    );
  });

  it("keeps the existing same-route behavior outside Skill pages", () => {
    navigation.pathname = "/chat";
    navigation.search = "mode=work&panel=open";
    renderModeSwitch();

    fireEvent.click(screen.getByRole("button", { name: "决策" }));

    expect(navigation.replace).toHaveBeenCalledWith("/chat?mode=1&panel=open");
  });
  it("normalizes a legacy deep link without dropping its query", () => {
    navigation.pathname = "/skills/creator";
    navigation.search = "mode=daily&draftId=draft-1";
    renderModeSwitch();
    expect(navigation.replace).toHaveBeenCalledWith("/skills/creator?mode=1&draftId=draft-1");
  });
  it("drops conversation and draft on an actual chat mode switch", () => {
    navigation.pathname = "/chat";
    navigation.search = "mode=2&conversation=work-thread&draft=old&panel=open";
    renderModeSwitch();
    expect(screen.getByRole("button", { name: "工作" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "决策" }));
    expect(navigation.replace).toHaveBeenLastCalledWith("/chat?mode=1&panel=open");
  });

});
