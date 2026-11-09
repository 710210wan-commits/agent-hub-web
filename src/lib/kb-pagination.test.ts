import { describe, expect, it } from "vitest";

import { clampKbPage, getKbTotalPages } from "./kb-pagination";

describe("kb pagination helpers", () => {
  it.each([
    [0, 100, 1],
    [1, 100, 1],
    [100, 100, 1],
    [101, 100, 2],
    [205, 100, 3],
    [300, 100, 3],
  ])("计算 total=%i size=%i 的总页数为 %i", (total, pageSize, expected) => {
    expect(getKbTotalPages(total, pageSize)).toBe(expected);
  });

  it("页码越界时收敛到有效范围", () => {
    expect(clampKbPage(0, 205, 100)).toBe(1);
    expect(clampKbPage(2, 205, 100)).toBe(2);
    expect(clampKbPage(9, 205, 100)).toBe(3);
  });

  it("总数为 0 时只有第 1 页", () => {
    expect(getKbTotalPages(0, 100)).toBe(1);
    expect(clampKbPage(5, 0, 100)).toBe(1);
  });
});
