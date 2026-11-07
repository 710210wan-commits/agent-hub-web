import { describe, expect, it, vi } from "vitest";

import { verifyArtifactDownload } from "./artifact-download";

describe("artifact download integrity", () => {
  it("requires the byte hash, response header, and publication hash to match", async () => {
    const digest = vi.fn().mockResolvedValue("a".repeat(64));
    await expect(verifyArtifactDownload(
      { blob: new Blob(["zip"]), fileName: "demo.zip", sha256: "a".repeat(64) },
      "a".repeat(64),
      digest,
    )).resolves.toMatchObject({ fileName: "demo.zip" });
    expect(digest).toHaveBeenCalledOnce();
  });

  it("rejects a mismatched artifact before saving it", async () => {
    await expect(verifyArtifactDownload(
      { blob: new Blob(["tampered"]), fileName: "demo.zip", sha256: "a".repeat(64) },
      "a".repeat(64),
      vi.fn().mockResolvedValue("b".repeat(64)),
    )).rejects.toMatchObject({ code: "SKILL_MARKET_ARTIFACT_HASH_MISMATCH" });
  });
});
