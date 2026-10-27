import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

export function ResourceCard({ href, name, description, meta }: { href: string; name: string; description: string; meta?: string }) {
  return (
    <Link className="resource-card" href={href}>
      <span className="resource-card-copy">
        <strong>{name}</strong>
        <span>{description}</span>
        {meta ? <small>{meta}</small> : null}
      </span>
      <ArrowUpRight aria-hidden="true" size={16} />
    </Link>
  );
}
