import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModeProvider } from "@/providers/mode-provider";

import { ResourceDetailSlot } from "./resource-detail-slot";
import { ResourcePageTemplate } from "./resource-page-template";

vi.mock("next/navigation", () => ({
  usePathname: () => "/knowledge",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("mode=work"),
}));

const items = [
  { id: "policy", name: "政策规范库", description: "规范与制度资料" },
  { id: "project", name: "项目资料库", description: "项目交付资料" },
];

describe("ResourcePageTemplate", () => {
  it("provides a searchable, replaceable fixture list and preserves mode links", () => {
    render(
      <ModeProvider>
        <ResourcePageTemplate
          createLabel="新建知识库"
          description="管理对话可选的知识来源"
          detailBasePath="/knowledge"
          items={items}
          title="知识库"
        />
      </ModeProvider>,
    );

    expect(screen.getByRole("heading", { name: "知识库" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建知识库（待接入）" })).toBeDisabled();
    expect(screen.getByRole("link", { name: /政策规范库/ })).toHaveAttribute(
      "href",
      "/knowledge/policy?mode=work",
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索知识库" }), {
      target: { value: "不存在" },
    });
    expect(screen.getByText("没有匹配的内容")).toBeInTheDocument();
  });

  it("exposes a minimal detail extension slot with a mode-aware back link", () => {
    render(
      <ModeProvider>
        <ResourceDetailSlot backHref="/knowledge" title="政策规范库" />
      </ModeProvider>,
    );

    expect(screen.getByRole("link", { name: "返回知识库" })).toHaveAttribute(
      "href",
      "/knowledge?mode=work",
    );
    expect(screen.getByText("详情能力待接入")).toBeInTheDocument();
  });

  it("allows owners to replace loading, error and empty lifecycle slots", () => {
    const view = render(
      <ModeProvider>
        <ResourcePageTemplate
          createLabel="新建知识库"
          description="说明"
          detailBasePath="/knowledge"
          items={items}
          loadingSlot={<div>自定义加载</div>}
          state="loading"
          title="知识库"
        />
      </ModeProvider>,
    );
    expect(screen.getByText("自定义加载")).toBeInTheDocument();

    view.rerender(
      <ModeProvider>
        <ResourcePageTemplate
          createLabel="新建知识库"
          description="说明"
          detailBasePath="/knowledge"
          errorSlot={<div>自定义错误</div>}
          items={items}
          state="error"
          title="知识库"
        />
      </ModeProvider>,
    );
    expect(screen.getByText("自定义错误")).toBeInTheDocument();

    view.rerender(
      <ModeProvider>
        <ResourcePageTemplate
          createLabel="新建知识库"
          description="说明"
          detailBasePath="/knowledge"
          emptySlot={<div>自定义空状态</div>}
          items={[]}
          title="知识库"
        />
      </ModeProvider>,
    );
    expect(screen.getByText("自定义空状态")).toBeInTheDocument();
  });
});
