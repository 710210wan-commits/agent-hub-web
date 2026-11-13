import { describe, expect, it } from "vitest";

import { parseMode, withMode } from "./modes";

describe("mode helpers", () => {
  it.each([
    ["daily", "daily"],
    ["1", "daily"],
    ["2", "work"],
    ["work", "work"],
    [null, "daily"],
    ["unknown", "daily"],
  ] as const)("parses %s as %s", (value, expected) => {
    expect(parseMode(value)).toBe(expected);
  });

  it("preserves unrelated query parameters", () => {
    expect(withMode("/chat?panel=open", "work")).toBe(
      "/chat?panel=open&mode=2",
    );
  });
  it("overwrites only the mode and preserves conversation/query/hash data", () => {
    expect(withMode("/chat?mode=1&conversation=abc&panel=open#answer", "work")).toBe("/chat?mode=2&conversation=abc&panel=open#answer");
  });

});
