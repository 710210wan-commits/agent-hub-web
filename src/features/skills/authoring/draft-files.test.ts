import { describe, expect, it } from "vitest";

import { buildDirectoryFiles, validateZipFile } from "./draft-files";

describe("draft upload helpers", () => {
  it("preserves relative directory paths", async () => {
    const first = new File(["one"], "one.md", { type: "text/markdown" });
    const second = new File(["two"], "two.md", { type: "text/markdown" });
    Object.defineProperty(first, "webkitRelativePath", { value: "demo/one.md" });
    Object.defineProperty(second, "webkitRelativePath", { value: "demo/nested/two.md" });

    await expect(buildDirectoryFiles([first, second], async (file) => file.name)).resolves.toEqual({
      "demo/nested/two.md": "two.md",
      "demo/one.md": "one.md",
    });
  });

  it("rejects empty and non-zip archive selections", () => {
    expect(validateZipFile(new File([], "demo.zip"))).toMatch(/empty/i);
    expect(validateZipFile(new File(["x"], "demo.txt"))).toMatch(/ZIP/i);
    expect(validateZipFile(new File(["x"], "demo.zip"))).toBeUndefined();
  });
});
