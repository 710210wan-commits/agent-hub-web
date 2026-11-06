import { proxyWorkAgentRequest } from "@/server/xiaozhi/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WorkAgentRouteContext {
  params: Promise<{ path: string[] }>;
}

async function handle(
  request: Request,
  context: WorkAgentRouteContext,
): Promise<Response> {
  const { path } = await context.params;
  return proxyWorkAgentRequest(request, path);
}

export { handle as DELETE, handle as GET, handle as POST, handle as PUT };
