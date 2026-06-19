// client.test.ts — integration test against a real Postgres database
//
// Requires a yutabase database with migrations applied.
// Set YUTABASE_TEST_URL or default to local postgres.
//
// Run: YUTABASE_TEST_URL=postgresql://macair@localhost/yutabase_test7 bun test

import { test, expect, beforeAll, afterAll } from "bun:test";
import { Yuta } from "../src/index.js";

const DB_URL = process.env.YUTABASE_TEST_URL || "postgresql://macair@localhost/yutabase_test7";
let yuta: Yuta;

beforeAll(async () => {
  yuta = new Yuta({ connectionString: DB_URL, claimant: "agent:test/session" });
});

afterAll(async () => {
  if (yuta) await yuta.close();
});

test("hello returns the entire standard", async () => {
  const hello = await yuta.hello();
  expect(hello.standard).toBe("YUTABASE");
  expect(hello.version).toBe("0.1");
  expect(hello.primitives).toContain("LEXICON");
  expect(hello.bannedWords).toContain("related_to");
  expect(hello.lexicon.length).toBe(7);
  expect(hello.lexicon.map((l) => l.word)).toContain("contains");
});

test("card fetches one card by ref", async () => {
  const card = await yuta.card("tradein/submissions/01977c2e-0000-7000-8000-000000000001");
  expect(card).not.toBeNull();
  expect(card!.status).toBe("pending");
  expect(card!.how).toBe("witnessed");
});

test("cards lists with where filter and limit", async () => {
  const result = await yuta.query('cards tradein/items where name="Charizard EX 151" newest 5');
  expect(result.rows.length).toBe(1);
  expect(result.rows[0].name).toBe("Charizard EX 151");
});

test("traversal outward (-> contains) finds connected cards", async () => {
  const rows = await yuta.traverse(
    "tradein/submissions/01977c2e-0000-7000-8000-000000000001",
    "->",
    "contains"
  );
  expect(rows.length).toBeGreaterThanOrEqual(1);
  expect(rows[0].deck).toBe("items");
});

test("traversal inward (<- contains) finds the parent", async () => {
  const rows = await yuta.traverse(
    "tradein/items/0197a1f4-0000-7000-8000-000000000001",
    "<-",
    "contains"
  );
  expect(rows.length).toBe(1);
  expect(rows[0].deck).toBe("submissions");
});

test("two-hop traversal works", async () => {
  // customers <- submitted_by (find their submissions) -> contains (items in those submissions)
  const result = await yuta.query(
    "tradein/customers/01964b10-0000-7000-8000-000000000001 <- submitted_by -> contains"
  );
  expect(result.rows.length).toBeGreaterThanOrEqual(1);
  expect(result.rows[0].deck).toBe("items");
});

test("thread creates a worded connection with honesty header", async () => {
  // Create a pricing deck + quote card for this test
  await yuta.sqlTag`CREATE SCHEMA IF NOT EXISTS pricing`;
  await yuta.sqlTag`
    CREATE TABLE IF NOT EXISTS pricing.quotes (
      id uuid PRIMARY KEY,
      amount numeric NOT NULL,
      at timestamptz NOT NULL,
      by text NOT NULL,
      how text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared')),
      src text[]
    )
  `;
  await yuta.sqlTag`
    INSERT INTO yu.registry (book, deck, native, by) VALUES ('pricing', 'quotes', true, 'human:yu')
    ON CONFLICT (book, deck) DO NOTHING
  `;
  await yuta.sqlTag`
    INSERT INTO pricing.quotes (id, amount, at, by, how)
    VALUES ('01984c22-0000-7000-8000-000000000001', 18.50, now(), 'human:yu', 'witnessed')
    ON CONFLICT DO NOTHING
  `;

  const result = await yuta.thread(
    "tradein/items/0197a1f4-0000-7000-8000-000000000001",
    "priced_from",
    "pricing/quotes/01984c22-0000-7000-8000-000000000001",
    "computed",
    { note: "ebay last-sold comp", src: ["tradein/items/0197a1f4-0000-7000-8000-000000000001"] }
  );
  expect(result).toBeDefined();
});

test("thread with cached how and no src throws", async () => {
  try {
    await yuta.thread(
      "tradein/items/0197a1f4-0000-7000-8000-000000000001",
      "priced_from",
      "pricing/quotes/01984c22-0000-7000-8000-000000000001",
      "cached"
    );
    expect(false).toBe(true); // should not reach
  } catch (e) {
    expect((e as Error).message).toMatch(/src/);
  }
});

test("sever ends a thread with a claim", async () => {
  // Find a thread to sever
  const threads = await yuta.sqlTag`
    SELECT id FROM yu.threads
    WHERE word = 'priced_from'
    ORDER BY at DESC LIMIT 1
  `;
  if (threads.length === 0) return; // skip if no thread

  const threadId = threads[0].id as string;
  await yuta.sever(threadId, "witnessed");

  // Verify it's in the sever log
  const log = await yuta.sqlTag`SELECT * FROM yu.sever_log WHERE id = ${threadId}`;
  expect(log.length).toBe(1);
  expect(log[0].how).toBe("witnessed");
});

test("explain returns SQL without executing", () => {
  const sql = yuta.explain('cards tradein/submissions where status="pending" newest 5');
  expect(sql).toContain("SELECT");
  expect(sql).toContain("tradein");
  expect(sql).toContain("submissions");
  expect(sql).toContain("LIMIT");
});

test("freshness banner appears on results with honesty header", async () => {
  const result = await yuta.query("cards tradein/submissions newest 5");
  expect(result.freshness).toBeDefined();
  expect(result.freshness!.totalValues).toBeGreaterThan(0);
});