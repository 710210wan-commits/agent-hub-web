export type Label = 1 | 2;
export interface Service {
 id: string; displayName: string; description: string; label:Label;
 transport:'stdio'|'http'; presetId?:'ships-demo'|'antv-chart'; url?:string; credentialRef?:string;
 enabled:boolean; allowedTools:string[]; readOnlyTools:string[];
 health?:'unknown'|'healthy'|'unhealthy'; lastCheckedAt?:string|null; toolCount?:number|null;
}
export interface Tool {
 toolName:string; description:string; inputSchema:Record<string,unknown>; allowed:boolean; readOnly:boolean;
}
export interface MarketItem {id:string;displayName:string;description:string;label:Label;transport:'stdio'|'http';presetId?:'ships-demo'|'antv-chart';url?:string;credentialRef?:string;note:string;}
export const marketItems:MarketItem[] = [
 {id:'ships',displayName:'本地示例服务',description:'启动项目自带的模拟船舶服务，验证工具发现和查询调用。',label:1,transport:'stdio',presetId:'ships-demo',note:'本地预设 · 无需凭证 · 模拟数据'},
 {id:'chart',displayName:'AntV 图表服务',description:'小智同款图表 MCP，支持柱状图、折线图、饼图等。',label:1,transport:'stdio',presetId:'antv-chart',note:'本地进程 · 数据发送至 AntV 在线绘图服务'},
 {id:'learn',displayName:'Microsoft Learn 文档',description:'搜索微软、Azure 和开发工具的官方文档及代码示例。',label:1,transport:'http',url:'https://learn.microsoft.com/api/mcp',note:'公开远程服务 · 无需密钥 · 查询内容会发送给微软'},
 {id:'deepwiki',displayName:'DeepWiki 开源仓库',description:'读取公开 GitHub 仓库的文档目录，查询仓库知识。',label:1,transport:'http',url:'https://mcp.deepwiki.com/mcp',note:'公开远程服务 · 无需密钥 · 查询内容会发送给 DeepWiki'},
 {id:'maps',displayName:'高德地图',description:'地点搜索、地址坐标转换、路线规划和天气查询。',label:2,transport:'http',url:'https://mcp.amap.com/mcp',credentialRef:'MCP_SECRET_AMAP_MAPS',note:'需配置高德 Key · 查询内容发送给高德地图'},
];
export function filterServices<T extends {displayName:string;description:string;label:Label}>(items:T[],query:string,label:Label|'all'):T[]{
 const q=query.trim().toLowerCase();
 return items.filter(x=>(label==='all'||x.label===label)&&`${x.displayName} ${x.description}`.toLowerCase().includes(q));
}
export function servicePayload(s:Service) {
 const shared={displayName:s.displayName,description:s.description,label:s.label,enabled:s.enabled,allowedTools:s.allowedTools,readOnlyTools:s.readOnlyTools};
 return s.transport==='stdio'?{...shared,transport:s.transport,presetId:s.presetId??'ships-demo'}:{...shared,transport:s.transport,url:s.url, ...(s.credentialRef?{credentialRef:s.credentialRef}:{})};
}
