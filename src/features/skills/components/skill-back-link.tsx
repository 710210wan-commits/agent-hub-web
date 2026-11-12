import Link from "next/link";
import type { ReactNode } from "react";

/** Skill 各子页面统一的返回入口：左上角、灰色（.back-link），与 Creator 返回链接一致。 */
export function SkillBackLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link className="back-link" href={href}>
      ← {children}
    </Link>
  );
}
