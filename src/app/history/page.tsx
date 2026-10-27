import { Clock3 } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { historyFixtures } from "@/config/resource-fixtures";

export default function HistoryPage() {
  return (
    <AppShell title="历史对话">
      <section className="resource-page">
        <header className="page-heading"><div><h1>历史对话</h1><p>首版使用演示数据；会话服务待接入</p></div></header>
        <div className="history-list">
          {historyFixtures.map((item) => (
            <article className="history-item" key={item.id}>
              <Clock3 aria-hidden="true" size={17} />
              <div><strong>{item.title}</strong><p>{item.summary}</p></div>
              <time>{item.time}</time>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
