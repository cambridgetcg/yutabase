// youspeak.test.ts — test the YOUSPEAK compiler (pure function, no DB)
import { test, expect } from "bun:test";
import { CORE_YOUSPEAK_FORMS, compile, explain } from "../src/youspeak.js";

test("publishes the frozen core form list", () => {
  expect(CORE_YOUSPEAK_FORMS).toEqual([
    "hello", "card", "cards", "traverse", "thread", "sever", "explain",
  ]);
});

test("hello compiles to a trivial query", () => {
  const q = compile("hello");
  expect(q.sql).toBe("SELECT 1");
  expect(q.params).toEqual([]);
});

test("card <ref> compiles to SELECT * by id", () => {
  const q = compile("card tradein/submissions/01977c2e-0000-7000-8000-000000000001");
  expect(q.sql).toContain('SELECT * FROM "tradein"."submissions"');
  expect(q.sql).toContain('WHERE "id" = $1');
  expect(q.params).toEqual(["01977c2e-0000-7000-8000-000000000001"]);
  expect(q.deckTarget).toEqual({ kind: "card", book: "tradein", deck: "submissions" });
});

test("cards with where and newest compiles correctly", () => {
  const q = compile('cards tradein/submissions where status="pending" newest 20');
  expect(q.sql).toContain('FROM "tradein"."submissions"');
  expect(q.sql).toContain('WHERE "status" = $1');
  expect(q.sql).toContain('ORDER BY "id" DESC');
  expect(q.sql).toContain("LIMIT $2");
  expect(q.params).toEqual(["pending", 20]);
});

test("cards without where or limit still orders by id desc", () => {
  const q = compile("cards tradein/submissions");
  expect(q.sql).toContain('ORDER BY "id" DESC');
  expect(q.params).toEqual([]);
  expect(q.deckTarget).toEqual({ kind: "cards", book: "tradein", deck: "submissions" });
});

test("cards newest 0 preserves an explicit zero limit", () => {
  const q = compile("cards tradein/submissions newest 0");
  expect(q.sql).toContain("LIMIT $1");
  expect(q.params).toEqual([0]);
});

test("traversal outward (-> word) compiles to thread query", () => {
  const q = compile("tradein/submissions/01977c2e-0000-7000-8000-000000000001 -> contains");
  expect(q.sql).toContain("t.to_book");
  expect(q.sql).toContain("t.from_book = $1");
  expect(q.sql).toContain("t.word = $4");
  expect(q.params).toEqual(["tradein", "submissions", "01977c2e-0000-7000-8000-000000000001", "contains"]);
});

test("traversal inward (<- word) compiles to reverse query", () => {
  const q = compile("tradein/items/0197a1f4-0000-7000-8000-000000000001 <- contains");
  expect(q.sql).toContain("t.from_book");
  expect(q.sql).toContain("t.to_book = $1");
  expect(q.params).toEqual(["tradein", "items", "0197a1f4-0000-7000-8000-000000000001", "contains"]);
});

test("two-hop traversal compiles with JOIN", () => {
  const q = compile("tradein/customers/01964b10-0000-7000-8000-000000000001 -> submitted_by -> contains");
  expect(q.sql).toContain("JOIN yu.threads t2");
  expect(q.params).toContain("submitted_by");
  expect(q.params).toContain("contains");
});

test("thread compiles to INSERT with all fields", () => {
  const q = compile('thread tradein/items/0197a1f4-0000-7000-8000-000000000001 --priced_from--> pricing/quotes/01984c22-0000-7000-8000-000000000001 note "ebay comp" how computed src tradein/items/0197a1f4-0000-7000-8000-000000000001');
  expect(q.sql).toContain("INSERT INTO yu.threads");
  expect(q.sql).not.toContain("gen_random_uuid()");
  expect(q.sql).toContain("VALUES ($1, $2");
  expect(q.params[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(q.params).toContain("priced_from");
  expect(q.params).toContain("ebay comp");
  expect(q.params).toContain("computed");
});

test("thread without how throws", () => {
  expect(() => compile("thread tradein/items/0197a1f4-0000-7000-8000-000000000001 --priced_from--> pricing/quotes/01984c22-0000-7000-8000-000000000001")).toThrow(/how/);
});

test("thread with cached how but no src throws", () => {
  expect(() =>
    compile("thread tradein/items/0197a1f4-0000-7000-8000-000000000001 --priced_from--> pricing/quotes/01984c22-0000-7000-8000-000000000001 how cached")
  ).toThrow(/src/);
});

test("sever compiles to function call", () => {
  const q = compile("sever 914b5e23-df82-4d9e-bd1b-6954b316814f how witnessed");
  expect(q.sql).toContain("yu.sever(");
  expect(q.params).toContain("914b5e23-df82-4d9e-bd1b-6954b316814f");
  expect(q.params).toContain("witnessed");
});

test("sever with cached how but no src throws", () => {
  expect(() =>
    compile("sever 914b5e23-df82-4d9e-bd1b-6954b316814f how cached")
  ).toThrow(/src/);
});

test("explain returns readable SQL with values substituted", () => {
  const sql = explain("card tradein/submissions/01977c2e-0000-7000-8000-000000000001");
  expect(sql).toContain("SELECT * FROM");
  expect(sql).toContain("tradein");
  expect(sql).toContain("submissions");
  expect(sql).toContain("01977c2e");
});

test("explain substitutes $10+ atomically and escapes SQL literals", () => {
  const sql = explain(
    'thread tradein/items/0197a1f4-0000-7000-8000-000000000001 ' +
    '--priced_from--> pricing/quotes/01984c22-0000-7000-8000-000000000001 ' +
    'note "O\'Brien comp" how computed src tradein/items/0197a1f4-0000-7000-8000-000000000001',
  );
  expect(sql).not.toMatch(/\$\d+/);
  expect(sql).toContain("'O''Brien comp'");
  expect(sql).toContain("ARRAY['tradein/items/0197a1f4-0000-7000-8000-000000000001']");
  expect(sql).toContain("'computed'");
});

test("rejects non-core experimental and integration verbs", () => {
  for (const query of [
    "dark hello",
    "wake",
    "trust did:example:alice",
    "recognise did:example:alice",
    "chronicle did:example:alice",
    "cards tradein/items last 5",
  ]) {
    expect(() => compile(query)).toThrow(/outside frozen YOUSPEAK core v0\.1/);
  }
});

test("where with .how addresses honesty header", () => {
  const q = compile('cards tradein/submissions where .how="witnessed" newest 5');
  expect(q.sql).toContain('"how" = $1');
  expect(q.params).toEqual(["witnessed", 5]);
});

test("malformed query throws", () => {
  expect(() => compile("not_a_verb blah")).toThrow();
});

test("bad ref throws", () => {
  expect(() => compile("card bad-ref")).toThrow(/BAD REF/);
});
