export type AppMode = "daily" | "work";

export function parseMode(value: string | null): AppMode {
  return value === "work" ? "work" : "daily";
}

export function withMode(pathname: string, mode: AppMode): string {
  const url = new URL(pathname, "https://agent-hub.local");
  url.searchParams.set("mode", mode);
  return `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
}
