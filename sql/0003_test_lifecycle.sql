-- YUTABASE 0.1.0-candidate.1 lifecycle conformance test
--
-- Run only after 0001, 0002, and 0004, against a disposable database:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f sql/0003_test_lifecycle.sql
--
-- Every negative test raises an exception if the expected refusal does not
-- happen. A printed success line can never turn a failed assertion green.

\set ON_ERROR_STOP on
\echo '=== YUTABASE candidate lifecycle ==='

-- ──────────────────────────────────────────────────────────
-- Candidate identity and role surface
-- ──────────────────────────────────────────────────────────

DO $$
BEGIN
  IF (SELECT count(*) FROM yu.standard_meta) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM yu.standard_meta
       WHERE singleton
         AND standard = 'YUTABASE'
         AND profile = 'postgres'
         AND version = '0.1.0-candidate.1'
         AND revision = 4
         AND capabilities @> ARRAY[
           'word-version-pinning',
           'global-thread-id-ledger',
           'endpoint-existence-on-insert',
           'concurrency-safe-to-one'
         ]::text[]
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: candidate identity is absent or incorrect';
  END IF;

  IF NOT pg_has_role('yu_writer', 'yu_reader', 'member')
     OR NOT has_table_privilege('yu_writer', 'yu.threads', 'INSERT')
     OR has_table_privilege('yu_writer', 'yu.threads', 'UPDATE')
     OR has_table_privilege('yu_writer', 'yu.threads', 'DELETE')
     OR has_column_privilege('yu_writer', 'yu.threads', 'note', 'UPDATE')
     OR has_schema_privilege('yu_writer', 'yu', 'CREATE')
     OR has_table_privilege('yu_writer', 'yu.thread_ids', 'INSERT')
     OR has_table_privilege('yu_writer', 'yu.thread_ids', 'DELETE')
     OR has_table_privilege('yu_lexicographer', 'yu.lexicon_versions', 'INSERT')
     OR NOT has_function_privilege(
       'yu_writer',
       'yu._lock_thread_context(text,text,text,uuid,text,text,uuid)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'yu_lexicographer',
       'yu._registry_referenced_ids(text,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'yu_writer', 'yu.sever(uuid,text,text,text[])', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: candidate role capabilities are incorrect';
  END IF;

  IF (
       SELECT prosecdef
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._validate_thread()')
     ) OR (
       SELECT prosecdef
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._validate_registry_mapping()')
     ) OR NOT (
       SELECT prosecdef
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._lock_thread_context(text,text,text,uuid,text,text,uuid)')
     ) OR NOT (
       SELECT prosecdef
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._registry_referenced_ids(text,text)')
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: invoker/definer privilege split is incorrect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('yu._registry_referenced_ids(text,text)'),
      ('yu._begin_word_version()'),
      ('yu._capture_word_version()'),
      ('yu._reserve_thread_id()'),
      ('yu._lock_thread_context(text,text,text,uuid,text,text,uuid)'),
      ('yu._version_gloss()'),
      ('yu.sever(uuid,text,text,text[])'),
      ('yu._guard_delete()'),
      ('yu.refresh_via()')
    ) AS required(signature)
    LEFT JOIN pg_catalog.pg_proc p
      ON p.oid = to_regprocedure(required.signature)
    WHERE p.oid IS NULL
       OR NOT coalesce(p.proconfig, '{}'::text[]) @> ARRAY['row_security=off']
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: global definer paths do not fail closed under FORCE RLS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    WHERE c.oid = to_regclass('via.contains')
      AND coalesce(c.reloptions, '{}'::text[]) @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: generated views are not security-invoker';
  END IF;
END $$;

SET ROLE yu_lexicographer;
DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO yu.lexicon_versions (
      version_id, word, gloss, inverse, changed_at, changed_by
    ) OVERRIDING SYSTEM VALUE VALUES (
      999999, 'contains', 'fabricated', 'fabricated by',
      clock_timestamp(), 'agent:test'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: lexicographer could fabricate compatibility history';
  END IF;
END $$;
RESET ROLE;

\echo 'ok - candidate identity and role capabilities'

-- ──────────────────────────────────────────────────────────
-- Logical decks mapped onto differently named physical tables
-- ──────────────────────────────────────────────────────────

CREATE SCHEMA test_cards;

CREATE TABLE test_cards.submission_cards (
  card_uuid uuid PRIMARY KEY,
  state text NOT NULL,
  claimed_at timestamptz NOT NULL,
  claimant text NOT NULL,
  claim_kind text NOT NULL,
  sources text[]
);

CREATE TABLE test_cards.item_cards (
  card_uuid uuid PRIMARY KEY,
  name text NOT NULL,
  claimed_at timestamptz NOT NULL,
  claimant text NOT NULL,
  claim_kind text NOT NULL,
  sources text[]
);

CREATE TABLE test_cards.customer_cards (
  card_uuid uuid PRIMARY KEY,
  name text NOT NULL,
  claimed_at timestamptz NOT NULL,
  claimant text NOT NULL,
  claim_kind text NOT NULL,
  sources text[]
);

CREATE TABLE test_cards.empty_item_cards (
  card_uuid uuid PRIMARY KEY,
  name text NOT NULL,
  claimed_at timestamptz NOT NULL,
  claimant text NOT NULL,
  claim_kind text NOT NULL,
  sources text[]
);

INSERT INTO yu.registry (
  book, deck, physical_schema, physical_table,
  id_col, at_col, by_col, how_col, src_col,
  ttl, native, by
) VALUES
  (
    'tradein', 'submissions', 'test_cards', 'submission_cards',
    'card_uuid', 'claimed_at', 'claimant', 'claim_kind', 'sources',
    NULL, false, 'human:test'
  ),
  (
    'tradein', 'items', 'test_cards', 'item_cards',
    'card_uuid', 'claimed_at', 'claimant', 'claim_kind', 'sources',
    interval '1 hour', false, 'human:test'
  ),
  (
    'tradein', 'customers', 'test_cards', 'customer_cards',
    'card_uuid', 'claimed_at', 'claimant', 'claim_kind', 'sources',
    NULL, false, 'human:test'
  );

CREATE TRIGGER submission_cards_guard_delete
  BEFORE DELETE ON test_cards.submission_cards
  FOR EACH ROW EXECUTE FUNCTION yu._guard_delete();
CREATE TRIGGER item_cards_guard_delete
  BEFORE DELETE ON test_cards.item_cards
  FOR EACH ROW EXECUTE FUNCTION yu._guard_delete();
CREATE TRIGGER customer_cards_guard_delete
  BEFORE DELETE ON test_cards.customer_cards
  FOR EACH ROW EXECUTE FUNCTION yu._guard_delete();

-- A UUID-typed column is not enough: card identity must also be unique.
CREATE TABLE test_cards.no_unique_identity (
  card_uuid uuid NOT NULL,
  claimed_at timestamptz NOT NULL,
  claimant text NOT NULL,
  claim_kind text NOT NULL,
  sources text[]
);

CREATE TABLE test_cards.nullable_unique_identity (
  card_uuid uuid UNIQUE,
  claimed_at timestamptz NOT NULL,
  claimant text NOT NULL,
  claim_kind text NOT NULL,
  sources text[]
);

CREATE UNLOGGED TABLE test_cards.unlogged_cards (
  card_uuid uuid PRIMARY KEY,
  claimed_at timestamptz NOT NULL,
  claimant text NOT NULL,
  claim_kind text NOT NULL,
  sources text[]
);

CREATE TEMP TABLE temporary_cards (
  card_uuid uuid PRIMARY KEY,
  claimed_at timestamptz NOT NULL,
  claimant text NOT NULL,
  claim_kind text NOT NULL,
  sources text[]
);

CREATE TABLE test_cards.partitioned_cards (
  card_uuid uuid PRIMARY KEY,
  claimed_at timestamptz NOT NULL,
  claimant text NOT NULL,
  claim_kind text NOT NULL,
  sources text[]
) PARTITION BY HASH (card_uuid);

CREATE TABLE test_cards.inherited_parent_cards (
  card_uuid uuid PRIMARY KEY,
  claimed_at timestamptz NOT NULL,
  claimant text NOT NULL,
  claim_kind text NOT NULL,
  sources text[]
);

CREATE TABLE test_cards.inherited_child_cards ()
  INHERITS (test_cards.inherited_parent_cards);
ALTER TABLE test_cards.inherited_child_cards ADD PRIMARY KEY (card_uuid);

DO $$
DECLARE
  refused_unlogged boolean := false;
  refused_temporary boolean := false;
  refused_partitioned boolean := false;
  refused_inherited_parent boolean := false;
  refused_inherited_child boolean := false;
  temporary_schema text;
BEGIN
  BEGIN
    INSERT INTO yu.registry (
      book, deck, physical_schema, physical_table,
      id_col, at_col, by_col, how_col, src_col, native, by
    ) VALUES (
      'test', 'unlogged', 'test_cards', 'unlogged_cards',
      'card_uuid', 'claimed_at', 'claimant', 'claim_kind', 'sources',
      false, 'human:test'
    );
  EXCEPTION WHEN invalid_table_definition THEN
    refused_unlogged := true;
  END;

  SELECT n.nspname INTO STRICT temporary_schema
  FROM pg_catalog.pg_namespace n
  WHERE n.oid = pg_catalog.pg_my_temp_schema();

  BEGIN
    INSERT INTO yu.registry (
      book, deck, physical_schema, physical_table,
      id_col, at_col, by_col, how_col, src_col, native, by
    ) VALUES (
      'test', 'temporary', temporary_schema, 'temporary_cards',
      'card_uuid', 'claimed_at', 'claimant', 'claim_kind', 'sources',
      false, 'human:test'
    );
  EXCEPTION WHEN invalid_table_definition THEN
    refused_temporary := true;
  END;

  BEGIN
    INSERT INTO yu.registry (
      book, deck, physical_schema, physical_table,
      id_col, at_col, by_col, how_col, src_col, native, by
    ) VALUES (
      'test', 'partitioned', 'test_cards', 'partitioned_cards',
      'card_uuid', 'claimed_at', 'claimant', 'claim_kind', 'sources',
      false, 'human:test'
    );
  EXCEPTION WHEN invalid_table_definition THEN
    refused_partitioned := true;
  END;

  BEGIN
    INSERT INTO yu.registry (
      book, deck, physical_schema, physical_table,
      id_col, at_col, by_col, how_col, src_col, native, by
    ) VALUES (
      'test', 'inherited_parent', 'test_cards', 'inherited_parent_cards',
      'card_uuid', 'claimed_at', 'claimant', 'claim_kind', 'sources',
      false, 'human:test'
    );
  EXCEPTION WHEN invalid_table_definition THEN
    refused_inherited_parent := true;
  END;

  BEGIN
    INSERT INTO yu.registry (
      book, deck, physical_schema, physical_table,
      id_col, at_col, by_col, how_col, src_col, native, by
    ) VALUES (
      'test', 'inherited_child', 'test_cards', 'inherited_child_cards',
      'card_uuid', 'claimed_at', 'claimant', 'claim_kind', 'sources',
      false, 'human:test'
    );
  EXCEPTION WHEN invalid_table_definition THEN
    refused_inherited_child := true;
  END;

  IF NOT refused_unlogged
     OR NOT refused_temporary
     OR NOT refused_partitioned
     OR NOT refused_inherited_parent
     OR NOT refused_inherited_child THEN
    RAISE EXCEPTION 'TEST FAILED: registry accepted a non-standalone-permanent-ordinary physical deck';
  END IF;
END $$;

-- PostgreSQL truncates identifiers after 63 bytes. A stored 64-byte mapping
-- must not silently resolve to an existing 63-byte physical table.
DO $$
DECLARE
  refused boolean := false;
BEGIN
  EXECUTE format(
    'CREATE TABLE test_cards.%I (
       card_uuid uuid PRIMARY KEY,
       claimed_at timestamptz NOT NULL,
       claimant text NOT NULL,
       claim_kind text NOT NULL,
       sources text[]
     )',
    repeat('p', 63)
  );

  BEGIN
    INSERT INTO yu.registry (
      book, deck, physical_schema, physical_table,
      id_col, at_col, by_col, how_col, src_col, native, by
    ) VALUES (
      'test', 'overlong_physical', 'test_cards', repeat('p', 64),
      'card_uuid', 'claimed_at', 'claimant', 'claim_kind', 'sources',
      false, 'human:test'
    );
  EXCEPTION
    WHEN undefined_table OR check_violation OR name_too_long THEN
      refused := true;
  END;

  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: registry accepted a truncated physical-table alias';
  END IF;

  EXECUTE format('DROP TABLE test_cards.%I', repeat('p', 63));
END $$;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO yu.registry (
      book, deck, physical_schema, physical_table,
      id_col, at_col, by_col, how_col, src_col, native, by
    ) VALUES (
      'test', 'bad', 'test_cards', 'no_unique_identity',
      'card_uuid', 'claimed_at', 'claimant', 'claim_kind', 'sources',
      false, 'human:test'
    );
  EXCEPTION WHEN invalid_table_definition THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: registry accepted a non-unique card identity';
  END IF;
END $$;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO yu.registry (
      book, deck, physical_schema, physical_table,
      id_col, at_col, by_col, how_col, src_col, native, by
    ) VALUES (
      'test', 'nullable_identity', 'test_cards', 'nullable_unique_identity',
      'card_uuid', 'claimed_at', 'claimant', 'claim_kind', 'sources',
      false, 'human:test'
    );
  EXCEPTION WHEN datatype_mismatch THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: registry accepted a nullable card identity';
  END IF;
END $$;

INSERT INTO test_cards.customer_cards VALUES
  ('01964b10-0000-7000-8000-000000000001', 'Walk-in Club', clock_timestamp(), 'human:test', 'witnessed', NULL);

INSERT INTO test_cards.submission_cards VALUES
  ('01977c2e-0000-7000-8000-000000000001', 'pending', clock_timestamp(), 'human:test', 'witnessed', NULL);

INSERT INTO test_cards.item_cards VALUES
  ('0197a1f4-0000-7000-8000-000000000001', 'Charizard', clock_timestamp(), 'human:test', 'witnessed', NULL),
  ('0197a1f4-0000-7000-8000-000000000002', 'Pikachu', clock_timestamp(), 'human:test', 'witnessed', NULL),
  ('0197a1f4-0000-7000-8000-000000000003', 'Mew', clock_timestamp(), 'human:test', 'witnessed', NULL),
  ('0197a1f4-0000-7000-8000-000000000004', 'Cached listing', clock_timestamp() - interval '2 hours', 'agent:test', 'cached', ARRAY['test/source/1']);

SET ROLE yu_reader;
DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    PERFORM yu._card_exists(
      'tradein', 'items', '0197a1f4-0000-7000-8000-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: reader role gained an application-deck existence oracle';
  END IF;
END $$;
RESET ROLE;

-- Writer endpoint validation is security-invoker. Grant only the writer the
-- application-deck read surface after proving the reader lacks that oracle.
GRANT USAGE ON SCHEMA test_cards TO yu_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA test_cards TO yu_writer;

\echo 'ok - logical/physical registry mapping and unique card identity'

-- ──────────────────────────────────────────────────────────
-- Vocabulary: meaningful names are governed by claims, not a blocklist
-- ──────────────────────────────────────────────────────────

SET ROLE yu_lexicographer;

INSERT INTO yu.lexicon (
  word, gloss, inverse, from_deck, to_deck, to_one, ttl,
  status, at, by, how, src
) VALUES
  (
    'related_to',
    'this card has the locally declared contextual relation to that card',
    'contextually related from',
    '*/*', '*/*', false, NULL,
    'live', clock_timestamp(), 'human:test', 'declared', NULL
  ),
  (
    'narrows_to_one',
    'this source may narrow from many active targets to one',
    'is the narrowed target of',
    '*/*', '*/*', false, NULL,
    'live', clock_timestamp(), 'human:test', 'declared', NULL
  ),
  (
    repeat('w', 63),
    'a boundary-length PostgreSQL view identifier remains exact',
    'is exactly addressed by the boundary-length relation',
    '*/*', '*/*', false, NULL,
    'live', clock_timestamp(), 'human:test', 'declared', NULL
  );

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO yu.lexicon (
      word, gloss, inverse, from_deck, to_deck,
      at, by, how
    ) VALUES (
      repeat('w', 64), 'overlong word', 'overlong inverse', '*/*', '*/*',
      clock_timestamp(), 'human:test', 'declared'
    );
  EXCEPTION WHEN check_violation OR name_too_long THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: lexicon accepted a word longer than 63 bytes';
  END IF;
END $$;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO yu.lexicon (
      word, gloss, inverse, from_deck, to_deck, current_version,
      at, by, how
    ) VALUES (
      'invalid_version_start', 'invalid version start', 'invalid inverse',
      '*/*', '*/*', 2, clock_timestamp(), 'human:test', 'declared'
    );
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: a new word selected a version other than 1';
  END IF;
END $$;

SELECT yu.refresh_via();
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM yu.word_versions
    WHERE word = 'related_to' AND word_version = 1
  ) OR to_regclass('via.related_to') IS NULL
    OR to_regclass(format('via.%I', repeat('w', 63))) IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: a valid coined word was not versioned/queryable';
  END IF;
END $$;

\echo 'ok - no spelling blocklist; all new words begin at version 1'

-- ──────────────────────────────────────────────────────────
-- Writer path, endpoint existence, claims, and to_one
-- ──────────────────────────────────────────────────────────

SET ROLE yu_writer;

INSERT INTO yu.threads (
  id, word,
  from_book, from_deck, from_id,
  to_book, to_deck, to_id,
  note, at, by, how, src
) VALUES (
  '01980000-0000-7000-8000-000000000001', 'contains',
  'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
  'tradein', 'items', '0197a1f4-0000-7000-8000-000000000001',
  'version one relation', clock_timestamp(), 'agent:test', 'witnessed', NULL
);

INSERT INTO yu.threads (
  id, word,
  from_book, from_deck, from_id,
  to_book, to_deck, to_id,
  at, by, how, src
) VALUES (
  '01980000-0000-7000-8000-000000000002', 'related_to',
  'tradein', 'items', '0197a1f4-0000-7000-8000-000000000001',
  'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002',
  clock_timestamp() - interval '2 hours', 'agent:test', 'cached', ARRAY['test/context/1']
);

INSERT INTO yu.threads (
  id, word,
  from_book, from_deck, from_id,
  to_book, to_deck, to_id,
  at, by, how
) VALUES
  (
    '01980000-0000-7000-8000-000000000005', 'related_to',
    'tradein', 'items', '0197a1f4-0000-7000-8000-000000000004',
    'tradein', 'items', '0197a1f4-0000-7000-8000-000000000001',
    clock_timestamp(), 'agent:test', 'witnessed'
  ),
  (
    '01980000-0000-7000-8000-000000000007', 'related_to',
    'tradein', 'items', '0197a1f4-0000-7000-8000-000000000004',
    'tradein', 'customers', '01964b10-0000-7000-8000-000000000001',
    clock_timestamp(), 'agent:test', 'witnessed'
  ),
  (
    '01980000-0000-7000-8000-000000000006', 'narrows_to_one',
    'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002',
    'tradein', 'items', '0197a1f4-0000-7000-8000-000000000001',
    clock_timestamp(), 'agent:test', 'witnessed'
  );

-- A row skipped by another unique constraint must not burn its unused UUID in
-- the lifetime ledger.
INSERT INTO yu.threads (
  id, word,
  from_book, from_deck, from_id,
  to_book, to_deck, to_id,
  at, by, how
) VALUES (
  '01980000-0000-7000-8000-0000000000ff', 'related_to',
  'tradein', 'items', '0197a1f4-0000-7000-8000-000000000001',
  'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002',
  clock_timestamp(), 'agent:test', 'witnessed'
) ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM yu.thread_ids
    WHERE id = '01980000-0000-7000-8000-0000000000ff'
  ) OR EXISTS (
    SELECT 1 FROM yu.threads
    WHERE id = '01980000-0000-7000-8000-0000000000ff'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: ON CONFLICT burned an unused thread UUID';
  END IF;
END $$;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO yu.threads (
      id, word, from_book, from_deck, from_id,
      to_book, to_deck, to_id, at, by, how
    ) VALUES (
      gen_random_uuid(), 'not_declared',
      'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
      'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002',
      clock_timestamp(), 'agent:test', 'witnessed'
    );
  EXCEPTION WHEN foreign_key_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: thread accepted an undeclared word';
  END IF;
END $$;

RESET ROLE;
SET ROLE yu_lexicographer;
DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    UPDATE yu.lexicon
    SET to_one = true,
        at = clock_timestamp(),
        by = 'human:test',
        how = 'declared',
        src = NULL
    WHERE word = 'related_to';
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: to_one transition accepted duplicate outgoing threads';
  END IF;
END $$;

UPDATE yu.lexicon
SET to_one = true,
    at = clock_timestamp(),
    by = 'human:test',
    how = 'declared',
    src = NULL
WHERE word = 'narrows_to_one';
RESET ROLE;

SET ROLE yu_writer;
DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO yu.threads (
      id, word, from_book, from_deck, from_id,
      to_book, to_deck, to_id, at, by, how
    ) VALUES (
      gen_random_uuid(), 'narrows_to_one',
      'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002',
      'tradein', 'items', '0197a1f4-0000-7000-8000-000000000003',
      clock_timestamp(), 'agent:test', 'witnessed'
    );
  EXCEPTION WHEN unique_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: narrowed to_one word ignored an older active thread';
  END IF;
END $$;

DO $$
BEGIN
  IF (SELECT to_one FROM yu.lexicon WHERE word = 'related_to')
     OR NOT (SELECT to_one FROM yu.lexicon WHERE word = 'narrows_to_one')
     OR NOT EXISTS (
       SELECT 1 FROM yu.threads
       WHERE id = '01980000-0000-7000-8000-000000000006'
         AND word_version = 1
         AND NOT word_to_one
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: to_one transition did not preserve pinned history';
  END IF;
END $$;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO yu.threads (
      id, word, from_book, from_deck, from_id,
      to_book, to_deck, to_id, at, by, how
    ) VALUES (
      gen_random_uuid(), 'contains',
      'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
      'tradein', 'items', '0197a1f4-0000-7000-8000-ffffffffffff',
      clock_timestamp(), 'agent:test', 'witnessed'
    );
  EXCEPTION WHEN foreign_key_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: thread accepted a missing physical endpoint';
  END IF;
END $$;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO yu.threads (
      id, word, from_book, from_deck, from_id,
      to_book, to_deck, to_id, at, by, how
    ) VALUES (
      gen_random_uuid(), 'contains',
      'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
      'tradein', 'customers', '01964b10-0000-7000-8000-000000000001',
      clock_timestamp(), 'agent:test', 'witnessed'
    );
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: thread accepted an endpoint-pattern mismatch';
  END IF;
END $$;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO yu.threads (
      id, word, from_book, from_deck, from_id,
      to_book, to_deck, to_id, at, by, how, src
    ) VALUES (
      gen_random_uuid(), 'acted_for',
      'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002',
      'tradein', 'customers', '01964b10-0000-7000-8000-000000000001',
      clock_timestamp(), 'agent:test', 'computed', ARRAY[]::text[]
    );
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: computed thread accepted an empty src';
  END IF;
END $$;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO yu.threads (
      id, word, from_book, from_deck, from_id,
      to_book, to_deck, to_id, at, by, how
    ) VALUES
      (
        gen_random_uuid(), 'supersedes',
        'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
        'tradein', 'items', '0197a1f4-0000-7000-8000-000000000001',
        clock_timestamp(), 'agent:test', 'declared'
      ),
      (
        gen_random_uuid(), 'supersedes',
        'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
        'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002',
        clock_timestamp(), 'agent:test', 'declared'
      );
  EXCEPTION WHEN unique_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: to_one accepted two active relations';
  END IF;
END $$;

RESET ROLE;

CREATE TABLE test_cards.remap_item_cards
  (LIKE test_cards.item_cards INCLUDING ALL);
INSERT INTO test_cards.remap_item_cards
  SELECT * FROM test_cards.item_cards;
GRANT USAGE ON SCHEMA test_cards TO yu_lexicographer;
GRANT SELECT ON test_cards.remap_item_cards TO yu_lexicographer;

ALTER TABLE yu.threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY lifecycle_hide_threads
  ON yu.threads FOR SELECT TO yu_reader USING (false);
CREATE POLICY lifecycle_allow_writer_insert
  ON yu.threads FOR INSERT TO yu_writer WITH CHECK (true);

SET ROLE yu_lexicographer;
UPDATE yu.registry
SET physical_table = 'remap_item_cards',
    at = clock_timestamp(),
    by = 'human:test/lexicographer'
WHERE book = 'tradein' AND deck = 'items';
RESET ROLE;

DO $$
BEGIN
  IF (SELECT physical_table FROM yu.registry
      WHERE book = 'tradein' AND deck = 'items') <> 'remap_item_cards' THEN
    RAISE EXCEPTION 'TEST FAILED: authorized lexicographer remap was refused';
  END IF;
END $$;

UPDATE yu.registry
SET physical_table = 'item_cards',
    at = clock_timestamp(),
    by = 'human:test/reset'
WHERE book = 'tradein' AND deck = 'items';
DROP TABLE test_cards.remap_item_cards;

SET ROLE yu_lexicographer;
DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    UPDATE yu.lexicon
    SET to_one = true,
        at = clock_timestamp(),
        by = 'human:test/rls',
        how = 'declared',
        src = NULL
    WHERE word = 'related_to';
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: RLS hid duplicate sources from a to_one transition';
  END IF;
END $$;
RESET ROLE;

SET ROLE yu_writer;
DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO yu.threads (
      id, word,
      from_book, from_deck, from_id,
      to_book, to_deck, to_id,
      at, by, how
    ) VALUES (
      '019b0000-0000-7000-8000-000000000001', 'narrows_to_one',
      'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002',
      'tradein', 'items', '0197a1f4-0000-7000-8000-000000000003',
      clock_timestamp(), 'agent:test/rls', 'witnessed'
    );
  EXCEPTION WHEN unique_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: RLS hid an older row from to_one insertion';
  END IF;
END $$;
RESET ROLE;

DROP POLICY lifecycle_hide_threads ON yu.threads;
DROP POLICY lifecycle_allow_writer_insert ON yu.threads;
ALTER TABLE yu.threads DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    UPDATE yu.threads
    SET note = 'mutated'
    WHERE id = '01980000-0000-7000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: an existing thread was mutable';
  END IF;
END $$;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    UPDATE yu.registry
    SET physical_table = 'empty_item_cards',
        at = clock_timestamp(),
        by = 'human:test'
    WHERE book = 'tradein' AND deck = 'items';
  EXCEPTION WHEN foreign_key_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: registry remap stranded active logical refs';
  END IF;
  IF (SELECT physical_table FROM yu.registry WHERE book = 'tradein' AND deck = 'items') <> 'item_cards' THEN
    RAISE EXCEPTION 'TEST FAILED: refused registry remap changed the mapping';
  END IF;
END $$;

\echo 'ok - writer role, endpoint checks, claims, to_one, immutability, remap guard'

-- ──────────────────────────────────────────────────────────
-- Full semantic versions are pinned to threads
-- ──────────────────────────────────────────────────────────

SET ROLE yu_lexicographer;
UPDATE yu.lexicon
SET gloss = 'this submission physically or compositionally holds that item',
    inverse = 'physically or compositionally contained by',
    at = clock_timestamp(),
    by = 'human:test',
    how = 'declared',
    src = NULL
WHERE word = 'contains';
RESET ROLE;

DO $$
BEGIN
  IF (SELECT current_version FROM yu.lexicon WHERE word = 'contains') <> 2
     OR (SELECT word_version FROM yu.threads WHERE id = '01980000-0000-7000-8000-000000000001') <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM via.contains v
       JOIN yu.word_versions w
         ON w.word = 'contains' AND w.word_version = 1
       WHERE v.thread_id = '01980000-0000-7000-8000-000000000001'
         AND v.word_version = 1
         AND v.gloss = w.gloss
         AND v.inverse = w.inverse
     ) OR NOT EXISTS (
       SELECT 1
       FROM yu.lexicon_versions lv
       JOIN yu.word_versions w
         ON w.word = lv.word AND w.word_version = 1
       WHERE lv.word = 'contains'
         AND lv.gloss = w.gloss
         AND lv.inverse = w.inverse
         AND lv.changed_by = 'human:test'
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: an existing thread did not retain word version 1';
  END IF;
END $$;

SET ROLE yu_writer;
INSERT INTO yu.threads (
  id, word,
  from_book, from_deck, from_id,
  to_book, to_deck, to_id,
  note, at, by, how
) VALUES (
  '01980000-0000-7000-8000-000000000003', 'contains',
  'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
  'tradein', 'items', '0197a1f4-0000-7000-8000-000000000003',
  'version two relation', clock_timestamp(), 'agent:test', 'witnessed'
);
RESET ROLE;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  IF (SELECT word_version FROM yu.threads WHERE id = '01980000-0000-7000-8000-000000000003') <> 2 THEN
    RAISE EXCEPTION 'TEST FAILED: a new thread was not pinned to word version 2';
  END IF;

  BEGIN
    UPDATE yu.word_versions SET gloss = 'mutated'
    WHERE word = 'contains' AND word_version = 1;
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: a word snapshot was mutable';
  END IF;
END $$;

-- A TTL added later must not retroactively stale a version-1 thread.
SET ROLE yu_lexicographer;
UPDATE yu.lexicon
SET ttl = interval '1 hour',
    at = clock_timestamp(),
    by = 'human:test',
    how = 'declared',
    src = NULL
WHERE word = 'related_to';
RESET ROLE;

SET ROLE yu_writer;
INSERT INTO yu.threads (
  id, word,
  from_book, from_deck, from_id,
  to_book, to_deck, to_id,
  at, by, how, src
) VALUES (
  '01980000-0000-7000-8000-000000000004', 'related_to',
  'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002',
  'tradein', 'customers', '01964b10-0000-7000-8000-000000000001',
  clock_timestamp() - interval '2 hours', 'agent:test', 'cached', ARRAY['test/context/2']
);
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM yu.stale()
    WHERE thread_word = 'related_to'
      AND id = '0197a1f4-0000-7000-8000-000000000001'
  ) OR NOT EXISTS (
    SELECT 1 FROM yu.stale()
    WHERE thread_word = 'related_to'
      AND id = '0197a1f4-0000-7000-8000-000000000002'
  ) OR NOT EXISTS (
    SELECT 1 FROM yu.stale()
    WHERE book = 'tradein'
      AND deck = 'items'
      AND id = '0197a1f4-0000-7000-8000-000000000004'
      AND thread_word IS NULL
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: stale() ignored physical mapping or pinned TTL';
  END IF;
END $$;

\echo 'ok - immutable semantic snapshots, version pinning, pinned freshness'

-- ──────────────────────────────────────────────────────────
-- Retirement preserves reads; sever preserves relation provenance
-- ──────────────────────────────────────────────────────────

SET ROLE yu_lexicographer;
UPDATE yu.lexicon
SET status = 'retired',
    at = clock_timestamp(),
    by = 'human:test',
    how = 'declared',
    src = NULL
WHERE word = 'contains';
SELECT yu.refresh_via();
RESET ROLE;

SET ROLE yu_writer;
DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO yu.threads (
      id, word, from_book, from_deck, from_id,
      to_book, to_deck, to_id, at, by, how
    ) VALUES (
      gen_random_uuid(), 'contains',
      'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
      'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002',
      clock_timestamp(), 'agent:test', 'witnessed'
    );
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: a retired word accepted a new thread';
  END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF to_regclass('via.contains') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM via.contains
       WHERE thread_id = '01980000-0000-7000-8000-000000000001'
         AND word_version = 1
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: retirement removed the old query surface';
  END IF;
END $$;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    DELETE FROM test_cards.item_cards
    WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000003';
  EXCEPTION WHEN foreign_key_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: delete guard ignored a logically mapped thread';
  END IF;
END $$;

SET ROLE yu_writer;
SELECT yu.sever(
  '01980000-0000-7000-8000-000000000003',
  'human:test',
  'witnessed',
  NULL
);
RESET ROLE;

SET ROLE yu_writer;
DO $$
DECLARE
  refused boolean := false;
  violated_constraint text;
BEGIN
  BEGIN
    INSERT INTO yu.threads (
      id, word,
      from_book, from_deck, from_id,
      to_book, to_deck, to_id,
      at, by, how
    ) VALUES (
      '01980000-0000-7000-8000-000000000003', 'related_to',
      'tradein', 'items', '0197a1f4-0000-7000-8000-000000000003',
      'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002',
      clock_timestamp(), 'agent:test', 'witnessed'
    );
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
    refused := violated_constraint = 'thread_ids_pkey';
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: a severed thread UUID was reused';
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM yu.sever_log
    WHERE id = '01980000-0000-7000-8000-000000000003'
      AND word = 'contains'
      AND word_version = 2
      AND thread_by = 'agent:test'
      AND thread_how = 'witnessed'
      AND by = 'human:test'
      AND how = 'witnessed'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: sever did not preserve word version and relation claim';
  END IF;

  IF (SELECT count(*) FROM yu.thread_ids
      WHERE id = '01980000-0000-7000-8000-000000000003') <> 1
     OR EXISTS (
       SELECT 1 FROM yu.threads
       WHERE id = '01980000-0000-7000-8000-000000000003'
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: thread ID reservation did not survive severance';
  END IF;

  BEGIN
    UPDATE yu.sever_log SET note = 'mutated'
    WHERE id = '01980000-0000-7000-8000-000000000003';
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: sever history was mutable';
  END IF;
END $$;

DELETE FROM test_cards.item_cards
WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000003';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM test_cards.item_cards
    WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: delete remained blocked after sever';
  END IF;
END $$;

\echo 'ok - retirement, historical reads, logical delete guard, sever provenance'
\echo '=== ALL CANDIDATE LIFECYCLE TESTS PASSED ==='
