import type { WorkSkill } from "./contracts";

/** 推荐安装的远程 Skill 目录（与原 Vue RECOMMENDED_SKILLS 一致，来源为 ModelScope 仓库）。 */
export interface RecommendedSkill {
  aliases: string[];
  description: string;
  name: string;
  slug: string;
  source: string;
}

export const WORK_RECOMMENDED_SKILLS: RecommendedSkill[] = [
  {
    slug: "skill-creator",
    name: "skill-creator",
    description:
      "创建、维护和改进 Agent Skill，适合编写 SKILL.md、设计使用流程、整理依赖与优化技能说明。",
    source: "https://modelscope.cn/skills/@anthropics/skill-creator",
    aliases: ["skill-creator", "Skill Creator"],
  },
  {
    slug: "frontend-design",
    name: "frontend-design",
    description:
      "提供前端界面与交互设计建议，适合规划页面结构、组件状态、响应式布局和可访问性细节。",
    source: "https://modelscope.cn/skills/@anthropics/frontend-design",
    aliases: ["frontend-design", "Frontend Design"],
  },
  {
    slug: "docx",
    name: "docx",
    description: "读取、编辑和生成 Word DOCX 文档，适合处理正文、表格、批注、样式和文档结构化内容。",
    source: "https://modelscope.cn/skills/@anthropics/docx",
    aliases: ["docx", "DOCX"],
  },
  {
    slug: "xlsx",
    name: "xlsx",
    description: "读取、分析和生成 Excel XLSX 表格，适合处理多工作表数据、公式结果、统计汇总和结构化导出。",
    source: "https://modelscope.cn/skills/@anthropics/xlsx",
    aliases: ["xlsx", "XLSX"],
  },
  {
    slug: "pdf",
    name: "pdf",
    description: "读取、提取和分析 PDF 文档内容，适合从报告、论文、合同等文件中整理要点、定位证据并生成摘要。",
    source: "https://modelscope.cn/skills/@anthropics/pdf",
    aliases: ["pdf", "PDF"],
  },
];

/** 推荐列表过滤掉已安装（slug 或 name 命中任一 alias，忽略大小写）。 */
export function filterInstalledRecommended(
  recommended: readonly RecommendedSkill[],
  installed: readonly WorkSkill[],
): RecommendedSkill[] {
  const installedKeys = new Set(
    installed.flatMap((skill) => [skill.slug, skill.name]).map((value) => value.toLowerCase()),
  );
  return recommended.filter(
    (item) => !item.aliases.some((alias) => installedKeys.has(alias.toLowerCase())),
  );
}

/** 在远程仓库结果中按 alias 匹配推荐 Skill（与原 Vue 行为一致）。 */
export function matchRecommendedOption(
  recommendation: RecommendedSkill,
  options: readonly { name: string }[],
): { name: string } | undefined {
  if (options.length === 0) return undefined;
  if (options.length === 1) return options[0];
  const aliasSet = new Set(recommendation.aliases.map((alias) => alias.toLowerCase()));
  return options.find((option) => aliasSet.has(String(option.name || "").toLowerCase()));
}
