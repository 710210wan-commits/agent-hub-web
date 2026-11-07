import { AppShell } from "@/components/shell/app-shell";
import { SkillReviewQueue } from "@/features/skills/review/skill-review-queue";

export default function SkillReviewPage() {
  return <AppShell title="Skill 审核"><SkillReviewQueue /></AppShell>;
}
