export type AppMode = "daily" | "work";

export function parseMode(value: string | null): AppMode {
  return value === "work" || value === "2" ? "work" : "daily";
}

export function serializeMode(mode: AppMode): "1" | "2" {
  return mode === "work" ? "2" : "1";
}

export function withMode(pathname: string, mode: AppMode): string {
  const url = new URL(pathname, "https://agent-hub.local");
  url.searchParams.set("mode", serializeMode(mode));
  return `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
}
