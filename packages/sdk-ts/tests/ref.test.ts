// ref.test.ts — test the ref parser
import { test, expect } from "bun:test";
import { parseRef, formatRef, parseDeckPattern } from "../src/ref.js";

test("parseRef parses a valid ref", () => {
  const ref = parseRef("tradein/submissions/01977c2e-0000-7000-8000-000000000001");
  expect(ref.book).toBe("tradein");
  expect(ref.deck).toBe("submissions");
  expect(ref.id).toBe("01977c2e-0000-7000-8000-000000000001");
});

test("parseRef rejects malformed refs", () => {
  expect(() => parseRef("tradein/submissions")).toThrow(/3 segments/);
  expect(() => parseRef("a/b/c/d")).toThrow(/3 segments/);
  expect(() => parseRef("tradein/submissions/not-a-uuid")).toThrow(/UUID/);
});

test("formatRef roundtrips", () => {
  const ref = parseRef("tradein/items/0197a1f4-0000-7000-8000-000000000001");
  expect(formatRef(ref)).toBe("tradein/items/0197a1f4-0000-7000-8000-000000000001");
});

test("parseDeckPattern parses book/deck", () => {
  const dp = parseDeckPattern("tradein/submissions");
  expect(dp.book).toBe("tradein");
  expect(dp.deck).toBe("submissions");
});

test("parseDeckPattern supports globs", () => {
  const dp = parseDeckPattern("*/*");
  expect(dp.book).toBe("*");
  expect(dp.deck).toBe("*");
});