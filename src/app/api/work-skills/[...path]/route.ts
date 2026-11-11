import { proxyWorkSkillsRequest } from "@/server/xiaozhi/skills-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WorkSkillsRouteContext {
  params: Promise<{ path: string[] }>;
}

async function handle(
  request: Request,
  context: WorkSkillsRouteContext,
): Promise<Response> {
  const { path } = await context.params;
  return proxyWorkSkillsRequest(request, path);
}

export { handle as DELETE, handle as GET, handle as POST, handle as PUT };
