import { AppShell } from "@/components/shell/app-shell";

export function OfficeLoopUnavailable() {
  return (
    <AppShell title="新对话">
      <section className="state-card empty-state">
        <h1>办公场景暂未接入</h1>
        <p>办公场景将使用独立 Loop，当前不会调用日常场景服务。</p>
      </section>
    </AppShell>
  );
}
