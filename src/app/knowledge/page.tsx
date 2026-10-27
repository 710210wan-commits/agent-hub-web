import { AppShell } from "@/components/shell/app-shell";
import { ResourcePageTemplate } from "@/components/resources/resource-page-template";
import { knowledgeFixtures } from "@/config/resource-fixtures";

export default function KnowledgePage() {
  return <AppShell title="知识库"><ResourcePageTemplate createLabel="新建知识库" description="管理对话可选的知识来源" detailBasePath="/knowledge" items={knowledgeFixtures} title="知识库" /></AppShell>;
}
