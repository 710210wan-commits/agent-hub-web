import { describe, expect, it } from "vitest";

import { parseMode, withMode } from "./modes";

describe("mode helpers", () => {
  it.each([
    ["daily", "daily"],
    ["work", "work"],
    [null, "daily"],
    ["unknown", "daily"],
  ] as const)("parses %s as %s", (value, expected) => {
    expect(parseMode(value)).toBe(expected);
  });

  it("preserves unrelated query parameters", () => {
    expect(withMode("/chat?panel=open", "work")).toBe(
      "/chat?panel=open&mode=work",
    );
  });
});
