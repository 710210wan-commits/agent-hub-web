import { AppShell } from "@/components/shell/app-shell";
import { SkillReviewDetail } from "@/features/skills/review/skill-review-detail";

export default async function SkillReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell title="Skill 审核详情"><SkillReviewDetail id={id} /></AppShell>;
}
