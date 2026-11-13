export class McpApiError extends Error {
 constructor(message:string,readonly status?:number,readonly code?:string){super(message);this.name='McpApiError';}
}
export async function requestMcp<T>(path:string,init?:RequestInit,fetcher:typeof fetch=fetch):Promise<T>{
 init?.signal?.throwIfAborted();let response:Response;
 try{response=await fetcher(`/agent-api/api/mcp/v1${path}`,{...init,credentials:'same-origin',headers:{'Content-Type':'application/json',...init?.headers},cache:'no-store'});}
 catch(error){init?.signal?.throwIfAborted();if(error instanceof DOMException&&error.name==='AbortError')throw error;throw new McpApiError('无法连接 MCP 服务，请稍后重试');}
 init?.signal?.throwIfAborted();
 let body;
 try{body=await response.json();}catch{throw new McpApiError('MCP 服务暂不可用',response.status);}
 init?.signal?.throwIfAborted();
 if(!response.ok||!body.ok)throw new McpApiError(response.status===401?'登录已过期，请重新登录':response.status===403?'权限不足，无法执行此 MCP 操作':`${body.error?.message??'MCP 请求失败'}${body.requestId?`（${body.requestId}）`:''}`,response.status,body.error?.code);
 return body.data as T;
}
