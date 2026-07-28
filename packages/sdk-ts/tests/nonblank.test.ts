import { expect, test } from "bun:test";

import { isNonblankText } from "../src/nonblank.js";

test("nonblank text mirrors the candidate's exact portable whitespace set", () => {
  expect(isNonblankText("agent:test")).toBe(true);
  expect(isNonblankText("  agent:test\t")).toBe(true);
  expect(isNonblankText("")).toBe(false);
  expect(isNonblankText("\u0009\u000A\u000B\u000C\u000D\u0020")).toBe(false);
  expect(isNonblankText("agent\0hidden")).toBe(false);
  expect(isNonblankText(null)).toBe(false);

  // The SQL contract deliberately names six portable ASCII code points rather
  // than relying on database locale or JavaScript's broader trim table.
  expect(isNonblankText("\u00A0")).toBe(true);
});
