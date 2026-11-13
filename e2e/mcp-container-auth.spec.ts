import {test,expect,type Page} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
function compose(...args:string[]){const s=JSON.parse(readFileSync(join(tmpdir(),'mcp-e2e-state.json'),'utf8'));if(!/^mcp-e2e-[0-9]+$/.test(s.project))throw new Error('Not an owned test project');return execFileSync('docker',['compose','-p',s.project,'-f',s.composeFile,...args],{encoding:'utf8',env:{...process.env,MCP_TEST_ADMIN_TOKEN_FILE:s.adminFile,MCP_TEST_RUNTIME_TOKEN_FILE:s.runtimeFile}});}
async function login(page:Page,name='alice'){
 await page.goto('/mcp?mode=1');await page.getByRole('textbox',{name:'用户名'}).fill(name);await page.getByLabel('密码',{exact:true}).fill('test-only-password');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByRole('heading',{name:'MCP 服务中心'})).toBeVisible();
}
async function send(page:Page,text:string){await page.getByRole('textbox',{name:'消息'}).fill(text);await page.getByRole('button',{name:'发送',exact:true}).click();}

test('real login → management BFF → MCP container → selected Daily Loop → persisted history, cancel and outage',async({page,request})=>{
 const query='真实容器只读查询验收 '+Date.now();
 const api='http://127.0.0.1:3284';expect((await request.get(api+'/api/mcp/v1/servers')).status()).toBe(401);
 const browserAuthorizations:string[]=[];page.on('request',r=>{if(r.headers().authorization)browserAuthorizations.push(r.headers().authorization);});
 await login(page);
 await page.evaluate(async()=>{const rows=(await(await fetch('/agent-api/api/mcp/v1/servers')).json()).data.items;for(const row of rows)if(row.displayName==='真实容器船舶验收')await fetch('/agent-api/api/mcp/v1/servers/'+row.id,{method:'DELETE'});});await page.reload();
 await page.getByRole('button',{name:'添加到我的服务'}).first().click();await page.getByLabel('服务名称').fill('真实容器船舶验收');await page.getByLabel('启用服务',{exact:true}).check();await page.getByRole('combobox',{name:/^标签/}).selectOption('2');
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/mcp/v1/servers')&&r.request().method()==='POST');await page.getByRole('button',{name:'保存配置',exact:true}).click();const id=(await (await saved).json()).data.id;
 await page.getByRole('button',{name:'测试连接',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'连接成功'})).toBeVisible();
 await page.getByRole('button',{name:'工具与试调用'}).click();await page.getByRole('button',{name:'确认此工具只读并授权'}).click();await page.getByRole('button',{name:'重新检测连接'}).click();await page.getByRole('textbox',{name:'区域',exact:true}).fill('东海');await page.getByRole('button',{name:'执行试调用',exact:true}).click();await expect(page.locator('pre').filter({hasText:'模拟船舶A'})).toBeVisible();await page.getByRole('button',{name:'关闭工具面板'}).click();
 await page.goto('/chat?mode=1');await page.getByRole('button',{name:/^MCP/}).click();await page.getByRole('checkbox',{name:'真实容器船舶验收'}).check();await page.getByRole('button',{name:/^MCP/}).click();await send(page,query);
 await expect(page.getByText('已通过真实 MCP 容器获取东海模拟船舶数据。',{exact:true})).toBeVisible();const conversation=new URL(page.url()).searchParams.get('conversation');expect(conversation).toBeTruthy();
 const data=await page.evaluate(async conversation=>JSON.stringify(await Promise.all([`/agent-api/conversations/${conversation}/snapshot`,`/agent-api/conversations/${conversation}/events?afterSeq=0`].map(async p=>(await fetch(p)).json()))),conversation);
 expect(data).toContain(id);expect(data).not.toMatch(/credentialRef|inputSchema|access_token|test-only-identity|mcp_admin_token|mcp_runtime_token|\bat fixture\b/);
 await page.reload();await expect(page.getByText('已通过真实 MCP 容器获取东海模拟船舶数据。',{exact:true})).toBeVisible();
 await page.goto('/history?mode=1');await page.getByRole('link',{name:new RegExp(query)}).click();await expect(page.getByText('已通过真实 MCP 容器获取东海模拟船舶数据。',{exact:true})).toBeVisible();
 await page.goto('/chat?mode=1');await send(page,'中断验收');await page.getByRole('button',{name:'停止',exact:true}).click();await expect(page.getByText('生成已停止',{exact:true})).toBeVisible();
 compose('stop','mcp-api');try{
  await page.goto('/mcp?mode=1');await expect(page.getByRole('alert').filter({hasText:'MCP服务暂不可用'})).toBeVisible({timeout:25000});await expect(page.locator('.sidebar-user')).toContainText('alice');
  await page.goto('/chat?mode=1');await send(page,'停服时无MCP选择仍可对话');await expect(page.getByText('无 MCP 选择的对话正常完成。',{exact:true})).toBeVisible();
 }finally{compose('start','mcp-api');}
 await page.getByRole('button',{name:'退出登录',exact:true}).click();await login(page,'bob');await page.goto('/history?mode=1');await expect(page.getByRole('link',{name:new RegExp(query)})).toHaveCount(0);
 const state=JSON.parse(readFileSync(join(tmpdir(),'mcp-e2e-state.json'),'utf8'));
 expect(dirname(state.adminFile)).toBe(state.dir);expect(dirname(state.runtimeFile)).toBe(state.dir);expect(dirname(state.dir)).toBe(tmpdir());expect(basename(state.dir)).toMatch(/^mcp-e2e-secrets-/);
 for(const file of [state.adminFile,state.runtimeFile])writeFileSync(file,randomBytes(32).toString('hex'));
 compose('up','-d','--no-deps','--force-recreate','--wait','mcp-api','agent-api');
 await page.goto('/mcp?mode=1');await expect(page.getByRole('textbox',{name:'用户名'})).toBeVisible();await login(page,'bob');
 await expect(page.getByRole('heading',{name:'真实容器船舶验收',exact:true})).toBeVisible();await expect(page.getByText('尚未检测',{exact:true})).toBeVisible();
 expect(browserAuthorizations).toEqual([]);
});
