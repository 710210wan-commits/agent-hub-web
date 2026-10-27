import { GisWorkspacePlaceholder } from "@/components/gis/gis-workspace-placeholder";
import { AppShell } from "@/components/shell/app-shell";

export default function GisPage() {
  return <AppShell title="GIS 工作台"><GisWorkspacePlaceholder /></AppShell>;
}
