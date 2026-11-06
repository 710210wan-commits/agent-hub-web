import { proxySkillMarketRequest } from "@/features/skills/api/gateway";
import { logSkillMarketAudit } from "@/features/skills/api/security-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SkillMarketRouteContext {
  params: Promise<{ path: string[] }>;
}

async function handle(request: Request, context: SkillMarketRouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxySkillMarketRequest(request, path, { audit: logSkillMarketAudit });
}

export { handle as DELETE, handle as GET, handle as POST, handle as PUT };
