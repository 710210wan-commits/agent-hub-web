"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  parseGisProfile,
  withGisProfile,
  type GisProfile,
} from "@/config/gis-profiles";

const options: Array<{ value: GisProfile; label: string }> = [
  { value: "standard", label: "标准" },
  { value: "demo", label: "演示" },
];

export function GisProfileSwitch() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const profile = parseGisProfile(searchParams.get("profile"));

  return (
    <div aria-label="GIS 场景" className="mode-switch">
      {options.map((option) => (
        <button
          aria-pressed={profile === option.value}
          className={profile === option.value ? "is-active" : undefined}
          key={option.value}
          onClick={() => {
            const current = `${pathname}?${searchParams.toString()}`;
            router.replace(withGisProfile(current, option.value));
          }}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
