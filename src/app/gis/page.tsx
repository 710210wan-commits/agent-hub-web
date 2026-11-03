"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { GisProfileSwitch } from "@/components/gis/gis-profile-switch";
import { GisWorkspacePlaceholder } from "@/components/gis/gis-workspace-placeholder";
import { AppShell } from "@/components/shell/app-shell";
import { readPublicRuntimeConfig } from "@/config/env";
import { parseGisProfile } from "@/config/gis-profiles";
import { createProjectsNewGisTransport } from "@/features/gis/transports/projects-new-gis-transport";

export default function GisPage() {
  const profile = parseGisProfile(useSearchParams().get("profile"));
  const transport = useMemo(() => {
    const config = readPublicRuntimeConfig();
    return createProjectsNewGisTransport({ apiBaseUrl: config.apiBaseUrl });
  }, []);

  return (
    <AppShell title="GIS 工作台" topbarControl={<GisProfileSwitch />}>
      <GisWorkspacePlaceholder profile={profile} transport={transport} />
    </AppShell>
  );
}
