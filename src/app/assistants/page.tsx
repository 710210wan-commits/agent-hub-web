import { AppShell } from "@/components/shell/app-shell";
import { AssistantPlaza } from "@/features/assistants/components/assistant-plaza";

export default function AssistantsPage() {
  return (
    <AppShell title="助手广场">
      <AssistantPlaza />
    </AppShell>
  );
}
