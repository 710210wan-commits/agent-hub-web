# Skill Creator 与 Skill Market 新前端更新日志

> 记录范围：从 Skill Creator + Skill Market 接入 `agent-hub-web` 的设计批准开始。
>
> 起始提交：A-01 所在提交。
>
> 维护方式：按日期正序追加；每项简要记录关联 Plan、问题和修改方案。仅完成方案、尚未修改生产代码的事项必须明确标注，不得与已落地功能混淆。

## 2026-11-05

### 1. 批准日常模式 Skill Creator + Skill Market 完整生命周期设计

提交：`c3d954d`

Plan 文档：`DSI-agent-loop/docs/plans/2026-11-05-skill-market-frontend-migration.md`

#### 问题

- 新前端绑定设计只把 Skill 定义为 fixture 驱动的最小资源占位，明确排除资源编辑流程。
- 原设计没有覆盖作者工作台、Creator、审核、发布、安装、独立 BFF、跨仓 Schema 和 Runtime 准入。
- `daily` 与 `work` 的 Skill Market 后端边界没有形成可验收约束。

#### 修改方案

- 将 `mode=daily` 的 Skill 页面扩展为 Skill 广场、作者工作台、Creator、审核、发布和安装完整生命周期。
- 将 `mode=work` 冻结为未接入占位：不发送 Skill Market 请求，不回退到日常后端，不复用 daily 状态。
- 明确同源 BFF、HMAC Principal、Schema 生成、运行时校验、受保护名称和 daily Runtime 准入规则。
- 将批准后的扩展设计写入 `docs/skill-market/2026-10-27-agent-hub-web-design.md`，原始 V1 绑定设计保持不变；生产代码仍以关联 Plan 为实施门禁。

## 后续条目模板

```markdown
### 变更标题

提交：`commit`

Plan 文档：`path/to/plan.md`

#### 问题

- 用户看到的问题或提出的需求。

#### 修改方案

- 采用的设计和关键取舍。
```
