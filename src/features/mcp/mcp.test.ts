import {describe,it,expect} from 'vitest';
import {filterServices, marketItems} from './catalog';
import {requestMcp} from './api';
describe('MCP service catalog',()=>{
 it('filters numeric tags independently of app mode',()=>{
  expect(filterServices(marketItems,'',1).every(x=>x.label===1)).toBe(true);
  expect(filterServices(marketItems,'地图','all')).toHaveLength(1);
 });
 it('surfaces API errors rather than returning market fixtures',async()=>{
  await expect(requestMcp('/servers',undefined,async()=>new Response(JSON.stringify({ok:false,error:{message:'服务已停用'},requestId:'r1'}),{status:409}))).rejects.toThrow('服务已停用');
 });
});

it('public remote examples carry verified endpoints into service configuration',()=>{
 const remote=marketItems.filter(x=>x.id==='learn'||x.id==='deepwiki');
 expect(remote).toHaveLength(2);
 expect(remote.map(x=>x.url)).toEqual(['https://learn.microsoft.com/api/mcp','https://mcp.deepwiki.com/mcp']);
});
