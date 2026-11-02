import { GisProfileSwitch } from "@/components/gis/gis-profile-switch";
import { GisWorkspacePlaceholder } from "@/components/gis/gis-workspace-placeholder";
import { AppShell } from "@/components/shell/app-shell";

export default function GisPage() {
  return (
    <AppShell title="GIS 工作台" topbarControl={<GisProfileSwitch />}>
      <GisWorkspacePlaceholder />
    </AppShell>
  );
}
