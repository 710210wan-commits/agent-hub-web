export interface ResourceFixture {
  id: string;
  name: string;
  description: string;
  meta: string;
}

export const knowledgeFixtures: ResourceFixture[] = [
  { id: "project", name: "项目资料库", description: "项目背景、交付物与会议资料", meta: "12 个文档" },
  { id: "policy", name: "政策规范库", description: "政策、制度与行业规范", meta: "28 个文档" },
  { id: "internal", name: "内部问答资料", description: "常见问题与内部知识沉淀", meta: "18 个文档" },
];

export const skillFixtures: ResourceFixture[] = [
  { id: "risk", name: "风险分析", description: "识别项目风险并生成结构化建议", meta: "内置 Skill" },
  { id: "report", name: "报告生成", description: "按模板整理材料并生成报告草稿", meta: "内置 Skill" },
];

export const mcpFixtures: ResourceFixture[] = [
  { id: "weather", name: "天气数据", description: "查询指定地区的天气信息", meta: "MCP 服务" },
  { id: "internal-data", name: "内部数据服务", description: "访问受控的内部业务数据", meta: "MCP 服务" },
];

export const historyFixtures = [
  { id: "h-1", title: "项目周报整理", summary: "整理本周进展、风险与下周计划", time: "今天 10:24" },
  { id: "h-2", title: "政策条款解释", summary: "结合知识库说明条款适用范围", time: "昨天 16:08" },
] as const;
