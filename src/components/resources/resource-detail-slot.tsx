"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { withMode } from "@/config/modes";
import { useAppMode } from "@/providers/mode-provider";

export function ResourceDetailSlot({ backHref, backLabel = "返回知识库", title, children }: { backHref: string; backLabel?: string; title: string; children?: ReactNode }) {
  const { mode } = useAppMode();
  return (
    <section className="resource-detail">
      <Link className="back-link" href={withMode(backHref, mode)}><ArrowLeft aria-hidden="true" size={15} />{backLabel}</Link>
      <div className="detail-panel">
        <span className="placeholder-label">扩展槽位</span>
        <h1>{title}</h1>
        {children ?? <p>详情能力待接入</p>}
      </div>
    </section>
  );
}
