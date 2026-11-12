# Skill Market 日志与敏感信息检查记录

日期：2026-11-06

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应模块：`H-03`

## 1. 已实施门禁

- BFF 审计事件只允许 `method`、受控 `path`、`status`、`durationMs` 和格式安全的 `requestId`。
- 原始异常、堆栈、HMAC Secret、上游 Origin、Principal Header、上传正文和完整 Prompt 不进入审计事件或网关错误。
- 不符合 `[A-Za-z0-9._:-]{1,128}` 的上游 requestId 不转发给浏览器，也不进入日志。
- `check:skill-market-sensitive-data` 扫描 `.next` 文本制品、Source Map、客户端静态资产、`.env.example` 和实际构建环境。
- Secret 值不得出现在任何构建文本制品；Origin、Principal 值和 server-only 环境变量名不得出现在客户端静态资产；敏感配置不得使用 `NEXT_PUBLIC_*`。

## 2. 自动化证据

- `src/features/skills/api/gateway.test.ts` 使用异常、Secret、Origin、上传/Prompt 和堆栈 canary，验证响应与审计事件均不包含敏感值。
- `scripts/skill-market-sensitive-data.test.ts` 覆盖安全构建、构建制品 Secret、客户端 Origin、Source Map Secret、客户端 server-only 环境变量名，以及 `.env.example`/实际环境中的危险 `NEXT_PUBLIC_*`。
- H-03 聚焦测试：23/23 通过。
- 前端全量测试：184/184 通过；typecheck、lint、生成契约漂移检查和 production build 通过。

## 3. 构建扫描与人工抽查

使用非生产 canary Secret、私有 Origin 和 Principal ID 完成 production build，随后运行：

```text
pnpm check:skill-market-sensitive-data
```

扫描结果：构建产物、Source Map 和客户端资产均未发现配置的 canary 敏感值；客户端资产未出现 server-only Skill Market 环境变量名；示例配置和实际构建环境未出现危险的 Skill Market `NEXT_PUBLIC_*`。

人工 diff 抽查确认：日志调用只接收白名单审计对象；网关 catch 分支不序列化异常；上传 body、签名 Header、Secret 和完整上游 URL 均未传入日志函数。

## 4. 运行要求

每次生产构建应在与构建相同的 server-only 环境变量下紧接运行 `pnpm check:skill-market-sensitive-data`。扫描失败时只报告制品相对路径，不输出命中的敏感值。
