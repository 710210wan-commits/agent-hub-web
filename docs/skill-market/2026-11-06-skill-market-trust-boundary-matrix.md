# Skill Market 信任边界测试矩阵

日期：2026-11-06

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应模块：`H-01`

## 1. 范围与结论

本矩阵覆盖新前端浏览器、同源 BFF、日常后端、Artifact Store、数据库和 Runtime。浏览器提交的 mode、路径、查询、业务 DTO 和 Header 均不可信；只有 BFF 的服务端目标配置和签名配置、后端验签后的 Principal、数据库权威状态及通过 hash/Schema 校验的 Artifact 可进入下一信任层。

H-01 只冻结信任边界和负向证据，不在前端复制后端权限规则。日志脱敏的完整扫描归 H-03，API client 的 mode/cache key 和 work 零请求门禁归 B-06。

## 2. 边界矩阵

| 边界 | 可信输入 | 非可信输入 | 鉴权点 | 授权点 | 审计点 |
| --- | --- | --- | --- | --- | --- |
| 浏览器 → BFF | 无浏览器身份字段被直接信任 | `mode`、业务路径、查询、body、Origin/Host、全部 Principal Header | BFF 校验 mode、允许路径和目标覆盖字段 | 不在浏览器授权 | 浏览器只接收稳定错误和排障 ID，不记录 Secret/签名原文 |
| BFF → 日常后端 | 服务端环境变量中的唯一 daily Origin；BFF 生成的 HMAC Principal | 客户端 Origin/Host/Principal；绝对 URL；未知或穿越路径 | 后端按最终 method + originalUrl 验证签名和时效 | 后端按角色、managed scenarios、permissions 和资源状态授权 | BFF/后端记录受控路径、状态、耗时和排障 ID；H-03 负责正式扫描收口 |
| 后端 → Artifact Store | 数据库中的 Artifact Key、预期 content hash | 上传文件名、ZIP 路径、未校验字节和客户端 hash | 后端服务身份访问 Store | 后端生命周期服务决定读写动作 | 不记录上传正文或完整 Prompt；hash/Artifact Key 仅按运维规则记录 |
| 后端 → 数据库 | 验签后的 Principal；服务层验证后的状态转换 | 请求 body 中的 owner、role、scope、revision 和状态 | 后端 Principal 验签 | 数据库查询和领域服务共同限制 owner、角色、scope、revision、生命周期 | `skill_market_audit_logs` 记录 actor、动作、实体和必要摘要 |
| 后端 → Runtime | 已审核、已发布、已启用、hash/definition 有效且名称不冲突的安装 | 客户端声称的可运行状态、未校验 Artifact、跨 scenario/agent scope | Runtime 只消费后端权威安装快照 | Runtime 准入/退出由后端实现；前端不能提升 | Runtime 拒绝和缓存失效证据归 I-05/K-05 |
| Runtime → Agent 请求 | 当前请求允许的 scenario/agent scope | 其他 mode、其他 scope、历史缓存和已停用/下架项 | Agent 请求上下文 | Runtime 再按 scope 和安装状态筛选 | 记录 Skill 标识、状态和安全事件，不记录完整内部 Prompt |

## 3. 威胁与验证证据

| 威胁 | 预期控制 | 自动化负向证据 | 补充验证/后续门禁 |
| --- | --- | --- | --- |
| Origin/目标注入 | 浏览器不能提交 Origin、Host、target、url 或 upstream；只允许服务端 daily Origin | `src/config/skill-market-targets.test.ts`：public lookalike、对象覆盖和查询覆盖全部失败；`src/features/skills/api/gateway.test.ts`：上游调用前剥离 Host/Origin | H-03 扫描错误和日志不出现上游 Origin |
| Principal Header 注入 | BFF 丢弃客户端 Principal，并用服务端配置重新签名 | `src/features/skills/api/gateway.test.ts`：客户端 id/roles 不进入上游；`src/config/skill-market-principal.test.ts`：身份、角色、managed scenarios、permissions 篡改均验签失败 | 后端仍是身份和权限最终权威 |
| 方法/路径重放 | 签名绑定最终 method 和 originalUrl；路径只允许固定 operation 形状 | `src/config/skill-market-principal.test.ts`：method/query order 改变后验签失败；`src/config/skill-market-targets.test.ts`：未知前缀、额外段和多重编码穿越失败 | K-04 执行真实跨层重放测试 |
| 过期签名 | 超过五分钟的 Principal envelope 被后端拒绝 | `src/config/skill-market-principal.test.ts`：过期时间戳验签失败；后端 `test:skill-market:principal` 覆盖同一窗口 | 不在浏览器刷新或伪造 Principal |
| 跨 scope/提权 | managed scenarios、permissions、roles 只能来自服务端签名配置；业务 scope 仍由后端授权 | `src/config/skill-market-principal.test.ts`：scope/permission/role 篡改失败；`src/features/skills/api/gateway.test.ts`：客户端 Principal 被覆盖 | H-04/K-04 增加真实 403 和 scope 越权体验；前端不复制角色矩阵 |
| 跨 mode | `work` 在任何上游 fetch 前 fail closed，不能回退到 daily | `src/config/skill-market-targets.test.ts` 和 `src/features/skills/api/gateway.test.ts`：work/非法 mode 的 fetch 调用次数为零 | B-06 API client 再增加 work 零请求门禁 |
| 缓存泄漏 | BFF 使用 `cache: no-store`；应用层 key 必须包含 mode、资源类型和资源 ID | `src/features/skills/api/gateway.test.ts`：上游请求固定 `cache: no-store`；当前尚无 Skill Market 应用数据缓存 | B-06 必须测试 mode 隔离、daily key 不可在 work 命中，并在切换后清理页面状态 |

## 4. 人工复核步骤

1. 在浏览器网络面板分别访问 `mode=daily` 与 `mode=work`；work 不得出现 `/api/skill-market` 请求。
2. 对 daily 请求手工加入 Origin、Host 和任一 `x-skill-principal-*` Header；BFF 上游请求只能出现服务端重新生成的 Principal。
3. 检查错误响应和服务日志，不得出现 HMAC Secret、完整签名原文、服务端 Origin、上传正文或完整 Prompt；该项在 H-03 完成自动扫描后关闭。
4. B-06 完成后切换 daily → work → daily，确认 work 页面不显示 daily 数据，daily 重新进入时只读取带 daily mode 的缓存 key。

## 5. H-01 退出结论

七类要求威胁均已有自动化负向证据或明确人工步骤。当前未解决项分别由 H-03、B-06、H-04/I-05 和 K-04/K-05 承接，不改变 H-01 已冻结的信任边界。
