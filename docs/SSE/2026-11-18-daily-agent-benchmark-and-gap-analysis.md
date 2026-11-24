# Daily 智能体竞品与能力缺口分析

> 日期：2026-11-18  
> 状态：产品与技术调研  
> 范围：Daily 智能体；流式输出之外的产品能力  
> 竞品资料：截至 2026-11-18 的官方产品文档与帮助中心

## 文档目的

本文整理两个问题：

1. 除 ChatGPT/Codex、Claude、WorkBuddy 外，还有哪些值得参考的类似 Agent 产品。
2. 除前端流式显示外，当前 Daily 智能体与成熟桌面/办公 Agent 相比还缺少什么。

文档将产品分成“桌面通用 Agent、云端异步任务 Agent、企业办公与知识 Agent、开源与本地优先 Agent”四类。能力差距按照 Daily 是否值得优先实现划分为 P0、P1、P2，避免把通用桌面 Agent 的全部能力不加选择地复制进 Daily。

---

# 1. 类似 Agent

这里的“类似”不是指普通聊天机器人，而是至少具备多步骤任务执行、工具调用、文件处理、异步运行或成果交付中若干项能力的 Agent 产品。

## 1.1 桌面通用 Agent

| 产品 | 主要特点 | 对 Daily 最值得参考的部分 |
| --- | --- | --- |
| ChatGPT Work / Codex | Cloud/Local 任务、Projects、文件与应用、浏览器、审批、长任务和真实产物；Codex 侧重代码与本地开发工具 | 任务监督、权限审批、Project、并行长任务、产物工作区 |
| Claude / Claude Desktop / Cowork | Projects、Artifacts、Research、Desktop Extensions、本地文件与连接器、多步骤知识工作 | 项目知识、引用研究、Artifact 侧栏、MCP/Connector 扩展 |
| WorkBuddy | 本地工作空间、Agent/Plan/Ask、Skills、MCP、文件与浏览器、多任务、权限沙箱和远程助理 | 任务模式、工作空间、工具审批、Skills 产品化、任务中心 |
| Kimi Work | 本地文件、浏览器、工具调用、任务分解、并行 Agent、文档/表格/PPT 交付 | 工作空间、并行任务、长任务、产物交付 |
| Manus Desktop | 直接操作本地文件、命令和桌面工作空间，支持跨设备 | 本地/云端执行切换、桌面权限边界 |
| Perplexity Personal Computer | Windows 原生，跨本地文件、应用和 Web 工作，支持多模型编排 | 来源引用、本地文件授权、多模型调度 |
| Microsoft Copilot Actions | 在隔离、可审计的 Agent Workspace 中操作 Windows 文件与应用 | 企业审批、审计、隔离执行环境 |
| Gemini 桌面任务 | 远程浏览器、代码执行、文件编辑和用户接管浏览器 | 浏览器接管、敏感步骤 handoff |
| Accomplish/Openwork | 开源本地桌面 Agent，处理文件、文档和浏览器任务 | 本地优先架构和开源实现参考 |

### 1.1.1 ChatGPT Work / Codex

ChatGPT 桌面端把 Chat、Work 与 Codex 放在同一个应用中，但面向不同任务：Chat 用于快速问答，Work 用于研究、分析和交付文档、表格、演示文稿、报告或站点，Codex 用于代码仓库、终端、测试和软件开发任务。

ChatGPT Work 可以在 Cloud 或 Local 环境运行。Cloud 任务可以在关闭桌面应用后继续，并跨 Web、移动端和桌面端查看；Local 任务可以在用户授权后使用本地文件、桌面应用和浏览器。Work 会展示进度，在需要信息或重要操作批准时暂停。Codex 则提供本地文件、仓库、终端、开发工具、并行任务和长时间 Goal 等能力。

值得 Daily 参考的能力：

- Chat、Work、Codex 按任务性质分工，而不是把所有能力堆在一个模式中；
- Cloud/Local 执行位置显式可见；
- Projects 把相关对话、文件、项目来源和项目指令组织在一起；
- 长任务可以显示目标、进度、暂停、恢复和等待用户处理状态；
- 用户可以在运行中补充上下文、改变约束或询问状态；
- 文件、网络、命令和桌面应用采用沙箱与审批策略；
- 内置浏览器支持多标签、登录 handoff 和下载；
- 文档、表格、演示、图片和其他产物可以在同一工作区检查；
- 独立任务可以并行运行，并通过项目、Recents、置顶和通知管理；
- 本地和云端任务具有不同的数据、权限和可恢复性说明。

对 Daily 最直接的启示是：流式聊天只是表现层，成熟 Agent 还需要显式的任务目标、权限边界、项目上下文、用户干预点和可验收产物。

官方资料：

