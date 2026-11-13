import {afterEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {McpConsole} from './mcp-console';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('MCP console',()=>{
 it('saves a market preset with numeric label then shows the persisted service',async()=>{
  let items:unknown[]=[];
  const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{
   if(init?.method==='POST'){const data={...JSON.parse(String(init.body)),id:'saved'};items=[data];return new Response(JSON.stringify({ok:true,data}));}
   return new Response(JSON.stringify({ok:true,data:{items}}));
  });
  vi.stubGlobal('fetch',fetcher);render(<McpConsole/>);
  await waitFor(()=>expect(fetcher).toHaveBeenCalled());
  fireEvent.click(screen.getAllByText('添加到我的服务')[0]);
  fireEvent.change(screen.getByLabelText('标签'),{target:{value:'2'}});
  fireEvent.click(screen.getByText('保存配置'));
  await screen.findByText('配置已保存；请测试连接以更新工具清单。');
  expect(items[0]).toMatchObject({label:2,transport:'stdio',presetId:'ships-demo',enabled:false});
  expect(screen.getByText('尚未检测')).toBeInTheDocument();
  expect(screen.getByText('测试连接')).toBeInTheDocument();
 });
 it('shows backend failure without inventing saved services',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline');}));render(<McpConsole/>);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('region',{name:'MCP 市场'})).toBeInTheDocument();
  expect(screen.getByRole('region',{name:'我的服务'})).toBeInTheDocument();
  expect(screen.getByText('暂无匹配的服务')).toBeInTheDocument();
 });
});

it('opens service tools in a dialog and can refresh discovery inside it',async()=>{
 const showModal=vi.fn(function(this:HTMLDialogElement){this.setAttribute('open','');});
 const close=vi.fn(function(this:HTMLDialogElement){this.removeAttribute('open');});
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:showModal});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:close});
 const service={id:'one',displayName:'测试船舶',description:'',label:1,transport:'stdio',presetId:'ships-demo',enabled:true,allowedTools:[],readOnlyTools:[]};
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify({ok:true,data:url.endsWith('/tools')?{items:[],stale:true}:url.endsWith('/test')?{toolCount:0,latencyMs:1}:{items:[service]}}))));
 render(<McpConsole/>);
 fireEvent.click(await screen.findByText('工具与试调用'));
 const dialog=await screen.findByRole('dialog',{name:'测试船舶 · 工具与试调用'});
 expect(showModal).toHaveBeenCalledOnce();
 await waitFor(()=>expect(screen.getByRole('button',{name:'重新检测连接'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'重新检测连接'}));
 await waitFor(()=>expect(dialog).toHaveTextContent('连接成功'));
 fireEvent.click(screen.getByRole('button',{name:'关闭工具面板'}));
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 vi.restoreAllMocks();
});

it('shows all category labels in one shared service list',async()=>{
 const base={description:'',transport:'stdio',presetId:'ships-demo',enabled:false,allowedTools:[],readOnlyTools:[]};
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({ok:true,data:{items:[{...base,id:'a',displayName:'分类一服务',label:1},{...base,id:'b',displayName:'分类二服务',label:2}]}}))));
 render(<McpConsole/>);
 await screen.findByText('分类一服务');
 expect(screen.getByText('分类二服务')).toBeInTheDocument();
 expect(screen.queryByText(/决策 · 标签|工作 · 标签/)).not.toBeInTheDocument();
});

it('requires confirmation before deleting a saved service',async()=>{
 const service={id:'delete-me',displayName:'待删除服务',label:1,transport:'stdio',presetId:'ships-demo',enabled:false,allowedTools:[],readOnlyTools:[]};
 const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>new Response(JSON.stringify({ok:true,data:init?.method==='DELETE'?{deleted:true}:{items:[service]}})));
 vi.stubGlobal('fetch',fetcher);
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 render(<McpConsole/>);
 fireEvent.click(await screen.findByRole('button',{name:'删除'}));
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(screen.getByText('待删除服务')).toBeInTheDocument();
 confirm.mockReturnValue(true);
 fireEvent.click(screen.getByRole('button',{name:'删除'}));
 await screen.findByText('服务已删除。');
 expect(screen.queryByText('待删除服务')).not.toBeInTheDocument();
 expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining('/servers/delete-me'),expect.objectContaining({method:'DELETE'}));
 confirm.mockRestore();
});
