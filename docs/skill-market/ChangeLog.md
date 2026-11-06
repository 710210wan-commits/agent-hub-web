# Skill Creator 与 Skill Market 新前端更新日志

> 记录范围：从 Skill Creator + Skill Market 接入 `agent-hub-web` 的设计批准开始。
>
> 起始提交：A-01 所在提交。
>
> 维护方式：按日期正序追加；每项简要记录关联 Plan、对应模块序号、问题和修改方案。存在对应模块时，Git 提交使用 `<type>(<module-id>): <description>`；仅完成方案、尚未修改生产代码的事项必须明确标注，不得与已落地功能混淆。

## 2026-11-05

### 1. 批准日常模式 Skill Creator + Skill Market 完整生命周期设计

提交：`c3d954d`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`A-01`（更新并批准新前端 Skill 绑定设计）

#### 问题

- 新前端绑定设计只把 Skill 定义为 fixture 驱动的最小资源占位，明确排除资源编辑流程。
- 原设计没有覆盖作者工作台、Creator、审核、发布、安装、独立 BFF、跨仓 Schema 和 Runtime 准入。
- `daily` 与 `work` 的 Skill Market 后端边界没有形成可验收约束。

#### 修改方案

- 将 `mode=daily` 的 Skill 页面扩展为 Skill 广场、作者工作台、Creator、审核、发布和安装完整生命周期。
- 将 `mode=work` 冻结为未接入占位：不发送 Skill Market 请求，不回退到日常后端，不复用 daily 状态。
- 明确同源 BFF、HMAC Principal、Schema 生成、运行时校验、受保护名称和 daily Runtime 准入规则。
- 将批准后的扩展设计写入 `docs/skill-market/2026-10-27-agent-hub-web-design.md`，原始 V1 绑定设计保持不变；生产代码仍以关联 Plan 为实施门禁。

### 2. 增加 Skill Market 服务端目标与请求门禁

提交：`104e6f2`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T7`（来源细化模块 `B-01`）

#### 问题

- 新前端尚无 daily 后端唯一目标配置，也没有阻止 work、任意目标和越界路径进入后续代理的统一门禁。

#### 修改方案

- 新增服务端专用 `SKILL_MARKET_DAILY_ORIGIN`，在 Next 启动/构建边界校验必填项、HTTP(S) 协议和纯 Origin 格式。
- 仅允许 `daily` 解析到固定目标；`work`、非法 mode、目标覆盖、绝对 URL、编码路径和未登记 Skill Market operation 均在上游调用前失败。
- 本模块只提供 B-01 目标与路径门禁；Principal 签名和实际 BFF 转发分别留给 B-02、B-03。

## 2026-11-06

### 3. 增加 Skill Market Principal 签名适配

提交：`838cea3`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T7`（来源细化模块 `B-02`）

#### 问题

- 新前端 BFF 尚不能按后端冻结的规范建立可信 Principal，且必须防止浏览器提供身份、角色、权限、作用域或 Secret。

#### 修改方案

- 新增服务端单操作员 Principal 配置，校验 Secret 长度、身份、角色和列表字段，并在启动/构建边界 fail closed。
- 按 `skill-market-principal-v1` 对最终 HTTP 方法和 `originalUrl` 生成六个 Header，固定向量与后端 I-01 基线一致。
- 增加过期及方法、路径、身份、角色、managed scenarios、permissions 篡改测试；错误不包含 Secret、签名原文或业务路径。

### 4. 增加同源 Skill Market BFF 代理

提交：`215dc73`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

对应 Plan 模块：`T7`（来源细化模块 `B-03`）

#### 问题

- 浏览器尚无独立同源入口安全转发 Skill Market 请求，JSON、204、下载、超时和取消语义也没有统一边界。

#### 修改方案

- 新增 `/api/skill-market/[...path]` Node.js Route Handler，复用 B-01 目标门禁和 B-02 Principal 签名，不复制业务 DTO 或生命周期逻辑。
- 流式转发请求与响应，保留 JSON 状态、204 和下载的类型、文件名、长度、hash；清理 hop-by-hop、Cookie、Host、Origin 和客户端 Principal Header。
- 增加可配置超时、客户端取消传播及稳定的 502/504/499 网关错误；work、非法 mode 和目标覆盖保持零上游请求。

## 后续条目模板

```markdown
### 变更标题

提交：`commit`

Plan 文档：`path/to/plan.md`

对应 Plan 模块：`T1`

#### 问题

- 用户看到的问题或提出的需求。

#### 修改方案

- 采用的设计和关键取舍。
```
