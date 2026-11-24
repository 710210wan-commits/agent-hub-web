"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const messageComponents: Components = {
  table({ node, ...props }) {
    void node;
    return (
      <div className="message-table-scroll" tabIndex={0}>
        <table {...props} />
      </div>
    );
  },
  pre({ children }) {
    const code = nodeText(children);
    return (
      <div className="message-code-block">
        <button
          aria-label="复制代码"
          className="message-copy-code"
          onClick={() => void copyText(code)}
          type="button"
        >
          复制代码
        </button>
        <pre>{children}</pre>
      </div>
    );
  },
};

export function MessageContent({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="message-markdown">
      <ReactMarkdown components={messageComponents} remarkPlugins={[remarkGfm]}>
        {normalizeChinesePunctuation(content)}
      </ReactMarkdown>
      {streaming ? (
        <>
          <span aria-hidden="true" className="streaming-cursor" data-testid="streaming-cursor" />
          <span className="sr-only" role="status">正在生成</span>
        </>
      ) : null}
    </div>
  );
}

const protectedMarkdownPattern = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|https?:\/\/[^\s)]+)/g;
const hanPattern = /[\p{Script=Han}]/u;

export function normalizeChinesePunctuation(content: string): string {
  return content
    .split(protectedMarkdownPattern)
    .map((part, index) => {
      if (index % 2 === 1 || !hanPattern.test(part)) return part;
      return part.replaceAll(",", "，")
        .replaceAll(";", "；")
        .replaceAll(":", "：")
        .replaceAll("?", "？")
        .replaceAll("!", "！");
    })
    .join("");
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return nodeText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

export async function copyText(value: string): Promise<void> {
  if (typeof navigator.clipboard?.writeText !== "function") return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Clipboard permission can be denied without affecting the answer itself.
  }
}
