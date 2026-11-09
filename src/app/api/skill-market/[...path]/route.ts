import { proxySkillMarketRequest } from "@/features/skills/api/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SkillMarketRouteContext {
  params: Promise<{ path: string[] }>;
}

async function handle(request: Request, context: SkillMarketRouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxySkillMarketRequest(request, path);
}

export { handle as DELETE, handle as GET, handle as POST, handle as PUT };
