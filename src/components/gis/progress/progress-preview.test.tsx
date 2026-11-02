import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ProgressPreview,
  ProgressPreviewContent,
} from "./progress-preview";

const navigation = vi.hoisted(() => ({
  query: "variant=a&fixture=stopped",
  replace: vi.fn(),
}));

const replace = navigation.replace;

vi.mock("next/navigation", () => ({
  usePathname: () => "/gis/progress-preview",
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

function renderedStageState() {
  return screen.getAllByTestId("progress-stage").map((element) => ({
    id: element.getAttribute("data-stage-id"),
    status: element.getAttribute("data-stage-status"),
  }));
}

describe("ProgressPreviewContent", () => {
  it.each(["a", "b", "c"] as const)(
    "renders the same failed fixture state through variant %s",
    (variant) => {
      render(<ProgressPreviewContent fixtureId="failed" variant={variant} />);

      expect(renderedStageState()).toEqual([
        { id: "detect", status: "completed" },
        { id: "satellite", status: "failed" },
        { id: "assessment", status: "pending" },
        { id: "report", status: "pending" },
      ]);
      expect(screen.getByTestId(`progress-variant-${variant}`)).toBeInTheDocument();
    },
  );

  it("keeps the three variants structurally distinct", () => {
    const { rerender } = render(
      <ProgressPreviewContent fixtureId="long-running" variant="a" />,
    );
    expect(screen.getByTestId("activity-line-layout")).toBeInTheDocument();
    expect(screen.getByText("正在综合卫星影像、气象条件与地面回传信息评估火势蔓延趋势")).toBeInTheDocument();

    rerender(<ProgressPreviewContent fixtureId="long-running" variant="b" />);
    expect(screen.getByTestId("expandable-timeline-layout")).toBeInTheDocument();

    rerender(<ProgressPreviewContent fixtureId="long-running" variant="c" />);
    expect(screen.getByTestId("stage-rail-layout")).toBeInTheDocument();
  });
});

describe("ProgressPreview", () => {
  beforeEach(() => {
    navigation.query = "variant=a&fixture=stopped";
    replace.mockClear();
  });

  it("uses the selected expandable timeline as the default variant", () => {
    navigation.query = "fixture=long-running";

    render(<ProgressPreview />);

    expect(screen.getByTestId("progress-variant-b")).toBeInTheDocument();
  });

  it("switches variants through a shareable URL while preserving the fixture", () => {
    render(<ProgressPreview />);

    fireEvent.click(screen.getByRole("button", { name: "下一个方案" }));
    expect(replace).toHaveBeenCalledWith(
      "/gis/progress-preview?variant=b&fixture=stopped",
    );
  });
});
