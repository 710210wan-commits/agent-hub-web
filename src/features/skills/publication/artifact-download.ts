import type { SkillMarketDownloadViewModel } from "../api/client";
import { SkillMarketError } from "../contracts/error";

type Digest = (blob: Blob) => Promise<string>;

export async function verifyArtifactDownload(
  download: SkillMarketDownloadViewModel,
  publicationHash: string,
  digest: Digest = sha256Blob,
): Promise<SkillMarketDownloadViewModel> {
  const byteHash = await digest(download.blob);
  if (byteHash !== download.sha256 || byteHash !== publicationHash) {
    throw new SkillMarketError({
      area: "publication",
      code: "SKILL_MARKET_ARTIFACT_HASH_MISMATCH",
      presentation: "conflict",
      recovery: "retry",
      retryable: true,
      status: 409,
      userMessage: "Artifact 完整性校验失败，文件未保存。",
    });
  }
  return download;
}

export async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function saveArtifact(download: SkillMarketDownloadViewModel): void {
  const url = URL.createObjectURL(download.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = download.fileName;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}
