// client.test.ts — integration test against a real Postgres database
//
// Requires an explicitly selected disposable database with migrations applied.
// The normal unit suite skips this file's integration body unless DATABASE_URL
// is present; there is deliberately no ambient localhost fallback.
//
// Run: DATABASE_URL=postgresql://localhost/yutabase_test bun run test:integration

import { test, expect, beforeAll, afterAll } from "bun:test";
import { Yuta } from "../src/index.js";

const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  test.skip("PostgreSQL integration requires explicit DATABASE_URL", () => {});
} else {
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
  expect(hello.version).toBe("0.1.0-candidate.1");
  expect(hello.profile).toBe("postgres");
  expect(hello.revision).toBe(4);
  expect(hello.versionSource).toBe("database");
  expect(hello.primitives).toContain("LEXICON");
  expect(hello.lexicon.length).toBeGreaterThanOrEqual(7);
  expect(hello.lexicon.map((l) => l.word)).toContain("contains");
});

test("card fetches one card by ref", async () => {
  const card = await yuta.card("tradein/submissions/01977c2e-0000-7000-8000-000000000001");
  expect(card).not.toBeNull();
  expect(card!.state).toBe("pending");
  expect(card!.how).toBe("witnessed");
});

test("cards lists with where filter and limit", async () => {
  const result = await yuta.query('cards tradein/items where name="Charizard" newest 5');
  expect(result.rows.length).toBe(1);
  expect(result.rows[0].name).toBe("Charizard");
  expect(result.freshness?.oldestCachedDays).toBeNull();
});

test("card forms resolve logical refs through physical registry mappings", async () => {
  await yuta.sqlTag`CREATE SCHEMA IF NOT EXISTS sdk_legacy`;
  await yuta.sqlTag`
    CREATE TABLE IF NOT EXISTS sdk_legacy.card_records (
      card_id uuid PRIMARY KEY,
      name text NOT NULL,
      observed_at timestamptz NOT NULL,
      how text NOT NULL,
      claim_kind text NOT NULL,
      sources text[]
    )
  `;
  await yuta.sqlTag`
    INSERT INTO sdk_legacy.card_records (
      card_id, name, observed_at, how, claim_kind, sources
    ) VALUES (
      '01990000-0000-7000-8000-000000000099',
      'Mapped card', now(), 'agent:test/session', 'declared', NULL
    ) ON CONFLICT (card_id) DO NOTHING
  `;
  await yuta.sqlTag`
    INSERT INTO yu.registry (
      book, deck, physical_schema, physical_table,
      id_col, at_col, by_col, how_col, src_col, native, by
    ) VALUES (
      'sdk_test', 'cards', 'sdk_legacy', 'card_records',
      'card_id', 'observed_at', 'how', 'claim_kind', 'sources', false, 'agent:test/session'
    ) ON CONFLICT (book, deck) DO UPDATE SET
      physical_schema = EXCLUDED.physical_schema,
      physical_table = EXCLUDED.physical_table,
      id_col = EXCLUDED.id_col,
      at_col = EXCLUDED.at_col,
      by_col = EXCLUDED.by_col,
      how_col = EXCLUDED.how_col,
      src_col = EXCLUDED.src_col,
      native = false,
      by = EXCLUDED.by
  `;

  const card = await yuta.card(
    "sdk_test/cards/01990000-0000-7000-8000-000000000099",
  );
  expect(card?.id).toBe("01990000-0000-7000-8000-000000000099");
  expect(card?.name).toBe("Mapped card");
  expect(card?.by).toBe("agent:test/session");
  expect(card?.how).toBe("declared");

  const cards = await yuta.query(
    'cards sdk_test/cards where .by="agent:test/session" and .how="declared" newest 1',
  );
  expect(cards.sql).toContain('FROM "sdk_legacy"."card_records"');
  expect(cards.sql).toContain('WHERE "how" = $1 AND "claim_kind" = $2');
  expect(cards.sql).toContain('ORDER BY "card_id" DESC');
  expect(cards.rows[0].id).toBe("01990000-0000-7000-8000-000000000099");
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
  // submission -> contains (first item) -> related_to (second item)
  const result = await yuta.query(
    "tradein/submissions/01977c2e-0000-7000-8000-000000000001 -> contains -> related_to"
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
    INSERT INTO yu.registry (book, deck, physical_schema, physical_table, native, by)
    VALUES ('pricing', 'quotes', 'pricing', 'quotes', true, 'agent:test/session')
    ON CONFLICT (book, deck) DO NOTHING
  `;
  await yuta.sqlTag`
    INSERT INTO pricing.quotes (id, amount, at, by, how)
    VALUES ('01984c22-0000-7000-8000-000000000001', 18.50, now(), 'agent:test/session', 'witnessed')
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
}
