import {StrictMode} from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import {McpModeConsole} from './mcp-mode-console';
const auth=vi.hoisted(()=>({status:'authenticated',user:{id:'a'},identityGeneration:1,invalidate:vi.fn()}));
vi.mock('@/providers/auth-provider',()=>({useAuth:()=>auth}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();auth.status='authenticated';auth.identityGeneration=1;auth.user={id:'a'};auth.invalidate.mockReset();});
it.each(['anonymous','demo','checking'])('does not query protected MCP in %s',async status=>{auth.status=status;const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(<McpModeConsole/>);await Promise.resolve();expect(fetcher).not.toHaveBeenCalled();});
it.each([401,403,502])('only platform 401 invalidates global identity (%s)',async status=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({ok:false,error:{message:'服务错误'}}),{status})));render(<McpModeConsole/>);await screen.findByRole('alert');expect(auth.invalidate).toHaveBeenCalledTimes(status===401?1:0);
});
it('identity change clears editor/list and rejects late responses from prior identity',async()=>{
 let finish:(value:Response)=>void=()=>{};const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Response>(r=>{finish=r;})).mockResolvedValue(new Response(JSON.stringify({ok:true,data:{items:[]}})));vi.stubGlobal('fetch',fetcher);
 const view=render(<McpModeConsole/>);await waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());auth.user={id:'b'};auth.identityGeneration=2;view.rerender(<McpModeConsole/>);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));finish(new Response(JSON.stringify({ok:true,data:{items:[{id:'old',displayName:'旧用户服务',label:1,transport:'stdio',enabled:false,allowedTools:[],readOnlyTools:[]}]}})));
 await waitFor(()=>expect(screen.queryByText('旧用户服务')).not.toBeInTheDocument());
});

it('survives StrictMode effect cleanup/replay with a fresh request scope',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({ok:true,data:{items:[]}}))));render(<StrictMode><McpModeConsole/></StrictMode>);
 await screen.findByText('暂无匹配的服务');expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
