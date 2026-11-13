"use client";
import {useAuth} from '@/providers/auth-provider';
import {McpConsole} from './mcp-console';
/** One shared inventory; verified global identity is required before mounting requests. */
export function McpModeConsole(){
 const {status,user,identityGeneration,invalidate}=useAuth();
 if(status!=='authenticated')return <section role="status"><h1>登录后使用 MCP</h1><p>登录一次，全站通用。演示模式暂不访问 MCP 服务。</p><button onClick={invalidate}>去登录</button></section>;
 return <McpConsole key={`${user?.id}/${identityGeneration}`} onUnauthorized={invalidate}/>;
}
