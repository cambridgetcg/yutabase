// ref.test.ts — test the ref parser
import { test, expect } from "bun:test";
import { parseRef, formatRef, makeRef, parseDeckPattern } from "../src/ref.js";

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
  expect(() => parseRef("tradein/submissions/01977c2e")).toThrow(/full UUID/);
  expect(() => parseRef("TradeIn/submissions/01977c2e-0000-7000-8000-000000000001")).toThrow(/lower_snake/);
  expect(() => parseRef("tradein/submissions;drop/01977c2e-0000-7000-8000-000000000001")).toThrow(/lower_snake/);
});

test("formatRef roundtrips", () => {
  const ref = parseRef("tradein/items/0197a1f4-0000-7000-8000-000000000001");
  expect(formatRef(ref)).toBe("tradein/items/0197a1f4-0000-7000-8000-000000000001");
});

test("makeRef enforces the same grammar as parseRef", () => {
  expect(makeRef("tradein", "items", "0197a1f4-0000-7000-8000-000000000001")).toEqual({
    book: "tradein",
    deck: "items",
    id: "0197a1f4-0000-7000-8000-000000000001",
  });
  expect(() => makeRef("tradein", "Items", "0197a1f4-0000-7000-8000-000000000001")).toThrow(/lower_snake/);
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

test("parseDeckPattern rejects non-core identifiers", () => {
  expect(() => parseDeckPattern("TradeIn/items")).toThrow(/lower_snake/);
  expect(() => parseDeckPattern("tradein/items;drop")).toThrow(/lower_snake/);
});
