import { ProgressPreview } from "@/components/gis/progress/progress-preview";
import { AppShell } from "@/components/shell/app-shell";

export default function GisProgressPreviewPage() {
  return (
    <AppShell
      title="GIS 进度方案预览"
      topbarControl={<span className="progress-preview-badge">只读预览</span>}
    >
      <ProgressPreview />
    </AppShell>
  );
}
