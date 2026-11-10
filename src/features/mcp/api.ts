export async function requestMcp<T>(path:string, init?:RequestInit, fetcher:typeof fetch=fetch):Promise<T>{
 let response:Response;
 try{response=await fetcher(`/mcp-api/api/mcp/v1${path}`,{...init,headers:{'Content-Type':'application/json',...init?.headers},cache:'no-store'});}
 catch{throw new Error('无法连接 MCP 管理后端，请检查后端启动状态和代理配置');}
 let body;
 try{body=await response.json();}catch{throw new Error('MCP 接口不可用，请检查 MCP_API_ORIGIN 配置');}
 if(!response.ok||!body.ok)throw new Error(`${body.error?.message??'请求失败'}${body.requestId?`（${body.requestId}）`:''}`);
 return body.data as T;
}
