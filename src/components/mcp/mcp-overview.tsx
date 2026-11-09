import { ArrowRight, Cable, Check, ChevronDown, KeyRound, ListChecks, MapPinned, Plus, Search, Server, ShieldCheck, SlidersHorizontal, Terminal, Unplug, Workflow, Zap } from "lucide-react";
import styles from "./mcp-overview.module.css";

const services = [
  { name: "本地示例服务", subtitle: "自建服务 · 验证基础调用", icon: Server, tone: "blue", transport: "本地进程 · stdio", description: "使用预设数据，验证服务连接、工具发现和参数传递。", tools: ["数据查询", "示例结果"], credential: "无需访问凭证", status: "待检测" },
  { name: "地图导航服务", subtitle: "外部服务 · 验证远程接入", icon: MapPinned, tone: "green", transport: "远程连接 · HTTP", description: "查询地点、规划路线，验证外部服务的接入与授权。", tools: ["地点搜索", "路线规划"], credential: "需要配置访问凭证", status: "待配置" },
];
const steps = [
  { icon: Plus, title: "添加与配置", text: "填写名称、连接方式和地址，保存服务配置。" },
  { icon: Zap, title: "检测与发现", text: "测试连接，获取服务实际提供的工具和参数。" },
  { icon: Terminal, title: "工具试调用", text: "填写参数，查看返回结果、耗时或失败原因。" },
  { icon: Workflow, title: "交给 Agent 使用", text: "在对话中选择服务，由后端按授权调用工具。" },
];

export function McpOverview() {
  return <section className={styles.page}>
    <header className={styles.heading}>
      <div><div className={styles.eyebrow}>能力中心 / MCP</div><h1>MCP 服务管理</h1><p>集中接入外部工具，让智能体按需使用专业能力。</p></div>
      <button className={styles.primary} disabled><Plus size={16} />添加服务</button>
    </header>
    <div className={styles.steps}>{steps.map((step, i) => <article key={step.title}><div className={styles.stepTop}><step.icon size={18} /><span>0{i + 1}</span></div><h2>{step.title}</h2><p>{step.text}</p></article>)}</div>
    <div className={styles.sectionHeading}><div><h2>服务库 <span>2 个示例</span></h2><p>管理连接配置，查看工具，并控制服务的使用范围。</p></div><span className={styles.smallNote}>支持本地与远程服务</span></div>
    <div className={styles.toolbar}><div className={styles.tabs}><span className={styles.active}>全部服务</span><span>已启用</span><span>待配置</span></div><div className={styles.search}><Search size={15} /><span>搜索服务名称</span></div><button disabled className={styles.filter}><SlidersHorizontal size={15} />筛选</button></div>
    <div className={styles.services}>{services.map(service => <article key={service.name} className={styles.card}>
      <div className={styles.cardHeading}><div className={`${styles.serviceIcon} ${service.tone === "green" ? styles.green : ""}`}><service.icon size={24} /></div><div><h3>{service.name}</h3><p>{service.subtitle}</p></div><span className={styles.status}>{service.status}</span></div>
      <p className={styles.description}>{service.description}</p>
      <div className={styles.metadata}><span><Cable size={14} />{service.transport}</span><span><KeyRound size={14} />{service.credential}</span></div>
      <div className={styles.toolRow}><span>示例工具</span>{service.tools.map(tool => <b key={tool}>{tool}</b>)}</div>
      <div className={styles.cardBottom}><button disabled><Zap size={14} />测试连接</button><button disabled>编辑配置</button><div className={styles.enable}><span>启用服务</span><button disabled aria-label={`启用${service.name}`} className={styles.switch}><i /></button></div></div>
    </article>)}</div>
    <div className={styles.lower}>
      <section className={styles.panel}><div className={styles.panelTitle}><Terminal size={18} /><h2>工具试调用</h2><span>规划功能</span></div><p className={styles.panelIntro}>不需要先运行智能体，也能单独验证工具是否可用。</p><div className={styles.demoFields}><div><label>选择服务</label><span>本地示例服务<ChevronDown size={14} /></span></div><div><label>选择工具</label><span>数据查询<ChevronDown size={14} /></span></div></div><div className={styles.callFlow}><span>填写参数</span><ArrowRight size={15}/><span>执行工具</span><ArrowRight size={15}/><span>查看结果 / 错误</span></div><div className={styles.emptyResult}><Terminal size={19}/><span>接入后，这里展示真实调用结果</span></div></section>
      <section className={styles.panel}><div className={styles.panelTitle}><ShieldCheck size={18}/><h2>配置与使用规则</h2></div><ul className={styles.rules}><li><Check size={15}/><div><strong>配置可以保存</strong><span>刷新或重启后，保留已添加的服务。</span></div></li><li><KeyRound size={15}/><div><strong>凭据由后端保管</strong><span>服务列表不展示完整密钥或 Token。</span></div></li><li><ListChecks size={15}/><div><strong>按工具授权</strong><span>可以连接服务，不等于所有工具都允许调用。</span></div></li><li><Unplug size={15}/><div><strong>停用后停止新调用</strong><span>启用状态与最近连接检测结果分别展示。</span></div></li></ul></section>
    </div>
    <footer className={styles.footer}><span>对接方式</span><b>MCP 管理页面</b><ArrowRight size={14}/><b>统一后端接口</b><ArrowRight size={14}/><b>服务连接与工具执行</b><span className={styles.footerNote}>Agent 共用服务目录 · 工作流接口后续预留</span></footer>
  </section>;
}
