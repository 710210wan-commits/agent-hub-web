import type { AgentApiRewrite } from './proxy';
export function resolveMcpRewrites(env:Readonly<Record<string,string|undefined>>):AgentApiRewrite[]{
 const value=env.MCP_API_ORIGIN?.trim();if(!value)return [];
 const origin=new URL(value);
 if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('MCP_API_ORIGIN 必须是 http(s) origin');
 return [{source:'/mcp-api/:path*',destination:`${origin.origin}/:path*`}];
}
