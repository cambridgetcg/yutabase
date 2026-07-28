// youspeak.test.ts — test the YOUSPEAK compiler (pure function, no DB)
import { test, expect } from "bun:test";
import { CORE_YOUSPEAK_FORMS, compile, explain } from "../src/youspeak.js";
import { parseRef } from "../src/ref.js";
import {
  bindClaimant,
  compileSeverQuery,
  compileThreadQuery,
  compileTraversalQuery,
} from "../src/query-builders.js";

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
  expect(q.sql).toContain(
    'SELECT * FROM "__yutabase_logical_book__"."__yutabase_logical_deck__"',
  );
  expect(q.sql).toContain('WHERE "id" = $1');
  expect(q.params).toEqual(["01977c2e-0000-7000-8000-000000000001"]);
  expect(q.deckTarget).toEqual({ kind: "card", book: "tradein", deck: "submissions" });
});

test("cards with where and newest compiles correctly", () => {
  const q = compile('cards tradein/submissions where status="pending" newest 20');
  expect(q.sql).toContain(
    'FROM "__yutabase_logical_book__"."__yutabase_logical_deck__"',
  );
  expect(q.sql).toContain('WHERE "status" = $1');
  expect(q.sql).toContain('ORDER BY "at" DESC NULLS LAST, "id" DESC');
  expect(q.sql).toContain("LIMIT $2");
  expect(q.params).toEqual(["pending", 20]);
});

test("where keeps the word and inside quoted values", () => {
  const q = compile(
    'cards tradein/submissions where title="research and development" and status="pending"',
  );
  expect(q.sql).toContain('"title" = $1 AND "status" = $2');
  expect(q.params).toEqual(["research and development", "pending", 100]);
});

test("where refuses identifiers PostgreSQL would silently truncate", () => {
  const tooLong = `a${"b".repeat(63)}`;
  expect(() =>
    compile(`cards tradein/submissions where ${tooLong}="value"`),
  ).toThrow(/BAD COLUMN/);
});

test("cards without newest uses a bounded default", () => {
  const q = compile("cards tradein/submissions");
  expect(q.sql).toContain('ORDER BY "at" DESC NULLS LAST, "id" DESC');
  expect(q.sql).toContain("LIMIT $1");
  expect(q.params).toEqual([100]);
  expect(q.deckTarget).toEqual({ kind: "cards", book: "tradein", deck: "submissions" });
});

test("cards newest is a positive bounded integer", () => {
  expect(compile("cards tradein/submissions newest 1").params).toEqual([1]);
  expect(compile("cards tradein/submissions newest 1000").params).toEqual([1000]);
  expect(() => compile("cards tradein/submissions newest 0")).toThrow(
    /BAD LIMIT/,
  );
  expect(() => compile("cards tradein/submissions newest 1001")).toThrow(
    /BAD LIMIT/,
  );
  expect(() =>
    compile("cards tradein/submissions newest 999999999999999999999999"),
  ).toThrow(/BAD LIMIT/);
  expect(() => compile("cards tradein/submissions newest -1")).toThrow(
    /BAD LIMIT/,
  );
  expect(() => compile("cards tradein/submissions newest 1.5")).toThrow(
    /BAD LIMIT/,
  );
});

test("card forms keep long logical labels out of physical SQL identifiers", () => {
  const book = `logical_${"b".repeat(64)}`;
  const deck = `records_${"d".repeat(64)}`;
  const ref = `${book}/${deck}/01977c2e-0000-7000-8000-000000000001`;
  const card = compile(`card ${ref}`);
  const cards = compile(`cards ${book}/${deck} newest 1`);

  expect(card.deckTarget).toEqual({ kind: "card", book, deck });
  expect(cards.deckTarget).toEqual({ kind: "cards", book, deck });
  expect(card.sql).toContain(
    '"__yutabase_logical_book__"."__yutabase_logical_deck__"',
  );
  expect(explain(`card ${ref}`)).toContain(`"${book}"."${deck}"`);
});