- [ChatGPT Work 与 Codex](https://help.openai.com/en/articles/20001275)
- [ChatGPT Work 入门](https://learn.chatgpt.com/docs/get-started-with-work)
- [ChatGPT 桌面端](https://learn.chatgpt.com/docs/app)
- [ChatGPT Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)
- [ChatGPT 权限模式](https://learn.chatgpt.com/docs/permission-modes?site_variant=chatgpt&translationFallback=zh-Hans)
- [ChatGPT Work 本地安全](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security)
- [ChatGPT 内置浏览器](https://help.openai.com/en/articles/20001277-using-the-built-in-browser-in-the-chatgpt-desktop-app)
- [长时间任务与 Goal](https://learn.chatgpt.com/docs/long-running-work)

### 1.1.2 Claude / Claude Desktop / Cowork

Claude 产品体系中，Claude Chat 负责研究、写作和对话；Projects 提供项目级知识、文件和指令；Artifacts 用独立侧栏承载文档、代码、图表、应用和其他可继续编辑的成果；Research 负责多步骤检索并给出可核查引用；Claude Desktop 通过 Desktop Extensions 和 MCP 连接本地文件、应用及远程服务。面向更完整的多步骤办公执行时，Claude Cowork 强调跨本地文件和连接应用完成项目。

值得 Daily 参考的能力：

- Project 拥有独立知识库、项目指令和相关对话；
- 项目知识接近上下文限制时自动转为 RAG，而不是简单截断；
- Artifact 与聊天正文分离，用户可以在右侧查看、编辑、迭代和复用成果；
- Research 将内部资料、连接器数据和 Web 组合成带引用的研究结果；
- 历史对话可以被检索和引用，但检索范围受项目边界控制；
- Desktop Extensions/MCP 把本地文件、日历、邮件和其他工具接入 Claude；
- 本地扩展与远程 Connector 有清晰的运行位置和数据边界；
- 项目可共享，并区分可使用、可编辑等权限；
- 文件类型、大小、上下文容量和 RAG 行为向用户明确说明；
- 产物不是对话附件，而是可持续迭代的工作对象。

对 Daily 最直接的启示是：应把“Conversation、Project Knowledge、Citation、Artifact”建成四个独立但可关联的领域对象，而不是把所有内容塞进一条 assistant message。

官方资料：

- [Claude Projects](https://support.anthropic.com/en/articles/9517075-what-are-projects)
- [Claude Projects 管理](https://support.anthropic.com/en/articles/9519177-how-can-i-create-and-manage-projects)
- [Claude Projects RAG](https://support.anthropic.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects)
- [Claude Artifacts](https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- [Claude Research](https://support.anthropic.com/en/articles/11088861-using-research-on-claude-ai)
- [Claude 个性化与历史检索](https://support.anthropic.com/en/articles/10185728-understanding-claude-s-personalization-features)
- [Claude Desktop](https://support.anthropic.com/en/articles/10065433-installing-claude-for-desktop)
- [Claude Desktop Extensions/MCP](https://support.anthropic.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)
- [Claude Desktop 与 Web Connectors](https://support.anthropic.com/en/articles/11725091-when-to-use-desktop-and-web-connectors)

### 1.1.3 WorkBuddy

WorkBuddy 是腾讯推出的全场景职场 AI 智能体桌面工作台。它不仅回答问题，还会拆解任务、调用工具、操作本地文件并交付文档、表格、PPT、图片等工作成果。每个任务拥有独立上下文和工作空间，多个任务可以并行运行。

值得 Daily 参考的能力：

- Agent、Plan、Ask 三种工作模式显式区分自主程度；
- Plan 模式先生成可审阅方案，用户确认后才执行；
- 每个任务绑定独立工作空间，减少上下文和文件操作相互影响；
- 支持本地文件拖拽、图片粘贴和多种办公文件；
- 执行中的任务在侧栏持续显示，可以切换查看多个任务进度；
- Skills、MCP 和连接器通过统一入口扩展能力；
- 默认权限以工作空间为边界，越界或高风险操作请求确认；
- 安全中心可以逐个启用或禁用工具与 MCP 服务；
- 自动备份在修改已有文件前生成快照；
- 对话右侧结果区统一展示文件、链接和 MCP 应用界面；
- 任务支持置顶、重命名、分享、独立窗口、归档和批量管理；
- 本地记忆、工作日志和技能演化有独立管理入口；
- Assistant 可以从手机或即时通讯渠道发起任务、补充说明和审批操作。

对 Daily 最直接的启示是：能力选择只是起点，还需要工作空间、执行模式、逐动作审批、产物区和任务中心共同形成完整产品闭环。

官方资料：

- [WorkBuddy 产品介绍](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Product-Guide)
- [WorkBuddy Quick Start](https://www.workbuddy.ai/docs/workbuddy/Quickstart)
- [WorkBuddy 新建任务与工作模式](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Task-Bar)
- [WorkBuddy 任务对话](https://www.workbuddy.cn/docs/workbuddy/Conversation)
- [WorkBuddy 权限与安全沙箱](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Permission-Modes)
- [WorkBuddy 连接器](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector)
- [WorkBuddy 任务管理](https://www.workbuddy.cn/docs/workbuddy/Task-Management)
- [WorkBuddy 记忆设置](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/System-Settings)
- [WorkBuddy Assistant Remote Control](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Assistant-Remote-Control)

### 1.1.4 Kimi Work

Kimi Work 是与 WorkBuddy 定位非常接近的桌面 Agent。其官方定位是面向知识工作者的本地 AI Agent，可以访问本地文件、浏览器和日常工具，自动分解任务、并行执行，并生成文档、表格和演示文稿等可直接使用的成果。

值得 Daily 参考的能力：

- Chat 与 Agent Workspace 分离；
- 本地 Project/Workspace；
- Agent Swarm 或多任务并行；
- 浏览器与文件工具；
- 后台、定时和长任务；
- 直接交付 Office 文件；
- 可见的任务步骤、工具调用和执行状态。

官方资料：

- [Kimi Work 产品概览](https://www.kimi.ai/help/kimi-work/overview)
- [Kimi Work 产品页](https://www.kimi.ai/products/kimi-work)
- [Kimi Work 入门](https://www.kimi.ai/academy/kimi-work-getting-started)

### 1.1.5 Manus Desktop

Manus Desktop 的 My Computer 能力可以管理本地文件、执行命令，并直接在用户的本地工作空间中完成任务，同时保留云端 Agent 的跨设备体验。

值得 Daily 参考的能力：

- 同一个任务选择云端或本地执行；
- 文件夹级授权；
- 本地命令执行；
- Agent 与用户共享工作空间；
- 桌面端执行、移动端或其他设备查看结果；
- 本地任务和云端任务使用一致的任务界面。

官方资料：

- [Manus Desktop 下载与 My Computer](https://help.manus.im/en/articles/14089011-how-to-download-the-manus-desktop-app)
- [Introducing My Computer](https://manus.im/blog/manus-my-computer-desktop)

### 1.1.6 Perplexity Personal Computer

Perplexity Personal Computer 是 Windows 原生 Agent，定位为跨本地文件、桌面应用和 Web 编排工作，并通过多个模型完成研究和执行任务。

值得 Daily 参考的能力：

- 强来源引用；
- 研究结果和本地资料结合；
- 多模型编排与结果核对；
- 文件夹级授权；
- 搜索、分析和执行的统一工作流；
- 在用户现有 Windows 工作环境中完成任务。

官方资料：

- [Perplexity Personal Computer for Windows](https://www.perplexity.ai/en-GB/hub/products/computer-for-windows)

### 1.1.7 Microsoft Copilot Actions

Copilot Actions 在一个与用户交互桌面隔离的、受策略控制且可审计的 Agent Workspace 中操作 Windows 本地文件、桌面应用和 Web 应用。

值得 Daily 参考的能力：

- Agent 执行空间与用户当前桌面隔离；
- 对可执行应用和动作实施策略限制；
- 完整操作审计；
- 高风险步骤确认；
- 本地文件和桌面应用的权限边界。

官方资料：

- [Copilot Actions in Agent Workspace](https://blogs.windows.com/windows-insider/2025/11/17/copilot-on-windows-copilot-actions-begins-rolling-out-to-windows-insiders/)

### 1.1.8 Gemini 桌面任务

Gemini 的任务系统可以使用远程浏览器、远程计算环境和代码执行能力，生成或编辑 Canvas 文档；遇到密码、支付信息或其他敏感操作时，可以暂停并请求用户接管浏览器。

值得 Daily 参考的是浏览器 handoff：

```text
Agent 自动执行
    ↓
遇到登录、支付或敏感信息
    ↓
用户接管
    ↓
用户完成敏感步骤
    ↓
交还 Agent 继续
```

这比单纯的“允许/拒绝”更适合复杂浏览器任务。

官方资料：

- [Gemini Tasks and Workflows](https://support.google.com/gemini/answer/17094507?co=GENIE.Platform%3DDesktop)
- [Assign tasks in the Gemini app on Mac](https://support.google.com/gemini/answer/17208717)

### 1.1.9 Accomplish/Openwork

Accomplish（原 Openwork）是开源桌面 AI coworker，可以在用户本机完成文件管理、文档生成和浏览器任务。

值得 Daily 参考的能力：

- 本地优先执行；
- 本地文件管理；
- 文档创建；
- 浏览器自动化；
- 开源桌面 Agent 的最小运行架构。

官方资料：

- [Accomplish GitHub](https://github.com/idealistichacker/accomplish)

## 1.2 云端异步任务 Agent

| 产品 | 主要特点 | 对 Daily 最值得参考的部分 |
| --- | --- | --- |
| Genspark Super Agent | 每个项目独立云电脑，研究、分析、电话、文件生成 | 云端任务、产物面板、浏览器 handoff |
| Coze Space/扣子空间 | 项目工作区、Skills、异步后台任务、多种生成能力 | Skills 产品化、后台执行、项目空间 |
| Gemini Tasks/Agent | 远程浏览器、远程计算机、Canvas、用户接管 | 浏览器自动化和敏感步骤接管 |
| Kimi Agent/OK Computer | 云端工具、文件系统、浏览器、Office 产物、Agent Swarm | 多 Agent 分工、可下载交付物 |

### 1.2.1 Genspark Super Agent

Genspark 为任务或项目提供独立云电脑，可执行研究、内容创作、数据分析、电话和文件生成等任务，并把生成文件集中展示在输出区域。

值得 Daily 参考的能力：

- 每个任务的隔离运行环境；
- 输出文件列表；
- 文件卡片的预览与下载；
- 浏览器登录时“用户接管—交还 Agent”；
- 多 Agent 协作空间；
- 用户关闭页面后任务仍可继续执行。

官方资料：

- [Genspark Super Agent](https://www.genspark.ai/helpcenter/super-agent)
- [Genspark Super Agent for Business](https://genspark.prod.sspark.ai/business/products/super-agent)

### 1.2.2 Coze Space/扣子空间

扣子空间支持项目工作区、Skills 和长时间后台任务。生成视频、网页、云手机操作等耗时任务可以继续在后台执行，用户无需等当前任务完成后才能开始新的对话。

值得 Daily 参考的能力：

- Skill 与任务场景结合；
- 后台异步任务；
- 项目级工作区；
- 云端文件和产物管理；
- 同时开始多个独立任务；
- 不同 Agent/Skill 的任务入口。

官方资料：

- [扣子空间对话与后台任务](https://docs.coze.cn/cozespace_session)
- [扣子空间常见问题](https://docs.coze.cn/cozespace_coze_app_faq)

### 1.2.3 Gemini Tasks/Agent

Gemini Tasks 使用远程浏览器和远程计算环境完成多步骤任务，也可以在 Canvas 中创建和编辑文档。其安全设计强调在敏感步骤暂停，让用户接管浏览器。

值得 Daily 参考的能力：

- 云端运行环境；
- 远程浏览器；
- 用户接管；
- 文档 Canvas；
- 对网页中隐藏恶意指令的提示与防护；
- 浏览器任务和最终文档之间的产物关联。

官方资料：

- [Gemini Tasks and Workflows](https://support.google.com/gemini/answer/17094507?co=GENIE.Platform%3DDesktop)

### 1.2.4 Kimi Agent/OK Computer

Kimi Agent 是云端自主 Agent，可使用文件系统、浏览器、终端、代码、图片和音频生成工具，交付 Word、Excel、PPT、网页和长报告。复杂任务可使用 Agent Swarm 分解并行执行。

值得 Daily 参考的能力：

- 端到端 Office 产物；
- 任务进度可见；
- 任务结束后下载和分享；
- 多 Agent 分工；
- 文件系统、浏览器和代码工具统一编排。

官方资料：

- [Kimi Agent Overview](https://www.kimi.ai/help/agent/agent-overview)
- [Kimi Agent Features and Limits](https://www.kimi.com/en/help/agent/agent-features-and-limits)

## 1.3 企业办公与知识 Agent

| 产品 | 主要特点 | 对 Daily 最值得参考的部分 |
| --- | --- | --- |
| Microsoft 365 Copilot Researcher/Analyst | 企业文件、邮件、会议、聊天、Web，结构化引用报告 | 企业知识权限、引用、研究报告 |
| Amazon Quick | 企业数据、应用连接、Agents、自动化、文档/表格/PPT、桌面端 | 企业知识图谱、Spaces、长期 Agent |
| Gemini Enterprise/Workspace | Gmail、Drive、Docs、Sheets、Calendar 等生态 | 办公数据连接和权限继承 |
| Salesforce Agentforce | CRM 数据、业务动作、审批和企业工作流 | 结构化业务 Agent、动作权限 |
| ServiceNow AI Agents | 企业流程、工单、审批、跨系统操作 | 状态机、审批、审计和人工接管 |

### 1.3.1 Microsoft 365 Copilot Researcher/Analyst

Microsoft Researcher 会跨企业文件、邮件、会议、聊天和 Web 做多步骤研究，生成带来源的结构化报告；Analyst 更偏向数据分析。

它与 Daily 的企业决策定位高度相关，值得参考：

- 每条结论带来源；
- 继承企业已有数据权限；
- 执行前追问澄清；
- 结构化报告、图表和后续行动；
- 管理员治理；
- 不同专业 Agent 分工；
- 研究内容可继续用于文档或演示文稿。

官方资料：

- [Microsoft Copilot Researcher](https://support.microsoft.com/en-us/microsoft-365-copilot/get-started-with-researcher-in-microsoft-365-copilot)
- [Researcher Agent 产品页](https://www.microsoft.com/en-us/copilot/features/researcher-agent)

### 1.3.2 Amazon Quick

Amazon Quick 是企业级桌面与云端工作 Agent，连接文件、邮件、数据库、CRM、Jira、ServiceNow 等系统，支持创建文档、演示、表格、仪表盘、应用和自动化。

特别值得 Daily 参考：

- Shared Spaces；
- 企业知识图谱；
- 自定义专业 Agent；
- 可持续运行数天或数周的 Agent；
- 定时与事件触发自动化；
- 文档、PPT、Excel 和仪表盘产物；
- 基于企业 IAM/VPC 的治理；
- 桌面端、浏览器和移动端协作；
- 连接企业既有数据和业务应用。

官方资料：

- [Amazon Quick 功能](https://aws.amazon.com/quick/features/)
- [Amazon Quick FAQ](https://aws.amazon.com/quick/faqs/)
- [Amazon Quick Agents](https://docs.aws.amazon.com/quick/latest/userguide/working-with-agents.html)

### 1.3.3 Gemini Enterprise/Workspace

Gemini 的企业价值主要来自与 Gmail、Drive、Docs、Sheets、Calendar 和 Google Workspace 权限体系结合。

值得 Daily 参考：

- 数据权限继承；
- 邮件、日历、文档和表格连接；
- 企业搜索和研究；
- Canvas 产物；
- 管理员控制第三方应用和数据访问；
- 用户在熟悉办公应用中继续编辑结果。

### 1.3.4 Salesforce Agentforce

Salesforce Agentforce 更接近业务流程 Agent，而非通用桌面 Agent。它围绕 CRM 权限、客户数据、业务动作和审批流程运行。

值得 Daily 参考：

- Agent 的动作必须绑定结构化业务对象；
- 执行能力继承业务系统权限；
- 对写操作和高风险动作进行审批；
- 完整的执行记录和业务审计；
- Agent 失败后可以回到确定的业务状态。

### 1.3.5 ServiceNow AI Agents

ServiceNow AI Agents 重点处理企业工单、服务流程、审批和跨系统操作。

值得 Daily 参考：

- 明确的流程状态机；
- 等待审批、等待用户输入、阻塞和失败等状态；
- 人工接管；
- 对跨系统写操作留审计记录；
- 将 Agent 结果落到业务记录，而不是只留在聊天消息中。

## 1.4 开源与本地优先方向

| 产品/生态 | 定位 | 适合研究 |
| --- | --- | --- |
| Accomplish/Openwork | 开源桌面 AI coworker | 文件、浏览器和本地执行 |
| OpenClaw 生态 | 本地或服务器运行的通用 Agent 生态 | Skills、MCP、远程通道 |
| Hermes Agent/Desktop | 本地或服务器 Agent | 多执行后端、模型自选 |
| Eigent | 开源多智能体桌面工作台 | 多 Agent 编排和本地执行 |
| OpenHands | 软件开发 Agent | 沙箱、任务轨迹、恢复 |
| UFO/UFO2 | Windows AgentOS 研究项目 | 桌面应用多 Agent 编排 |

开源产品更适合研究技术架构，但不宜直接作为完整产品体验标杆。其权限治理、自动升级、企业数据合规、异常恢复和支持体系通常不如成熟商业产品完整。

## 1.5 建议重点研究的产品

如果目标是为 Daily 建立竞品坐标系，不建议同时深入研究几十个产品。建议重点关注：

1. **ChatGPT Work**：任务监督、审批、产物、Project。
2. **Claude**：Project、Artifacts、Research 和引用。
3. **WorkBuddy**：桌面权限、工作空间、Skills、任务模式。
4. **Kimi Work**：本地知识工作、并行 Agent、长任务。
5. **Microsoft Copilot Researcher**：企业知识、引用和权限继承。
6. **Amazon Quick**：企业 Spaces、自动化和长期 Agent。
7. **Manus**：云端/本地执行切换。
8. **Genspark**：云电脑、产物区和浏览器 handoff。

其中，与 Daily 产品方向最相关的参考关系是：

- Microsoft Researcher：证据可信度；
- Amazon Quick：企业空间、专业 Agent 和自动化；
- ChatGPT Work：任务监督与审批；
- Claude：项目知识、Research 与产物；
- WorkBuddy/Kimi Work：执行过程、任务模式和工作空间；
- Manus/Genspark：长任务、执行环境和用户接管。

---

# 2. Daily 智能体还缺少什么

## 2.1 总体判断

除正文流式外，Daily 当前更像“可靠的持久化聊天 + 能力选择入口”，离 GPT Work、Claude、WorkBuddy、Kimi Work 等产品所体现的“可委派、可监督、可交付”智能体形态还有五个核心闭环：

1. 任务计划与运行中干预；
2. 可验收产物；
3. 高风险操作审批；
4. 文件与多模态输入；
5. 真正可恢复的长任务。

流式输出解决的是“用户可以看到它正在回答”，而这些闭环解决的是“用户知道它在做什么、能够控制它、能够确认风险、最终能够验收结果”。

## 2.2 对标能力总表

| 能力 | GPT / Claude / WorkBuddy 等产品的成熟形态 | Daily 当前状态 | 建议优先级 |
| --- | --- | --- | --- |
| 任务目标与执行计划 | 显示目标、计划、进度和待确认事项 | 只有 queued/running/tool/completed 等粗状态 | P0 |
| 运行中追问与纠偏 | 用户可补充信息、改变方向、回答 Agent 问题 | 执行中输入框可编辑，但不能发送，只能停止 | P0 |
| 高风险操作审批 | 文件修改、联网、外部写操作前暂停确认 | 没有 approval 事件或审批 UI | P0 |
| 可验收产物 | 文档、表格、报告、文件在独立区域预览、下载、继续编辑 | 后端有 `artifactRefs` 字段，但前端没有产物展示 | P0 |
| 文件与多模态上下文 | 上传文件、图片、拖拽目录、项目文件上下文 | 附件按钮明确为“待接入” | P0 |
| 来源与可追溯性 | 引用来源、工具结果、文件依据、研究链接 | 只显示最终正文和笼统工具状态 | P0 |
| 长任务持久执行 | 关闭页面、断网或服务重启后仍能恢复或明确续接 | SSE 可重连，但后端进程重启会丢执行身份 | P0 |
| Project/Workspace | 项目指令、共享文件、知识库和相关对话 | 只有单个 Conversation，没有上层项目容器 | P1 |
| 记忆与个性化 | 用户偏好、项目记忆、历史会话检索 | 有会话历史上下文，但没有可管理的长期记忆 | P1 |
| 会话和任务管理 | 搜索、置顶、归档、分享、跨设备继续 | 已有列表、重命名、删除；其余不完整 | P1 |
| 并行任务与通知 | 多任务同时执行，后台完成后通知 | 一个 Conversation 只允许一个活动 Turn，缺少任务总览 | P1 |
| Ask/Plan/Agent 模式 | 只问答、先计划后执行、直接执行 | 只有一种执行模式 | P1 |
| 使用量和成本透明度 | 时间、模型、工具、配额或成本提示 | 没有面向用户的运行统计 | P2 |
| 本地文件、浏览器和桌面应用操作 | 桌面端读写文件、操作浏览器和应用 | Daily 目前是 Web Agent，不具备桌面执行环境 | P2，取决于产品定位 |
| 定时与远程控制 | 定时任务、手机审批、跨端继续 | 没有 | P2 |
| 多智能体协作 | 并行子任务、专家团队 | 没有 | P2，不建议早做 |

## 2.3 P0：流式之后最应该建设的能力

### 2.3.1 从“活动状态”升级为“任务计划”

现在 Daily 只能显示类似：

```text
正在准备…
正在处理…
正在使用工具…
已完成 N 个步骤
```

这对排查技术状态够用，但用户不知道：

- Agent 理解的目标是什么；
- 打算分几步完成；
- 当前正在完成哪一步；
- 是否偏离目标；
- 哪一步失败了；
- 还需要用户提供什么。

建议引入公开、非思维链的计划协议：

```ts
type TaskPlan = {
  goal: string;
  steps: Array<{
    stepId: string;
    title: string;
    status:
      | "pending"
      | "running"
      | "completed"
      | "blocked"
      | "failed"
      | "skipped";
  }>;
};
```

对应公共事件：

```text
plan.created
plan.step.started
plan.step.completed
plan.step.blocked
plan.updated
```

这不是暴露 chain-of-thought，而是展示“可以向用户承诺的执行计划”。

WorkBuddy 已提供 Agent、Plan、Ask 三种工作模式，其中 Plan 模式会先给出方案，等待用户确认后再执行；GPT Work 也强调展示进度、等待信息或审批，并允许用户中途改变方向。

参考资料：

- [WorkBuddy 任务模式](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Task-Bar)
- [ChatGPT Work 使用指南](https://learn.chatgpt.com/docs/get-started-with-work)

### 2.3.2 运行中追问、补充和纠偏

当前 Composer 在运行时将发送按钮变成停止按钮，Enter 也不会发送。用户可以在输入框输入文字，但不能把补充要求发送给正在运行的 Turn。

代码证据：`src/components/chat/composer.tsx:46-55`、`:111-121`。

应该支持两类运行中输入：

- `steer`：补充约束，影响正在运行的 Turn；
- `answer_required`：回答 Agent 主动提出的问题。

例如：

```text
Agent：需要按哪个时间范围统计？
[最近 24 小时] [最近 7 天] [自定义]
```

建议增加事件：

```text
input.required
input.received
turn.steered
```

第一阶段可以只在安全 checkpoint 接受 steer，不必承诺在任意 token 或工具执行中点即时改变模型行为。

### 2.3.3 建立产物区，而不只是聊天正文

GPT Work 强调创建并检查文档、表格、图片等真实输出；Claude Artifacts 使用对话旁的独立窗口展示和修改文档、代码、图表或网页；WorkBuddy 将文件、链接和 MCP UI 放入右侧结果区。

Daily 已经有后端起点：Conversation Message Schema 包含 `artifactRefs`，但 `src/features/chat/session/daily-session-adapter.ts` 只投影正文和能力快照，没有展示 artifacts。

建议形成：

```text
对话区              产物区
──────────          ──────────
运行过程            风险分析报告.pdf
最终摘要            数据表.xlsx
来源说明            地图截图.png
                    [预览] [下载] [另存]
```

第一阶段至少支持：

- 产物名称、类型、大小和生成状态；
- 安全下载；
- Markdown/PDF/图片预览；
- 失败产物显式报错；
- 消息与产物的 `turnId/messageId` 关联；
- 重新生成不能静默覆盖旧版本；
- 产物生成中、完成、失败事件；
- 历史刷新后产物仍然存在。

参考资料：

- [ChatGPT 桌面端](https://learn.chatgpt.com/docs/app)
- [Claude Artifacts](https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- [WorkBuddy 任务对话](https://www.workbuddy.cn/docs/workbuddy/Conversation)

### 2.3.4 Approval 与权限闭环

这是 Daily 成为“能够做事的 Agent”之前最重要的安全能力。

GPT Work 对文件、命令、网络和桌面应用采用权限与审批边界；WorkBuddy 以工作空间作为默认权限边界，超出范围或执行高风险操作时暂停确认，并允许单独禁用工具和 MCP 服务。

Daily 当前的知识库、Skill、MCP 选择解决的是“本轮允许哪些能力”，但没有解决“能力准备执行某个有副作用的动作时，由谁批准”。

建议协议：

```ts
type ApprovalRequest = {
  approvalId: string;
  turnId: string;
  actionKind:
    | "external_write"
    | "file_write"
    | "notification"
    | "high_risk_tool";
  title: string;
  safeSummary: string;
  expiresAt?: string;
};
```

事件与命令：

```text
approval.required
approval.approved
approval.rejected
approval.expired
```

需要保证：

- 审批前不能执行副作用；
- 重放事件不能重复执行；
- approval 必须绑定 Turn、工具调用和权限快照；
- UI 不展示密钥、完整参数或敏感内容；
- 拒绝后 Agent 能调整方案，而不是整轮卡死；
- 审批人、审批时间和最终执行结果可审计；
- 过期 approval 不得被旧页面误批准。

参考资料：

- [ChatGPT Permissions](https://learn.chatgpt.com/docs/permission-modes?site_variant=chatgpt&translationFallback=zh-Hans)
- [WorkBuddy 权限与安全沙箱](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Permission-Modes)

### 2.3.5 文件和多模态输入

当前附件按钮明确禁用并显示“附件（待接入）”。

代码证据：`src/components/chat/composer.tsx:59-68`。

Claude Projects 支持文档、表格和项目知识；WorkBuddy 支持拖拽文件、图片、PDF、Word、Excel、PPT 和压缩包等；GPT Work 可以使用上传文件、项目来源，以及在桌面端使用获批的本地文件。

Daily 不应一开始追求“任意本地文件夹访问”，但应该先支持受控上传：

- PDF、DOCX、XLSX、CSV、图片；
- 上传进度、取消、失败重试；
- 文件大小、类型和数量限制；
- 病毒和恶意内容扫描；
- 文件的 conversation/turn 归属；
- 删除、过期和权限语义；
- 模型究竟读取了哪些文件的可见提示；
- 文件内容被 Skill/MCP 使用时的权限继承；
- 文件处理失败时不把原始内容写入错误日志。

参考资料：

- [Claude 文件支持](https://support.anthropic.com/en/articles/8241126-what-kinds-of-documents-can-i-upload-to-claude-ai)
- [WorkBuddy 文件输入](https://www.workbuddy.cn/docs/workbuddy/Conversation)
- [ChatGPT Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)

### 2.3.6 来源、引用和证据链

Daily 面向决策和企业知识场景，这项能力甚至比模型选择更重要。

当前只能看到“使用了工具”或最终正文，不知道：

- 使用了哪个知识库文档；
- 哪个结论来自哪条记录；
- 数据时间是什么；
- 来源是否过期；
- 工具失败后是否使用了降级信息；
- 同一结论是否有多个来源相互印证。

Claude Research 会给出可检查引用；GPT/Claude Projects 都强调把项目来源作为回答依据；Microsoft Researcher 也把引用作为可信研究报告的核心组成。

建议 assistant message 支持：

```ts
type Citation = {
  citationId: string;
  title: string;
  sourceKind: "knowledge" | "web" | "database" | "file";
  locator?: string;
  capturedAt?: string;
  excerpt?: string;
};
```

正文使用稳定引用标记，例如 `[1]`，在消息下方统一展示来源卡片。引用必须由工具、检索层或数据连接器提供证据，不能让模型凭空生成 URL。

参考资料：

- [Claude Research](https://support.anthropic.com/en/articles/11088861-using-research-on-claude-ai)
- [Claude Projects](https://support.anthropic.com/en/articles/9517075-what-are-projects)
- [Microsoft Researcher](https://support.microsoft.com/en-us/microsoft-365-copilot/get-started-with-researcher-in-microsoft-365-copilot)

### 2.3.7 真正可恢复的长任务

Daily 当前 SSE 重连设计较完整，但它解决的是“客户端断开”，不是“执行进程死亡”。

现有 Conversation Schema 明确说明只支持一个 agent-api 实例；进程重启后登录和执行句柄会丢失，旧任务失败或中断，不会重放执行。

代码证据：`src/features/chat/conversation/contracts/schema/conversation.v1.json:8308`。

相比之下，GPT Work 区分 Cloud/Local，Cloud 任务可以在关闭桌面端后继续，并支持跨设备查看；WorkBuddy 支持多个任务同时运行并从侧栏查看进度；Genspark 的云端任务也不依赖用户持续打开当前页面。

Daily 后续需要：

- durable job queue；
- 执行身份可恢复或明确重新授权；
- worker 与 API 分离；
- lease 接管；
- checkpoint 或步骤级恢复；
- 完成、失败、等待审批通知；
- 不依赖浏览器保持打开；
- 服务重启后不把运行中任务永久留在 unknown 状态；
- 保证恢复不会重复执行已有副作用；
- 记录最终是继续、重试还是重新执行。

参考资料：

- [ChatGPT Cloud/Local Work](https://learn.chatgpt.com/docs/use-chatgpt)
- [WorkBuddy 多任务](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Task-Bar)

## 2.4 P1：形成长期工作空间

### 2.4.1 Project/Workspace 层

Conversation 不是 Project。建议层次变为：

```text
Project
├─ 项目指令
├─ 固定知识库、Skill、MCP
├─ 项目文件与来源
├─ 成员与权限
└─ Conversations
```

ChatGPT Projects 和 Claude Projects 都把文件、项目指令和相关聊天组织在一起；Claude 在项目知识接近上下文限制时会自动使用 RAG。

对 Daily 来说，Project 比全局用户记忆更安全，也更符合企业数据隔离。需要明确：

- Project 指令的优先级；
- Project 与 Conversation 的能力快照；
- 文件、知识库和成员权限；
- 项目归档和删除；
- 项目内搜索；
- 项目之间不能泄漏上下文；
- 项目指令变更不能静默改变历史 Turn 的解释。

参考资料：

- [ChatGPT Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)
- [Claude Projects/RAG](https://support.anthropic.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects)

### 2.4.2 可管理的记忆

建议把记忆分成三层，不能混成一个不可见黑盒：

- Conversation memory：当前对话；
- Project memory：项目事实、术语、决策和偏好；
- User preferences：语言、格式和常用区域等个人偏好。

每条记忆应可查看、修改、删除，并记录来源。Claude 提供历史聊天检索、项目指令和偏好；WorkBuddy 提供本地记忆和记忆管理。

不建议第一阶段自动从所有聊天提取永久记忆。应优先实现 Project-scoped 且由用户确认保存的记忆，避免错误事实长期污染后续任务。

参考资料：

- [Claude 个性化](https://support.anthropic.com/en/articles/10185728-understanding-claude-s-personalization-features)
- [WorkBuddy Memory](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/System-Settings)

### 2.4.3 任务中心与通知

当前 Conversation 列表不等于任务中心。任务中心至少应显示：

- running；
- waiting approval；
- waiting input；
- completed；
- failed；
- interrupted；
- 开始时间和持续时间；
- 当前步骤；
- 产物数量；
- 是否需要用户处理；
- 置顶、搜索和归档；
- 完成、失败和需要审批时的通知。

WorkBuddy 支持任务置顶、分享、独立窗口、归档和批量操作；GPT 桌面端强调并行项目、长任务和通知。

参考资料：

- [WorkBuddy 任务管理](https://www.workbuddy.cn/docs/workbuddy/Task-Management)
- [ChatGPT 桌面端](https://learn.chatgpt.com/docs/app)

### 2.4.4 Ask/Plan/Agent 模式

建议把任务的自主程度做成显式模式，而不是让用户靠提示词猜测：

| 模式 | 行为 |
| --- | --- |
| Ask | 只回答、分析和建议，不执行有副作用的动作 |
| Plan | 先生成公开计划，用户确认后再执行 |
| Agent | 在权限和审批边界内直接执行 |

模式必须影响后端能力，而不仅是前端标签。Ask 模式应从服务端阻止写工具；Plan 模式在批准前不得执行；Agent 模式仍然受高风险 approval 控制。

### 2.4.5 并行任务

并行能力应首先实现“多个独立 Conversation/Task 并行”，而不是立刻实现复杂的多智能体内部协作。

需要解决：

- 每个任务独立状态和取消信号；
- 相同资源的写冲突；
- 每用户和每租户并发上限；
- 任务优先级；
- 公平调度；
- 任务中心中的统一通知；
- 防止两个 Agent 同时覆盖同一产物或业务记录。

## 2.5 P2：取决于 Daily 的最终产品定位

下面这些是通用桌面 Agent 的优势，但不应抢在 P0 能力之前：

- 本地文件夹读写；
- 内置浏览器或 Computer Use；
- 操作邮件、日历和桌面应用；
- 定时任务；
- 手机远程控制；
- 多智能体团队；
- 任意模型切换；
- 自定义本地 MCP 安装；
- 语音发起和控制任务。

GPT Work 可以使用本地文件、应用和浏览器；Claude Desktop 支持本地扩展和远程 connectors；WorkBuddy 支持工作空间、连接器、Skills、本地文件操作和远程助理；Kimi Work、Manus 和 Perplexity Personal Computer 也在强化本地执行。

参考资料：

- [ChatGPT Work 本地能力](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security)
- [Claude Desktop Extensions](https://support.anthropic.com/en/articles/10065433-installing-claude-for-desktop)
- [WorkBuddy Assistant](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Assistant-Remote-Control)
- [Kimi Work](https://www.kimi.ai/help/kimi-work/overview)
- [Manus My Computer](https://manus.im/blog/manus-my-computer-desktop)

对 Daily，不建议立即复制所有桌面能力。Daily 的差异化更可能是：

> 企业知识和专业工具驱动的、证据可追溯、权限可控制、结果可验收的决策智能体。

## 2.6 推荐的产品实施顺序

```text
1. 正文真实流式
2. 任务计划 + 运行中追问/纠偏
3. Approval 协议与 UI
4. 产物面板 + 下载/预览
5. 文件上传与多模态输入
6. 引用与证据链
7. Durable 后台执行与恢复
8. Project/Workspace
9. 记忆、任务中心、并行与通知
10. 再决定是否做本地桌面控制和多智能体
```

如果流式之后只能选择一组能力，建议优先建设：

> **任务计划 + Approval + 产物交付的最小闭环。**

原因是：

- 任务计划让用户知道 Agent 准备做什么；
- Approval 让用户可以控制高风险动作；
- 产物交付让用户能够验收最终结果。

这三项共同把 Daily 从“会回答的聊天界面”推进到“可以安全委派工作的智能体”。

## 2.7 建议的目标产品形态

Daily 不必成为所有桌面应用的通用遥控器。更合适的目标形态是：

```text
企业 Project/Workspace
        ↓
用户提出决策或执行目标
        ↓
Agent 给出公开计划
        ↓
知识库 / Skill / MCP / 文件提供证据和工具
        ↓
高风险动作请求 Approval
        ↓
任务可暂停、纠偏、恢复和后台运行
        ↓
交付带引用的正文、报告、数据表或其他产物
        ↓
结果、来源、审批和执行记录可审计
```

该形态更接近 Microsoft Researcher 的可信研究、Amazon Quick 的企业空间、ChatGPT Work 的任务监督、Claude 的 Project/Artifact，以及 WorkBuddy/Kimi Work 的执行工作台，而不是单纯复制任一产品的界面。

---

# 3. 总结

类似 Agent 产品已经从“聊天”分化成四条路线：

1. **桌面通用 Agent**：强调本地文件、浏览器、应用和工作空间。
2. **云端异步 Agent**：强调云电脑、后台任务、跨设备和文件交付。
3. **企业办公与知识 Agent**：强调权限继承、企业数据、引用、审计和业务动作。
4. **开源本地 Agent**：强调可部署、可扩展、多模型和本地控制。

Daily 最适合走第三条路线，并吸收第一、第二条路线中任务监督、产物交付和长任务恢复的成熟设计。

流式输出是必要的交互基础，但它不是智能体能力闭环。真正决定 Daily 是否成熟的是：

- 能否把目标转成用户可理解的计划；
- 能否在需要时追问、暂停和接受纠偏；
- 能否在副作用前请求审批；
- 能否利用文件和企业知识形成证据链；
- 能否交付可下载、可预览、可继续使用的成果；
- 能否在断线、重启和长时间运行后保持正确状态；
- 能否让每个结论、动作和产物都可追溯、可审计。
