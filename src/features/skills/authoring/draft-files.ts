const MAX_ZIP_BYTES = 25 * 1024 * 1024;

export function validateZipFile(file: File): string | undefined {
  if (!file.name.toLowerCase().endsWith(".zip")) return "请选择 ZIP 文件。";
  if (file.size === 0) return "ZIP file is empty.";
  if (file.size > MAX_ZIP_BYTES) return "ZIP 文件不能超过 25 MB。";
  return undefined;
}

export async function buildDirectoryFiles(
  files: readonly File[],
  read: (file: File) => Promise<string> = readFileAsText,
): Promise<Record<string, string>> {
  const entries = await Promise.all(files.map(async (file) => {
    const path = file.webkitRelativePath || file.name;
    return [path, await read(file)] as const;
  }));
  return Object.fromEntries(entries);
}

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")), { once: true });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("无法读取文件。")), { once: true });
    reader.readAsText(file);
  });
}
