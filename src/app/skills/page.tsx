import { ResourcePageTemplate } from "@/components/resources/resource-page-template";
import { AppShell } from "@/components/shell/app-shell";
import { skillFixtures } from "@/config/resource-fixtures";

export default function SkillsPage() {
  return <AppShell title="Skill"><ResourcePageTemplate createLabel="新建 Skill" description="管理智能体可调用的专业能力" detailBasePath="/skills" items={skillFixtures} title="Skill" /></AppShell>;
}
