# MCP统一身份接入

用户已批准前后端6-Task计划并要求自动执行、验证后PR/Merge Commit回归main、更新云镜像和真实验收。后端权威计划位于DSI仓库 docs/plans/2026-11-14-mcp-container-auth-plan.md。

前端范围为Task4与Task6：保留现有MCP UI、共享分类，改走Agent API全局Cookie身份；demo不请求、401全局失效、403本页提示、服务502不登出，换号/退出丢弃旧请求和草稿；删除直连rewrite。Skill双场景保持原样。V1旧占位/无auth限制已被本次明确接入授权替代。

验收：focused/full unit、lint/types/build、既有E2E与真实MCP容器链路；最终线上验收另记证据，不将fixture称为线上测试。

Task4完成：MCP定向20/20、full unit 830/830（maxWorkers=2，默认高并发使既有500条Skill渲染用例超时，未改断言/阈值）、lint/types/build、3组生成客户端检查与canary泄漏扫描通过。默认E2E35通过+1真实Xiaozhi opt-in跳过；canonical18/18。原生创建worktree未返回且未落盘，Git fallback创建codex/mcp-container-auth；无业务数据迁移。
