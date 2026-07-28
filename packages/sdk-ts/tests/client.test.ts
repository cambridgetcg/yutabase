// client.test.ts — integration test against a real Postgres database
//
// Requires a fresh, single-use disposable database with migrations applied.
// The normal unit suite skips this file's integration body unless DATABASE_URL
// is present; destructive execution additionally requires an explicit marker.
//
// Run:
//   YUTABASE_INTEGRATION_TEST=1 \
//   DATABASE_URL=postgresql://localhost/yutabase_test \
//   bun run test:integration

import { test, expect, beforeAll, afterAll } from "bun:test";
import { Yuta } from "../src/index.js";
import {
  CANDIDATE_CAPABILITIES,
  REVISION_FOUR_CAPABILITIES,
} from "../src/install.js";

const DB_URL = process.env.DATABASE_URL;
const DESTRUCTIVE_OPT_IN = process.env.YUTABASE_INTEGRATION_TEST === "1";

if (!DB_URL) {
  test.skip("PostgreSQL integration requires explicit DATABASE_URL", () => {});
} else if (!DESTRUCTIVE_OPT_IN) {
  test("PostgreSQL integration requires YUTABASE_INTEGRATION_TEST=1", () => {
    throw new Error(
      "DESTRUCTIVE TEST REFUSED: set YUTABASE_INTEGRATION_TEST=1 only for a fresh, disposable database",
    );
  });
} else {
  let yuta: Yuta;

  beforeAll(async () => {
    yuta = new Yuta({
      connectionString: DB_URL,
      claimant: "agent:test/session",
    });
    const database = await yuta.sqlTag`
    SELECT current_database() AS name
  `;
    if (
      ["postgres", "template0", "template1"].includes(String(database[0]?.name))
    ) {
      throw new Error(
        `DESTRUCTIVE TEST REFUSED: ${String(database[0]?.name)} is not a disposable test database`,
      );
    }

    // Deliberately no IF NOT EXISTS: a retained namespace means this database
    // has already hosted the destructive fixture and must be recreated.
    await yuta.execTransaction([
      "CREATE SCHEMA sdk_integration",
      `CREATE TABLE sdk_integration.card_records (
      card_id uuid PRIMARY KEY,
      name text NOT NULL,
      observed_at timestamptz NOT NULL,
      how text NOT NULL,
      claim_kind text NOT NULL,
      sources text[]
    )`,
      `CREATE TABLE sdk_integration.quotes (
      id uuid PRIMARY KEY,
      amount numeric NOT NULL,
      at timestamptz NOT NULL,
      by text NOT NULL,
      how text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared')),
      src text[]
    )`,
    ]);
  });

  afterAll(async () => {
    if (yuta) await yuta.close();
  });

  test("hello returns the entire standard", async () => {
    const hello = await yuta.hello();
    expect(hello.standard).toBe("YUTABASE");
    expect(hello.version).toBe("0.1.0-candidate.1");
    expect(hello.profile).toBe("postgres");
    expect(hello.revision).toBe(5);
    expect(hello.versionSource).toBe("database");
    expect(hello.primitives).toContain("LEXICON");
    expect(hello.lexicon.length).toBeGreaterThanOrEqual(7);
    expect(hello.lexicon.map((l) => l.word)).toContain("contains");
  });

  test("refresh_via neutralizes hostile table defaults for new words", async () => {
    const globalProbe = "yutabase_via_global_probe";
    const schemaProbe = "yutabase_via_schema_probe";
    let rolesCreated = false;
    let bindingProbe: Yuta | undefined;

    try {
      await yuta.execTransaction([
        `CREATE ROLE ${globalProbe}
         NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
         INHERIT NOREPLICATION NOBYPASSRLS`,
        `CREATE ROLE ${schemaProbe}
         NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
         INHERIT NOREPLICATION NOBYPASSRLS`,
      ]);
      rolesCreated = true;

      // Model both cluster-wide and via-scoped installer defaults owned by the
      // SECURITY DEFINER refresh identity. A newly created view would inherit
      // both arbitrary ALL grants, including grant options, without canonical
      // refresh-time normalization.
      await yuta.exec(`
      DO $fixture$
      DECLARE
        refresh_owner name;
      BEGIN
        SELECT pg_catalog.pg_get_userbyid(routine.proowner)
        INTO STRICT refresh_owner
        FROM pg_catalog.pg_proc routine
        WHERE routine.oid = 'yu.refresh_via()'::regprocedure;

        EXECUTE pg_catalog.format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I
             GRANT ALL PRIVILEGES ON TABLES TO %I WITH GRANT OPTION',
          refresh_owner,
          '${globalProbe}'
        );
        EXECUTE pg_catalog.format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA via
             GRANT ALL PRIVILEGES ON TABLES TO %I WITH GRANT OPTION',
          refresh_owner,
          '${schemaProbe}'
        );
      END
      $fixture$
    `);

      await yuta.execTransaction([
        "SET LOCAL ROLE yu_lexicographer",
        `INSERT INTO yu.lexicon (
         word, gloss, inverse, from_deck, to_deck, to_one, ttl,
         status, at, by, how, src
       ) VALUES (
         'sdk_via_acl_probe',
         'this source exposes the refresh-time ACL normalization probe',
         'is exposed by the refresh-time ACL normalization probe',
         '*/*', '*/*', false, NULL,
         'live', clock_timestamp(), 'agent:test/acl-probe', 'declared', NULL
       )`,
        "SELECT yu.refresh_via()",
      ]);

      // Column ACLs are separate catalog state from the table-level defaults.
      // Seed both an arbitrary-role grant option and a PUBLIC grant, then prove
      // an ordinary lexicographer refresh removes those too.
      await yuta.execTransaction([
        `GRANT UPDATE (note) ON TABLE via.sdk_via_acl_probe
         TO ${schemaProbe} WITH GRANT OPTION`,
        `GRANT SELECT (gloss) ON TABLE via.sdk_via_acl_probe TO PUBLIC`,
        "SET LOCAL ROLE yu_lexicographer",
        "SELECT yu.refresh_via()",
      ]);

      const exactSurface = await yuta.exec<{ exact: boolean }>(`
      WITH target AS (
        SELECT
          relation.oid,
          relation.relowner,
          relation.relkind,
          relation.relpersistence,
          relation.reloptions
        FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace_row
          ON namespace_row.oid = relation.relnamespace
        WHERE namespace_row.nspname = 'via'
          AND relation.relname = 'sdk_via_acl_probe'
      ),
      expected AS (
        SELECT
          'relation'::text AS object_class,
          target.oid AS object_oid,
          0::integer AS sub_id,
          target.relowner AS grantor,
          pg_catalog.to_regrole('yu_reader')::oid AS grantee,
          'SELECT'::text AS privilege_type,
          false AS is_grantable
        FROM target
      ),
      actual AS (
        SELECT
          'relation'::text AS object_class,
          target.oid AS object_oid,
          0::integer AS sub_id,
          acl.grantor,
          acl.grantee,
          acl.privilege_type,
          acl.is_grantable
        FROM target
        JOIN pg_catalog.pg_class relation ON relation.oid = target.oid
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          coalesce(
            relation.relacl,
            pg_catalog.acldefault('r', relation.relowner)
          )
        ) acl
        WHERE acl.grantee <> relation.relowner

        UNION ALL

        SELECT
          'column',
          target.oid,
          attribute.attnum::integer,
          acl.grantor,
          acl.grantee,
          acl.privilege_type,
          acl.is_grantable
        FROM target
        JOIN pg_catalog.pg_attribute attribute
          ON attribute.attrelid = target.oid
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
        WHERE acl.grantee <> target.relowner
      ),
      difference AS (
        (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
        UNION ALL
        (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
      )
      SELECT
        (SELECT count(*) FROM target) = 1
        AND NOT EXISTS (
          SELECT 1
          FROM target
          JOIN pg_catalog.pg_proc routine
            ON routine.oid = 'yu.refresh_via()'::regprocedure
          WHERE target.relkind <> 'v'
             OR target.relpersistence <> 'p'
             OR target.relowner <> routine.proowner
             OR target.reloptions
                  IS DISTINCT FROM ARRAY['security_invoker=true']::text[]
        )
        AND NOT EXISTS (SELECT 1 FROM difference) AS exact
    `);
      expect(exactSurface[0]?.exact).toBe(true);

      bindingProbe = new Yuta({
        connectionString: DB_URL,
        claimant: "agent:test/via-default-acl-probe",
      });
      const hello = await bindingProbe.hello();
      expect(hello.revision).toBe(5);
      expect(hello.lexicon.map((word) => word.word)).toContain(
        "sdk_via_acl_probe",
      );
    } finally {
      if (bindingProbe) await bindingProbe.close();
      if (rolesCreated) {
        await yuta.execTransaction([
          `DO $fixture$
         DECLARE
           refresh_owner name;
         BEGIN
           SELECT pg_catalog.pg_get_userbyid(routine.proowner)
           INTO STRICT refresh_owner
           FROM pg_catalog.pg_proc routine
           WHERE routine.oid = 'yu.refresh_via()'::regprocedure;

           EXECUTE pg_catalog.format(
             'ALTER DEFAULT PRIVILEGES FOR ROLE %I
                REVOKE ALL PRIVILEGES ON TABLES FROM %I',
             refresh_owner,
             '${globalProbe}'
           );
           EXECUTE pg_catalog.format(
             'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA via
                REVOKE ALL PRIVILEGES ON TABLES FROM %I',
             refresh_owner,
             '${schemaProbe}'
           );
         END
         $fixture$`,
          `DROP OWNED BY ${globalProbe}, ${schemaProbe} CASCADE`,
          `DROP ROLE ${globalProbe}, ${schemaProbe}`,
        ]);
      }
    }
  });

  test("card fetches one card by ref", async () => {
    const card = await yuta.card(
      "tradein/submissions/01977c2e-0000-7000-8000-000000000001",
    );
    expect(card).not.toBeNull();
    expect(card!.state).toBe("pending");
    expect(card!.how).toBe("witnessed");
  });

  test("cards lists with where filter and limit", async () => {
    const result = await yuta.query(
      'cards tradein/items where name="Charizard" newest 5',
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].name).toBe("Charizard");
    expect(result.freshness?.oldestCachedDays).toBeNull();
  });

  test("card forms resolve logical refs through physical registry mappings", async () => {
    await yuta.sqlTag`
    INSERT INTO sdk_integration.card_records (
      card_id, name, observed_at, how, claim_kind, sources
    ) VALUES
      (
        '01990000-0000-7000-8000-000000000099',
        'Mapped card', '2026-07-22T10:00:00.000Z',
        'agent:test/session', 'declared', NULL
      ),
      (
        'ffffffff-ffff-4fff-bfff-ffffffffffff',
        'Lexically later but older', '2026-07-22T09:00:00.000Z',
        'agent:test/session', 'declared', NULL
      ),
      (
        '00000000-0000-4000-8000-000000000001',
        'Claim-time newest', '2026-07-22T11:00:00.000Z',
        'agent:test/session', 'declared', NULL
      )
    ON CONFLICT (card_id) DO NOTHING
  `;
    await yuta.sqlTag`
    INSERT INTO yu.registry (
      book, deck, physical_schema, physical_table,
      id_col, at_col, by_col, how_col, src_col, native, by
    ) VALUES (
      'sdk_integration', 'cards', 'sdk_integration', 'card_records',
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
      "sdk_integration/cards/01990000-0000-7000-8000-000000000099",
    );
    expect(card?.id).toBe("01990000-0000-7000-8000-000000000099");
    expect(card?.name).toBe("Mapped card");
    expect(card?.by).toBe("agent:test/session");
    expect(card?.how).toBe("declared");

    const cards = await yuta.query(
      'cards sdk_integration/cards where .by="agent:test/session" and .how="declared" newest 1',
    );
    expect(cards.sql).toContain('FROM "sdk_integration"."card_records"');
    expect(cards.sql).toContain('WHERE "how" = $1 AND "claim_kind" = $2');
    expect(cards.sql).toContain(
      'ORDER BY "observed_at" DESC NULLS LAST, "card_id" DESC',
    );
    expect(cards.rows[0].id).toBe("00000000-0000-4000-8000-000000000001");
    expect(cards.rows[0].name).toBe("Claim-time newest");

    const longBook = `logical_${"b".repeat(64)}`;
    const longDeck = `records_${"d".repeat(64)}`;
    await yuta.sqlTag`
    CREATE TABLE sdk_integration.long_label_records
      (LIKE sdk_integration.card_records INCLUDING ALL)
  `;
    await yuta.sqlTag`
    INSERT INTO sdk_integration.long_label_records
    SELECT * FROM sdk_integration.card_records
    WHERE card_id = '01990000-0000-7000-8000-000000000099'
    ON CONFLICT (card_id) DO NOTHING
  `;
    await yuta.sqlTag`
    INSERT INTO yu.registry (
      book, deck, physical_schema, physical_table,
      id_col, at_col, by_col, how_col, src_col, native, by
    ) VALUES (
      ${longBook}, ${longDeck}, 'sdk_integration', 'long_label_records',
      'card_id', 'observed_at', 'how', 'claim_kind', 'sources', false,
      'agent:test/session'
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

    const longLogicalCard = await yuta.card(
      `${longBook}/${longDeck}/01990000-0000-7000-8000-000000000099`,
    );
    expect(longLogicalCard?.name).toBe("Mapped card");
  });

  test("registry mappings keep card and claim fields on distinct columns", async () => {
    await expect(
      yuta.sqlTag`
      UPDATE yu.registry
      SET how_col = by_col
      WHERE book = 'sdk_integration' AND deck = 'cards'
    `,
    ).rejects.toThrow(/registry_mapped_columns_distinct/);

    const mapping = await yuta.sqlTag`
    SELECT by_col, how_col
    FROM yu.registry
    WHERE book = 'sdk_integration' AND deck = 'cards'
  `;
    expect(mapping[0]?.by_col).toBe("how");
    expect(mapping[0]?.how_col).toBe("claim_kind");
  });

  test("yu_reader resolves and reads an explicitly granted physical deck", async () => {
    await yuta.execTransaction([
      "GRANT USAGE ON SCHEMA test_cards TO yu_reader",
      "GRANT SELECT ON test_cards.submission_cards TO yu_reader",
    ]);

    const readerUrl = new URL(DB_URL);
    readerUrl.searchParams.set("options", "-c role=yu_reader");
    const reader = new Yuta({ connectionString: readerUrl.toString() });
    try {
      const identity = await reader.sqlTag`SELECT current_user AS role`;
      expect(identity[0]?.role).toBe("yu_reader");

      const card = await reader.card(
        "tradein/submissions/01977c2e-0000-7000-8000-000000000001",
      );
      expect(card?.state).toBe("pending");
      expect(card?.by).toBe("human:test");
    } finally {
      await reader.close();
      await yuta.execTransaction([
        "REVOKE SELECT ON test_cards.submission_cards FROM yu_reader",
        "REVOKE USAGE ON SCHEMA test_cards FROM yu_reader",
      ]);
    }
  });

  test("yu_appender creates immutable threads but cannot sever them", async () => {
    await yuta.execTransaction([
      "GRANT USAGE ON SCHEMA test_cards TO yu_appender",
      "GRANT SELECT ON test_cards.submission_cards, test_cards.item_cards TO yu_appender",
    ]);

    const appenderUrl = new URL(DB_URL);
    appenderUrl.searchParams.set("options", "-c role=yu_appender");
    const appender = new Yuta({
      connectionString: appenderUrl.toString(),
      claimant: "agent:test/appender",
    });
    let threadId: string | undefined;
    try {
      const identity = await appender.sqlTag`SELECT current_user AS role`;
      expect(identity[0]?.role).toBe("yu_appender");

      const created = await appender.thread(
        "tradein/submissions/01977c2e-0000-7000-8000-000000000001",
        "acted_for",
        "tradein/items/0197a1f4-0000-7000-8000-000000000001",
        "witnessed",
        { note: "SDK append-only capability probe" },
      );
      threadId = created.id;

      await expect(appender.sever(threadId, "witnessed")).rejects.toThrow(
        /permission denied|insufficient privilege/i,
      );
      await expect(
        appender.sqlTag`
        UPDATE yu.threads
        SET note = 'not allowed'
        WHERE id = ${threadId}::uuid
      `,
      ).rejects.toThrow(/permission denied|insufficient privilege/i);
    } finally {
      await appender.close();
      if (threadId) {
        const retained = await yuta.sqlTag`
        SELECT 1 FROM yu.threads WHERE id = ${threadId}::uuid
      `;
        if (retained.length > 0) {
          await yuta.sever(threadId, "witnessed");
        }
      }
      await yuta.execTransaction([
        "REVOKE SELECT ON test_cards.submission_cards, test_cards.item_cards FROM yu_appender",
        "REVOKE USAGE ON SCHEMA test_cards FROM yu_appender",
      ]);
    }
  });

  test("traversal outward (-> contains) finds connected cards", async () => {
    const rows = await yuta.traverse(
      "tradein/submissions/01977c2e-0000-7000-8000-000000000001",
      "->",
      "contains",
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].deck).toBe("items");
    expect(rows[0].word).toBe("contains");
    expect(rows[0].word_version).toBeGreaterThanOrEqual(1);
    expect(typeof rows[0].gloss).toBe("string");
    expect(rows[0].path).toHaveLength(1);
  });

  test("traversal inward (<- contains) finds the parent", async () => {
    const rows = await yuta.traverse(
      "tradein/items/0197a1f4-0000-7000-8000-000000000001",
      "<-",
      "contains",
    );
    expect(rows.length).toBe(1);
    expect(rows[0].deck).toBe("submissions");
  });

  test("two-hop traversal preserves both edges in every direction combination", async () => {
    const cases = [
      {
        query:
          "tradein/submissions/01977c2e-0000-7000-8000-000000000001 -> contains -> related_to",
        words: ["contains", "related_to"],
        directions: ["->", "->"],
      },
      {
        query:
          "tradein/submissions/01977c2e-0000-7000-8000-000000000001 -> contains <- contains",
        words: ["contains", "contains"],
        directions: ["->", "<-"],
      },
      {
        query:
          "tradein/items/0197a1f4-0000-7000-8000-000000000001 <- contains -> contains",
        words: ["contains", "contains"],
        directions: ["<-", "->"],
      },
      {
        query:
          "tradein/items/0197a1f4-0000-7000-8000-000000000002 <- related_to <- contains",
        words: ["related_to", "contains"],
        directions: ["<-", "<-"],
      },
    ] as const;

    for (const item of cases) {
      const result = await yuta.query(item.query);
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(result.freshness?.totalValues).toBe(result.rows.length * 2);
      const path = result.rows[0].path as Array<Record<string, unknown>>;
      expect(path).toHaveLength(2);
      expect(path.map((edge) => edge.word)).toEqual([...item.words]);
      expect(path.map((edge) => edge.direction)).toEqual([...item.directions]);
      for (const edge of path) {
        expect(edge.thread_id).toBeTruthy();
        expect(edge.word_version).toBeGreaterThanOrEqual(1);
        expect(edge.from_ref).toMatch(/^[a-z_]+\/[a-z_]+\/[0-9a-f-]{36}$/);
        expect(edge.to_ref).toMatch(/^[a-z_]+\/[a-z_]+\/[0-9a-f-]{36}$/);
        expect(edge.by).toBeTruthy();
        expect(edge.how).toBeTruthy();
        expect(edge.reading).toBe(
          edge.direction === "->" ? edge.gloss : edge.inverse,
        );
      }
    }
  });

  test("thread creates a worded connection with honesty header", async () => {
    await yuta.sqlTag`
    INSERT INTO yu.registry (book, deck, physical_schema, physical_table, native, by)
    VALUES (
      'pricing', 'quotes', 'sdk_integration', 'quotes',
      true, 'agent:test/session'
    )
  `;
    await yuta.sqlTag`
    INSERT INTO sdk_integration.quotes (id, amount, at, by, how)
    VALUES ('01984c22-0000-7000-8000-000000000001', 18.50, now(), 'agent:test/session', 'witnessed')
  `;

    const result = await yuta.thread(
      "tradein/items/0197a1f4-0000-7000-8000-000000000001",
      "priced_from",
      "pricing/quotes/01984c22-0000-7000-8000-000000000001",
      "computed",
      {
        note: 'ebay "last-sold" comp how declared src not-a-source',
        src: ["source locator with spaces", "__CLAIMANT__"],
      },
    );
    expect(result).toBeDefined();
    expect(result.note).toBe(
      'ebay "last-sold" comp how declared src not-a-source',
    );
    expect(result.by).toBe("agent:test/session");
    expect(result.how).toBe("computed");
    expect(result.src).toEqual(["source locator with spaces", "__CLAIMANT__"]);
  });

  test("thread with cached how and no src throws", async () => {
    try {
      await yuta.thread(
        "tradein/items/0197a1f4-0000-7000-8000-000000000001",
        "priced_from",
        "pricing/quotes/01984c22-0000-7000-8000-000000000001",
        "cached",
      );
      expect(false).toBe(true); // should not reach
    } catch (e) {
      expect((e as Error).message).toMatch(/src/);
    }
  });

  test("core writes reject non-canonical source array shapes", async () => {
    const invalidSourceExpressions = [
      "ARRAY[['one', 'two'], ['three', 'four']]::text[]",
      "'[0:1]={one,two}'::text[]",
    ] as const;

    for (const sourceExpression of invalidSourceExpressions) {
      await expect(
        yuta.exec(`
        INSERT INTO yu.threads (
          id, word,
          from_book, from_deck, from_id,
          to_book, to_deck, to_id,
          at, by, how, src
        ) VALUES (
          gen_random_uuid(), 'acted_for',
          'tradein', 'items',
          '0197a1f4-0000-7000-8000-000000000002',
          'tradein', 'customers',
          '01964b10-0000-7000-8000-000000000001',
          clock_timestamp(), 'agent:test/session', 'declared',
          ${sourceExpression}
        )
      `),
      ).rejects.toThrow(/threads_src_locators_valid/);
    }
  });

  test("sever ends a thread with a claim", async () => {
    const created = await yuta.thread(
      "tradein/items/0197a1f4-0000-7000-8000-000000000002",
      "priced_from",
      "pricing/quotes/01984c22-0000-7000-8000-000000000001",
      "declared",
    );
    const threadId = created.id;
    await yuta.sever(threadId, "computed", [
      "source locator with spaces",
      "__CLAIMANT__",
    ]);

    // Verify it's in the sever log
    const log =
      await yuta.sqlTag`SELECT * FROM yu.sever_log WHERE id = ${threadId}`;
    expect(log.length).toBe(1);
    expect(log[0].by).toBe("agent:test/session");
    expect(log[0].how).toBe("computed");
    expect(log[0].src).toEqual(["source locator with spaces", "__CLAIMANT__"]);
  });

  test("candidate binding rejects denormalized semantic drift", async () => {
    const wildcardHistory = await yuta.thread(
      "tradein/items/0197a1f4-0000-7000-8000-000000000001",
      "acted_for",
      "pricing/quotes/01984c22-0000-7000-8000-000000000001",
      "declared",
      { note: "sdk lower-snake sever probe" },
    );
    await yuta.sever(wildcardHistory.id, "declared");

    const fixtures = [
      {
        label: "current lexicon snapshot mismatch",
        corrupt: [
          "ALTER TABLE yu.lexicon DISABLE TRIGGER USER",
          `UPDATE yu.lexicon
         SET gloss = gloss || ' operator drift'
         WHERE word = 'acted_for'`,
          "ALTER TABLE yu.lexicon ENABLE TRIGGER USER",
        ],
        driftQuery: `
        SELECT EXISTS (
          SELECT 1
          FROM yu.lexicon parent
          JOIN yu.word_versions child
            ON child.word = parent.word
           AND child.word_version = parent.current_version
          WHERE parent.word = 'acted_for'
            AND child.gloss IS DISTINCT FROM parent.gloss
        ) AS drifted
      `,
        restore: [
          "ALTER TABLE yu.lexicon DISABLE TRIGGER USER",
          `UPDATE yu.lexicon parent
         SET gloss = child.gloss
         FROM yu.word_versions child
         WHERE child.word = parent.word
           AND child.word_version = parent.current_version
           AND parent.word = 'acted_for'`,
          "ALTER TABLE yu.lexicon ENABLE TRIGGER USER",
        ],
      },
      {
        label: "non-contiguous word snapshots",
        corrupt: [
          `INSERT INTO yu.word_versions (
           word, word_version, gloss, inverse, from_deck, to_deck, to_one,
           ttl, status, at, by, how, src
         )
         SELECT
           word, current_version + 1, gloss, inverse, from_deck, to_deck,
           to_one, ttl, status, at, by, how, src
         FROM yu.lexicon
         WHERE word = 'acted_for'`,
        ],
        driftQuery: `
        SELECT EXISTS (
          SELECT 1
          FROM yu.lexicon parent
          LEFT JOIN yu.word_versions child ON child.word = parent.word
          WHERE parent.word = 'acted_for'
          GROUP BY parent.word, parent.current_version
          HAVING count(child.word) <> parent.current_version
             OR min(child.word_version) IS DISTINCT FROM 1
             OR max(child.word_version)
                  IS DISTINCT FROM parent.current_version
        ) AS drifted
      `,
        restore: [
          "ALTER TABLE yu.word_versions DISABLE TRIGGER word_versions_immutable",
          `DELETE FROM yu.word_versions child
         USING yu.lexicon parent
         WHERE child.word = parent.word
           AND child.word = 'acted_for'
           AND child.word_version > parent.current_version`,
          "ALTER TABLE yu.word_versions ENABLE TRIGGER word_versions_immutable",
        ],
      },
      {
        label: "active thread",
        corrupt: [
          "ALTER TABLE yu.threads DISABLE TRIGGER threads_immutable",
          `UPDATE yu.threads
         SET word_to_one = NOT word_to_one
         WHERE id = (SELECT id FROM yu.threads ORDER BY id LIMIT 1)`,
          "ALTER TABLE yu.threads ENABLE TRIGGER threads_immutable",
        ],
        driftQuery: `
        SELECT EXISTS (
          SELECT 1
          FROM yu.threads child
          JOIN yu.word_versions parent
            ON parent.word = child.word
           AND parent.word_version = child.word_version
          WHERE child.word_to_one IS DISTINCT FROM parent.to_one
        ) AS drifted
      `,
        restore: [
          "ALTER TABLE yu.threads DISABLE TRIGGER threads_immutable",
          `UPDATE yu.threads child
         SET word_to_one = parent.to_one
         FROM yu.word_versions parent
         WHERE parent.word = child.word
           AND parent.word_version = child.word_version
           AND child.word_to_one IS DISTINCT FROM parent.to_one`,
          "ALTER TABLE yu.threads ENABLE TRIGGER threads_immutable",
        ],
      },
      {
        label: "active endpoint pattern",
        corrupt: [
          "ALTER TABLE yu.threads DISABLE TRIGGER threads_immutable",
          `UPDATE yu.threads
         SET from_book = 'tradein',
             from_deck = 'customers',
             from_id = '01964b10-0000-7000-8000-000000000001'
         WHERE id = (
           SELECT id
           FROM yu.threads
           WHERE word = 'priced_from'
             AND by = 'agent:test/session'
           ORDER BY id
           LIMIT 1
         )`,
          "ALTER TABLE yu.threads ENABLE TRIGGER threads_immutable",
        ],
        driftQuery: `
        SELECT EXISTS (
          SELECT 1
          FROM yu.threads thread
          JOIN yu.word_versions word
            ON word.word = thread.word
           AND word.word_version = thread.word_version
          WHERE thread.word = 'priced_from'
            AND thread.by = 'agent:test/session'
            AND NOT yu._deck_matches(
              word.from_deck, thread.from_book, thread.from_deck
            )
        ) AS drifted
      `,
        restore: [
          "ALTER TABLE yu.threads DISABLE TRIGGER threads_immutable",
          `UPDATE yu.threads
         SET from_book = 'tradein',
             from_deck = 'items',
             from_id = '0197a1f4-0000-7000-8000-000000000001'
         WHERE word = 'priced_from'
           AND by = 'agent:test/session'
           AND from_book = 'tradein'
           AND from_deck = 'customers'`,
          "ALTER TABLE yu.threads ENABLE TRIGGER threads_immutable",
        ],
      },
      {
        label: "severed thread history",
        corrupt: [
          "ALTER TABLE yu.sever_log DISABLE TRIGGER sever_log_immutable",
          `UPDATE yu.sever_log
         SET word_to_one = NOT word_to_one
         WHERE id = (SELECT id FROM yu.sever_log ORDER BY id LIMIT 1)`,
          "ALTER TABLE yu.sever_log ENABLE TRIGGER sever_log_immutable",
        ],
        driftQuery: `
        SELECT EXISTS (
          SELECT 1
          FROM yu.sever_log child
          JOIN yu.word_versions parent
            ON parent.word = child.word
           AND parent.word_version = child.word_version
          WHERE child.word_to_one IS DISTINCT FROM parent.to_one
        ) AS drifted
      `,
        restore: [
          "ALTER TABLE yu.sever_log DISABLE TRIGGER sever_log_immutable",
          `UPDATE yu.sever_log child
         SET word_to_one = parent.to_one
         FROM yu.word_versions parent
         WHERE parent.word = child.word
           AND parent.word_version = child.word_version
           AND child.word_to_one IS DISTINCT FROM parent.to_one`,
          "ALTER TABLE yu.sever_log ENABLE TRIGGER sever_log_immutable",
        ],
      },
      {
        label: "severed endpoint pattern",
        corrupt: [
          "ALTER TABLE yu.sever_log DISABLE TRIGGER sever_log_immutable",
          `UPDATE yu.sever_log
         SET from_book = 'mismatch',
             from_deck = 'cards'
         WHERE id = (
           SELECT id
           FROM yu.sever_log
           WHERE word = 'priced_from'
             AND thread_by = 'agent:test/session'
           ORDER BY id
           LIMIT 1
         )`,
          "ALTER TABLE yu.sever_log ENABLE TRIGGER sever_log_immutable",
        ],
        driftQuery: `
        SELECT EXISTS (
          SELECT 1
          FROM yu.sever_log history
          JOIN yu.word_versions word
            ON word.word = history.word
           AND word.word_version = history.word_version
          WHERE history.word = 'priced_from'
            AND history.thread_by = 'agent:test/session'
            AND (
              NOT yu._deck_matches(
                word.from_deck, history.from_book, history.from_deck
              )
              OR NOT yu._deck_matches(
                word.to_deck, history.to_book, history.to_deck
              )
            )
        ) AS drifted
      `,
        restore: [
          "ALTER TABLE yu.sever_log DISABLE TRIGGER sever_log_immutable",
          `UPDATE yu.sever_log
         SET from_book = 'tradein',
             from_deck = 'items'
         WHERE word = 'priced_from'
           AND thread_by = 'agent:test/session'
           AND from_book = 'mismatch'
           AND from_deck = 'cards'`,
          "ALTER TABLE yu.sever_log ENABLE TRIGGER sever_log_immutable",
        ],
      },
      {
        label: "partial original thread claim",
        corrupt: [
          "ALTER TABLE yu.sever_log DISABLE TRIGGER sever_log_immutable",
          `UPDATE yu.sever_log
         SET thread_by = NULL
         WHERE id = (
           SELECT id
           FROM yu.sever_log
           WHERE word = 'priced_from'
             AND thread_by = 'agent:test/session'
           ORDER BY id
           LIMIT 1
         )`,
          "ALTER TABLE yu.sever_log ENABLE TRIGGER sever_log_immutable",
        ],
        driftQuery: `
        SELECT EXISTS (
          SELECT 1
          FROM yu.sever_log history
          WHERE history.word = 'priced_from'
            AND history.thread_at IS NOT NULL
            AND history.thread_by IS NULL
            AND history.thread_how IS NOT NULL
        ) AS drifted
      `,
        restore: [
          "ALTER TABLE yu.sever_log DISABLE TRIGGER sever_log_immutable",
          `UPDATE yu.sever_log
         SET thread_by = 'agent:test/session'
         WHERE word = 'priced_from'
           AND thread_at IS NOT NULL
           AND thread_by IS NULL
           AND thread_how IS NOT NULL`,
          "ALTER TABLE yu.sever_log ENABLE TRIGGER sever_log_immutable",
        ],
      },
      {
        label: "non-lower-snake sever endpoint",
        corrupt: [
          "ALTER TABLE yu.sever_log DISABLE TRIGGER sever_log_immutable",
          `UPDATE yu.sever_log
         SET from_book = 'Bad-Book'
         WHERE note = 'sdk lower-snake sever probe'`,
          "ALTER TABLE yu.sever_log ENABLE TRIGGER sever_log_immutable",
        ],
        driftQuery: `
        SELECT EXISTS (
          SELECT 1
          FROM yu.sever_log
          WHERE note = 'sdk lower-snake sever probe'
            AND from_book !~ '^[a-z_][a-z0-9_]*$'
        ) AS drifted
      `,
        restore: [
          "ALTER TABLE yu.sever_log DISABLE TRIGGER sever_log_immutable",
          `UPDATE yu.sever_log
         SET from_book = 'tradein'
         WHERE note = 'sdk lower-snake sever probe'`,
          "ALTER TABLE yu.sever_log ENABLE TRIGGER sever_log_immutable",
        ],
      },
    ] as const;

    for (const fixture of fixtures) {
      let probe: Yuta | undefined;
      try {
        await yuta.execTransaction(fixture.corrupt);
        const drift = await yuta.exec<{ drifted: boolean }>(fixture.driftQuery);
        expect(drift[0]?.drifted, fixture.label).toBe(true);

        // The main client has already cached a successful binding observation.
        // A new client models a new operation/session observing current state.
        probe = new Yuta({
          connectionString: DB_URL,
          claimant: "agent:test/pinned-meaning-probe",
        });
        await expect(probe.assertCandidateBinding()).rejects.toThrow(
          /PARTIAL YUTABASE INSTALL/,
        );
      } finally {
        if (probe) await probe.close();
        await yuta.execTransaction(fixture.restore);
      }

      const repaired = await yuta.exec<{ drifted: boolean }>(
        fixture.driftQuery,
      );
      expect(repaired[0]?.drifted, fixture.label).toBe(false);
    }
  });

  test("cached clients recheck metadata before the next semantic operation", async () => {
    // The preceding semantic operations have cached the expensive full catalog
    // binding. Raw SQL remains an explicit operator escape hatch for creating
    // this disposable drift.
    await yuta.sqlTag`
    UPDATE yu.standard_meta
    SET revision = 4,
        capabilities = ${[...REVISION_FOUR_CAPABILITIES]}::text[]
    WHERE singleton
  `;
    try {
      await expect(
        yuta.card("tradein/submissions/01977c2e-0000-7000-8000-000000000001"),
      ).rejects.toThrow(/STALE YUTABASE BINDING/);
    } finally {
      await yuta.sqlTag`
      UPDATE yu.standard_meta
      SET revision = 5,
          capabilities = ${[...CANDIDATE_CAPABILITIES]}::text[]
      WHERE singleton
    `;
    }

    const restored = await yuta.card(
      "tradein/submissions/01977c2e-0000-7000-8000-000000000001",
    );
    expect(restored?.state).toBe("pending");
  });

  test("fresh bindings reject executable catalog and privilege drift", async () => {
    const functionDefinition = await yuta.exec<{ definition: string }>(`
    SELECT pg_catalog.pg_get_functiondef(
      'yu._guard_delete()'::regprocedure
    ) AS definition
  `);
    const originalGuard = functionDefinition[0]?.definition;
    if (!originalGuard) throw new Error("missing canonical guard definition");

    const fixtures = [
      {
        label: "destructive capability ACL",
        corrupt: ["GRANT DELETE ON yu.thread_ids TO yu_writer"],
        restore: ["REVOKE DELETE ON yu.thread_ids FROM yu_writer"],
      },
      {
        label: "missing appender thread grant",
        corrupt: ["REVOKE INSERT ON yu.threads FROM yu_appender"],
        restore: ["GRANT INSERT ON yu.threads TO yu_appender"],
      },
      {
        label: "capability role ownership",
        corrupt: ["ALTER TABLE yu.thread_ids OWNER TO yu_writer"],
        restore: ["ALTER TABLE yu.thread_ids OWNER TO CURRENT_USER"],
      },
      {
        label: "unexpected yu relation",
        corrupt: ["CREATE TABLE yu.unexpected_sdk_relation (id integer)"],
        restore: ["DROP TABLE yu.unexpected_sdk_relation"],
      },
      {
        label: "unexpected via routine",
        corrupt: [
          `CREATE FUNCTION via.unexpected_sdk_routine()
         RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 1 $$`,
        ],
        restore: ["DROP FUNCTION via.unexpected_sdk_routine()"],
      },
      {
        label: "unexpected yu procedure",
        corrupt: [
          `CREATE PROCEDURE yu.unexpected_sdk_procedure()
         LANGUAGE plpgsql AS $$ BEGIN NULL; END $$`,
        ],
        restore: ["DROP PROCEDURE yu.unexpected_sdk_procedure()"],
      },
    ] as const;

    for (const fixture of fixtures) {
      let probe: Yuta | undefined;
      try {
        await yuta.execTransaction(fixture.corrupt);
        probe = new Yuta({
          connectionString: DB_URL,
          claimant: "agent:test/catalog-drift-probe",
        });
        await expect(
          probe.assertCandidateBinding(),
          fixture.label,
        ).rejects.toThrow(/PARTIAL YUTABASE INSTALL/);
      } finally {
        if (probe) await probe.close();
        await yuta.execTransaction(fixture.restore);
      }
    }

    let bodyProbe: Yuta | undefined;
    try {
      await yuta.exec(`
      CREATE OR REPLACE FUNCTION yu._guard_delete()
      RETURNS trigger AS $body$
      BEGIN
        RETURN OLD;
      END
      $body$ LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = pg_catalog, yu, pg_temp
      SET row_security = off
    `);
      bodyProbe = new Yuta({
        connectionString: DB_URL,
        claimant: "agent:test/function-body-probe",
      });
      await expect(bodyProbe.assertCandidateBinding()).rejects.toThrow(
        /PARTIAL YUTABASE INSTALL/,
      );
    } finally {
      if (bodyProbe) await bodyProbe.close();
      await yuta.exec(originalGuard);
    }

    const repaired = new Yuta({
      connectionString: DB_URL,
      claimant: "agent:test/catalog-repaired-probe",
    });
    try {
      await expect(repaired.assertCandidateBinding()).resolves.toBeUndefined();
    } finally {
      await repaired.close();
    }
  });

  test("explain returns SQL without executing", () => {
    const sql = yuta.explain(
      'cards tradein/submissions where status="pending" newest 5',
    );
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
