# MCP 服务中心开发交接（2026-11-09）

前端开发分支 feature/mcp-overview-ui；后端 DSI-git-mcp 开发分支 feature/mcp-console。提交、合并和远程状态以 Git 记录为准。

## 本轮功能

/mcp 页面包含静态 MCP 市场和真实“我的服务”。支持搜索、数字标签 1/2、配置保存与编辑、启停、连接检测、工具参数查看、只读授权与试调用。标签1对应日常，标签2对应办公。市场地图项是待配置模板，并非已连接的地图服务。

前端调用 /mcp-api/api/mcp/v1，由 Next 转发至 MCP_API_ORIGIN。服务数据保存在管理后端，不使用浏览器假数据替代失败请求。

## 启动

1. 后端：在 DSI-git-mcp/integrations/mcp 执行 pnpm install --ignore-workspace --frozen-lockfile，再执行 pnpm console，默认 127.0.0.1:4318。
2. 前端：按根目录 .env.example 配置已有模块的必填环境变量，增加 MCP_API_ORIGIN=http://127.0.0.1:4318。
3. 执行 pnpm dev --hostname 127.0.0.1 --port 3010，打开 /mcp。
4. 若改用 3011，后端启动时设置 MCP_UI_ORIGINS=http://127.0.0.1:3011,http://localhost:3011。

最新 main 要求 Skill 市场的 origin 和 Principal 配置，即使只预览 MCP 也需要提供。不要删除这些公共校验；MCP 本身不使用这些凭据。

## 手动验收

市场选择本地船舶示例 → 编辑标签并启用 → 保存 → 测试连接 → 确认 query_ships 只读并授权 → 再次检测 → 参数填写 {"region":"台湾海峡"} → 执行试调用。返回两条明确标注的模拟船舶。

## 边界与后续

当前是本机开发管理模块，未接团队登录与多用户权限，不能直接开放到公网。当前聊天的 MCP 能力选择仍未接入这份真实服务库；页面试调用成功不等于 Agent 已集成。下一步需对齐新聊天接口的服务选择字段与执行权限。

本地预设支持 ships-demo 和 antv-chart；远程支持 Streamable HTTP，管理员配置允许 origin 及环境变量凭据引用。外部导航服务需真实地址和账号后再联调。

## 验证

pnpm typecheck；pnpm test；pnpm exec eslint src/components/mcp src/features/mcp src/config/mcp-proxy.ts。

## 公开远程测试服务（2026-11-09 已实测）

市场新增 Microsoft Learn 和 DeepWiki，自动带入真实地址，无需密钥；标签默认1，可编辑。不自动添加到个人服务或授权。查询参数将发给对应外部提供方。

- Microsoft Learn：https://learn.microsoft.com/api/mcp 。检测发现3个工具。推荐 microsoft_docs_fetch，参数：
  {"url":"https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/void"}
- DeepWiki：https://mcp.deepwiki.com/mcp 。检测发现3个工具。推荐 read_wiki_structure，参数：
  {"repoName":"facebook/react"}

添加→启用→检测→选择上述工具→确认只读授权→再次检测→重新选择工具并填参数→试调用。微软广泛搜索可能超过当前16000字符结果预算，此时显示结果过大错误；不要将它误判为连接失败。线上服务可用性和限额由提供方决定。

官方说明：https://learn.microsoft.com/en-us/training/support/mcp 与 https://mcp.deepwiki.com/ 。本次两个推荐工具均经过管理服务真实调用验证。前端256项测试、后端8项测试通过。

## 参数表单与 AntV 图表（2026-11-09）

新增 AntV 图表本地预设（antv-chart，依赖固定为0.9.10，与小智使用同一个包）。本地进程会把图表参数发送到 AntV 在线绘图服务；生成前必须确认。后端使用 confirmedGeneration=true 及已有工具白名单确认本次生成，不将生成工具自动标为只读。端到端的后端实际生成已成功，浏览器完整图表流程未验证（启动审批因额度限制中断）。

试调用默认显示参数表单。点击“填入示例模板”生成可编辑示例；图表 data 支持分类/数值等表格列、增删行。标量字段显示输入框或下拉选择，复杂嵌套/联合类型保留 JSON 编辑。表单与 JSON 共用同一参数状态，切换不丢参数；切换工具清空旧参数。模板不代替服务端 schema 校验。前端类型检查与258项测试通过。

## 高德替换百度入口

按用户提供 https://mcp-cn.com/server/82，将市场地图卡片改为高德。目录的公开配置预填了 Key，不等于官方免凭据；经用户授权，该 Key 仅用于本地测试，不写入源码或提交记录。官方远程地址 https://mcp.amap.com/mcp，凭据引用 MCP_SECRET_AMAP_MAPS，后端连接时注入 key 查询参数。已完成本地工具发现和地址坐标查询验证；其他环境需自行配置有效 Key。百度适配代码保留，但不再列入默认远程允许清单。

## 模式映射（替代此前“标签不绑定模式”约定）

用户已明确：标签1=日常，标签2=办公。我的服务列表、计数和搜索按顶部 mode 过滤，取消跨模式的“全部标签”选择。新增服务默认使用当前模式对应标签，编辑时可改归属。市场保持公共目录，添加到当前模式。切换模式卸载旧弹窗和参数草稿。此为展示归属，不代表服务端用户权限隔离。


## 2026-11-14 统一身份桥接（替代上文直连配置）

管理请求统一走 `/agent-api/api/mcp/v1`，沿用全局AuthProvider及Cookie。MCP_API_ORIGIN和/mcp-api直连rewrite已停用；浏览器不接触服务凭据。后端配置Console固定私网origin及两种secret文件，详见DSI MCP部署计划。

未登录/demo不发受保护请求。平台401触发全局失效；403仅本页权限提示，MCP服务502不会退出登录。退出/换号卸载并中止页面请求，重置列表、编辑草稿、工具和结果；迟到响应不可回填。标签1/2共享，Skill场景不变。
