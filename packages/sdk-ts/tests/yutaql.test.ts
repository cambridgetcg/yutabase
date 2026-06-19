// yutaql.test.ts — test the YUTAQL compiler (pure function, no DB)
import { test, expect } from "bun:test";
import { compile, explain } from "../src/yutaql.js";

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
});

test("cards with where and newest compiles correctly", () => {
  const q = compile('cards tradein/submissions where status="pending" newest 20');
  expect(q.sql).toContain('FROM "tradein"."submissions"');
  expect(q.sql).toContain('WHERE "status" = $1');
  expect(q.sql).toContain("ORDER BY id DESC");
  expect(q.sql).toContain("LIMIT $2");
  expect(q.params).toEqual(["pending", 20]);
});

test("cards without where or limit still orders by id desc", () => {
  const q = compile("cards tradein/submissions");
  expect(q.sql).toContain("ORDER BY id DESC");
  expect(q.params).toEqual([]);
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
  const q = compile("tradein/customers/01964b10 -> submitted_by -> contains");
  expect(q.sql).toContain("JOIN yu.threads t2");
  expect(q.params).toContain("submitted_by");
  expect(q.params).toContain("contains");
});

test("thread compiles to INSERT with all fields", () => {
  const q = compile('thread tradein/items/0197a1f4-0000-7000-8000-000000000001 --priced_from--> pricing/quotes/01984c22-0000-7000-8000-000000000001 note "ebay comp" how computed src tradein/items/0197a1f4-0000-7000-8000-000000000001');
  expect(q.sql).toContain("INSERT INTO yu.threads");
  expect(q.sql).toContain("gen_random_uuid()");
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