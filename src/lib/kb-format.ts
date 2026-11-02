/** 知识库页面使用的轻量格式化工具，缺失或非法值统一显示为“—”。 */

export function formatKbBytes(bytes?: number | null): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatKbCount(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString("zh-CN");
}

export function formatKbDateTime(value?: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
