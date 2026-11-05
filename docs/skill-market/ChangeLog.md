# Skill Creator 与 Skill Market 新前端更新日志

> 记录范围：从 Skill Creator + Skill Market 接入 `agent-hub-web` 的设计批准开始。
>
> 起始提交：A-01 所在提交。
>
> 维护方式：按日期正序追加；已实施条目包含问题现象、原因、修改方案、文档或代码变更和验证结果。仅完成方案、尚未修改生产代码的事项必须明确标注，不得与已落地功能混淆。

## 2026-11-05

### 1. 批准日常模式 Skill Creator + Skill Market 完整生命周期设计

提交：本次提交

#### 问题现象

- 新前端绑定设计只把 Skill 定义为 fixture 驱动的最小资源占位，明确排除资源编辑流程。
- 原设计没有覆盖作者工作台、Creator、审核、发布、安装、独立 BFF、跨仓 Schema 和 Runtime 准入。
- `daily` 与 `work` 的 Skill Market 后端边界没有形成可验收约束。

#### 原因

- Agent Hub Web V1 首次设计时只建设统一外壳和可替换资源插槽，Skill 完整生命周期尚未纳入范围。
- Skill Creator/Market 能力位于独立的 `DSI-agent-loop` 仓库，需要先冻结跨仓契约、安全和兼容边界。

#### 修改方案

- 将 `mode=daily` 的 Skill 页面扩展为 Skill 广场、作者工作台、Creator、审核、发布和安装完整生命周期。
- 将 `mode=work` 冻结为未接入占位：不发送 Skill Market 请求，不回退到日常后端，不复用 daily 状态。
- 明确同源 BFF、HMAC Principal、Schema 生成、运行时校验、受保护名称和 daily Runtime 准入规则。
- 生产代码实施仍以获批的跨仓 Development Plan 为前置门禁。

#### 文档变更

- 更新 `docs/skill-market/2026-10-27-agent-hub-web-design.md`，补充 Skill 路由、模块边界、安全规则、错误体验、目录结构和验收标准。
- 保持原始 V1 绑定设计 `docs/superpowers/specs/2026-10-27-agent-hub-web-design.md` 不变。
- 新增并按统一格式维护本更新日志。

#### 验证结果

- 设计明确区分已批准方案与尚未实施的生产代码。
- `daily/work`、新旧前端独立性、Schema 事实源和后端权限权威均有可验收规则。
- 文档差异通过 `git diff --check`；未运行代码测试，因为本次仅更新设计文档。

## 后续条目模板

```markdown
### 变更标题

提交：`commit`

#### 问题现象

- 用户看到的问题或提出的需求。

#### 原因

- 导致问题的业务、数据、代码或部署原因。

#### 修改方案

- 采用的设计和关键取舍。

#### 文档或代码变更

- 修改的主要文件、接口、字段和行为。

#### 验证结果

- 执行的测试、类型检查、Lint、数据库或部署验证。
```
