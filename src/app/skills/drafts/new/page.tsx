import { AppShell } from "@/components/shell/app-shell";
import { SkillDraftCreate } from "@/features/skills/authoring/skill-draft-create";

export default function SkillDraftCreatePage() {
  return <AppShell title="上传 Skill 草稿"><SkillDraftCreate /></AppShell>;
}