test("traversal outward (-> word) compiles to thread query", () => {
  const q = compile("tradein/submissions/01977c2e-0000-7000-8000-000000000001 -> contains");
  expect(q.sql).toContain("t.to_book");
  expect(q.sql).toContain("t.from_book = $1");
  expect(q.sql).toContain("t.word = $4");
  expect(q.sql).toContain("JOIN yu.word_versions v");
  expect(q.sql).toContain("jsonb_build_array");
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
  expect(q.sql).toContain("JOIN yu.word_versions v1");
  expect(q.sql).toContain("JOIN yu.word_versions v2");
  expect(q.sql).toContain("AS path");
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

test("thread rejects claim kinds outside the honesty header", () => {
  expect(() =>
    compile(
      "thread tradein/items/0197a1f4-0000-7000-8000-000000000001 " +
      "--priced_from--> pricing/quotes/01984c22-0000-7000-8000-000000000001 how magical",
    )
  ).toThrow(/unknown claim kind/);
});

test("structured thread values never become YOUSPEAK syntax or claimant bindings", () => {
  const note = 'quoted " note how declared src not-a-source';
  const src = ["locator with spaces", "__CLAIMANT__"];
  const compiled = compileThreadQuery({
    from: parseRef("tradein/items/0197a1f4-0000-7000-8000-000000000001"),
    word: "priced_from",
    to: parseRef("pricing/quotes/01984c22-0000-7000-8000-000000000001"),
    how: "computed",
    note,
    src,
  });
  const bound = bindClaimant(compiled, "agent:test/session");

  expect(bound.params[8]).toBe(note);
  expect(bound.params[compiled.claimantParamIndex!]).toBe("agent:test/session");
  expect(bound.params.at(-1)).toEqual(src);
});

test("structured writes reject empty, blank, sparse, null, and NUL source locators", () => {
  const from = parseRef(
    "tradein/items/0197a1f4-0000-7000-8000-000000000001",
  );
  const to = parseRef(
    "pricing/quotes/01984c22-0000-7000-8000-000000000001",
  );
  for (const src of [
    [""],
    ["   "],
    ["\t\n\v\f\r "],
    new Array(1),
    [null],
    ["bad\0locator"],
  ]) {
    expect(() =>
      compileThreadQuery({
        from,
        word: "priced_from",
        to,
        how: "computed",
        src: src as never,
      }),
    ).toThrow(/src entries must be non-blank strings without NUL/);
    expect(() =>
      compileSeverQuery({
        threadId: "914b5e23-df82-4d9e-bd1b-6954b316814f",
        how: "declared",
        src: src as never,
      }),
    ).toThrow(/src entries must be non-blank strings without NUL/);
  }
});

test("structured traversal keeps a word value as one parameter", () => {
  const word = "contains -> witnesses";
  const compiled = compileTraversalQuery(
    parseRef("tradein/items/0197a1f4-0000-7000-8000-000000000001"),
    "->",
    word,
  );

  expect(compiled.sql).not.toContain("JOIN yu.threads");
  expect(compiled.params.at(-1)).toBe(word);
});

test("structured traversal rejects runtime directions before SQL generation", () => {
  const ref = parseRef(
    "tradein/items/0197a1f4-0000-7000-8000-000000000001",
  );
  expect(() =>
    compileTraversalQuery(ref, "x', current_user, 'injected" as never, "contains")
  ).toThrow(/TRAVERSE direction/);
  expect(() =>
    compileTraversalQuery(ref, "->", "contains", {
      direction: "x', current_user, 'injected" as never,
      word: "related_to",
    })
  ).toThrow(/second-hop direction/);
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

test("the explain command returns the same complete logical preview", () => {
  const inner =
    'cards tradein/submissions where status="pending" newest 5';
  const wrapped = compile(`explain "${inner}"`);
  const preview = String(wrapped.params[0]);

  expect(wrapped.sql).toBe("SELECT $1::text AS sql");
  expect(wrapped.params).toEqual([explain(inner)]);
  expect(preview).toContain(`FROM "tradein"."submissions"`);
  expect(preview).toContain(`"status" = 'pending'`);
  expect(preview).not.toContain(
    '"__yutabase_logical_book__"."__yutabase_logical_deck__"',
  );
  expect(preview).not.toMatch(/\$\d+/);
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
