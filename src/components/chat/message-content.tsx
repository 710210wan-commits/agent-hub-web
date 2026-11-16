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
};

export function MessageContent({ content }: { content: string }) {
  return (
    <div className="message-markdown">
      <ReactMarkdown components={messageComponents} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
