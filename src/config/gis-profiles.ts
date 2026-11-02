export type GisProfile = "standard" | "demo";

export function parseGisProfile(value: string | null): GisProfile {
  return value === "demo" ? "demo" : "standard";
}

export function withGisProfile(
  pathname: string,
  profile: GisProfile,
): string {
  const url = new URL(pathname, "https://agent-hub.local");
  url.searchParams.delete("mode");
  url.searchParams.set("profile", profile);
  return `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
}
