import { describe, expect, it } from "vitest";

import { parseGisProfile, withGisProfile } from "./gis-profiles";
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

describe("GIS profile helpers", () => {
  it.each([
    ["standard", "standard"],
    ["demo", "demo"],
    [null, "standard"],
    ["daily", "standard"],
    ["work", "standard"],
  ] as const)("parses %s as %s", (value, expected) => {
    expect(parseGisProfile(value)).toBe(expected);
  });

  it("preserves unrelated query parameters and removes chat mode semantics", () => {
    expect(withGisProfile("/gis?mode=work&panel=open", "demo")).toBe(
      "/gis?panel=open&profile=demo",
    );
  });
});
