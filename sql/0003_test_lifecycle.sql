-- YUTABASE 0.1.0-candidate.1 lifecycle conformance test
--
-- Run only after 0001, 0002, 0004, and 0005, against a disposable database:
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
         AND revision = 5
         AND capabilities @> ARRAY[
           'word-version-pinning',
           'global-thread-id-ledger',
           'endpoint-existence-on-insert',
           'concurrency-safe-to-one',
           'guarded-card-identity',
           'nonblank-source-locators'
         ]::text[]
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: candidate identity is absent or incorrect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM yu.lexicon word
    JOIN yu.threads thread ON thread.word = word.word
    WHERE word.to_one
    GROUP BY
      thread.word,
      thread.from_book,
      thread.from_deck,
      thread.from_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: current to_one meaning has duplicate active outgoing refs';
  END IF;

  IF NOT pg_has_role('yu_appender', 'yu_reader', 'member')
     OR NOT pg_has_role('yu_writer', 'yu_reader', 'member')
     OR NOT has_table_privilege('yu_appender', 'yu.threads', 'INSERT')
     OR has_table_privilege('yu_appender', 'yu.threads', 'UPDATE')
     OR has_table_privilege('yu_appender', 'yu.threads', 'DELETE')
     OR has_column_privilege('yu_appender', 'yu.threads', 'note', 'UPDATE')
     OR has_table_privilege('yu_appender', 'yu.thread_ids', 'INSERT')
     OR has_table_privilege('yu_appender', 'yu.lexicon', 'INSERT')
     OR NOT has_table_privilege('yu_writer', 'yu.threads', 'INSERT')
     OR has_table_privilege('yu_writer', 'yu.threads', 'UPDATE')
     OR has_table_privilege('yu_writer', 'yu.threads', 'DELETE')
     OR has_column_privilege('yu_writer', 'yu.threads', 'note', 'UPDATE')
     OR has_schema_privilege('yu_writer', 'yu', 'CREATE')
     OR has_table_privilege('yu_writer', 'yu.thread_ids', 'INSERT')
     OR has_table_privilege('yu_writer', 'yu.thread_ids', 'DELETE')
     OR has_table_privilege('yu_lexicographer', 'yu.lexicon_versions', 'INSERT')
     OR NOT has_function_privilege(
       'yu_appender',
       'yu._lock_thread_context(text,text,text,uuid,text,text,uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'yu_appender', 'yu.sever(uuid,text,text,text[])', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'yu_writer',
       'yu._lock_thread_context(text,text,text,uuid,text,text,uuid)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'yu_reader',
       'yu._lock_registry_mapping(text,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'yu_lexicographer',
       'yu._registry_referenced_ids(text,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'yu_writer', 'yu.sever(uuid,text,text,text[])', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'yu_writer', 'yu._source_locators_valid(text[])', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'yu_lexicographer', 'yu._source_locators_valid(text[])', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'yu_writer', 'yu._nonblank_text(text)', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'yu_lexicographer', 'yu._nonblank_text(text)', 'EXECUTE'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc p
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       WHERE p.oid = 'yu._source_locators_valid(text[])'::regprocedure
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
         AND NOT acl.is_grantable
     )
     OR NOT has_function_privilege(
       'yu_lexicographer', 'yu._guard_delete()', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'yu_lexicographer', 'yu._guard_truncate()', 'EXECUTE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles role
       WHERE role.rolname IN (
         'yu_reader', 'yu_appender', 'yu_writer', 'yu_lexicographer'
       )
         AND (
           role.rolcanlogin
           OR role.rolsuper
           OR role.rolcreatedb
           OR role.rolcreaterole
           OR NOT role.rolinherit
           OR role.rolreplication
           OR role.rolbypassrls
         )
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: candidate role capabilities are incorrect';
  END IF;

  IF EXISTS (
    WITH capability_roles AS (
      SELECT role.oid, role.rolname
      FROM pg_catalog.pg_roles role
      WHERE role.rolname IN (
        'yu_reader', 'yu_appender', 'yu_writer', 'yu_lexicographer'
      )
    ),
    expected(parent_name, member_name) AS (
      VALUES
        ('yu_reader', 'yu_appender'),
        ('yu_reader', 'yu_writer'),
        ('yu_reader', 'yu_lexicographer')
    ),
    actual AS (
      SELECT DISTINCT
        parent.rolname AS parent_name,
        member.rolname AS member_name
      FROM pg_catalog.pg_auth_members membership
      JOIN capability_roles parent ON parent.oid = membership.roleid
      JOIN capability_roles member ON member.oid = membership.member
    ),
    bad_options AS (
      SELECT 1
      FROM pg_catalog.pg_auth_members membership
      JOIN capability_roles parent ON parent.oid = membership.roleid
      JOIN capability_roles member ON member.oid = membership.member
      WHERE membership.admin_option
         OR NOT membership.inherit_option
         OR NOT membership.set_option
    ),
    difference AS (
      (SELECT * FROM actual EXCEPT SELECT * FROM expected)
      UNION ALL
      (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    )
    SELECT 1 FROM bad_options
    UNION ALL
    SELECT 1 FROM difference
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: standard capability role hierarchy is not exact';
  END IF;

  IF (
       SELECT prosecdef
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._validate_thread()')
     ) OR (
       SELECT prosecdef
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._validate_registry_mapping()')
     ) OR (
       SELECT prosecdef
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._maintain_registry_guard()')
     ) OR NOT (
       SELECT prosecdef
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._guard_delete()')
     ) OR NOT (
       SELECT prosecdef
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._guard_truncate()')
     ) OR NOT (
       SELECT prosecdef
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._lock_thread_context(text,text,text,uuid,text,text,uuid)')
     ) OR NOT (
       SELECT prosecdef
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._lock_registry_mapping(text,text)')
     ) OR NOT (
       SELECT prosecdef
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._registry_referenced_ids(text,text)')
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: invoker/definer privilege split is incorrect';
  END IF;

  IF (
       SELECT provolatile <> 'i'
           OR prosecdef
           OR NOT proparallel = 's'
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._nonblank_text(text)')
     ) OR (
       SELECT provolatile <> 'i'
           OR prosecdef
           OR NOT proparallel = 's'
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._source_locators_valid(text[])')
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: nonblank predicates are not immutable/invoker/parallel-safe';
  END IF;

  IF (
       SELECT provolatile <> 'v'
           OR NOT prosecdef
           OR proparallel <> 'u'
           OR proconfig IS DISTINCT FROM ARRAY[
                'search_path=pg_catalog, yu, pg_temp',
                'row_security=off'
              ]::text[]
           OR pg_catalog.pg_get_function_result(oid) IS DISTINCT FROM
                'TABLE(physical_schema text, physical_table text, id_col text, at_col text, by_col text, how_col text, src_col text)'
       FROM pg_catalog.pg_proc
       WHERE oid = to_regprocedure('yu._lock_registry_mapping(text,text)')
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: registry mapping lock helper contract is incorrect';
  END IF;

  IF (
       SELECT count(*)
       FROM pg_catalog.pg_constraint c
       WHERE (c.conrelid, c.conname) IN (
         ('yu.lexicon'::regclass, 'lexicon_src_locators_valid'),
         ('yu.word_versions'::regclass, 'word_versions_src_locators_valid'),
         ('yu.threads'::regclass, 'threads_src_locators_valid'),
         ('yu.sever_log'::regclass, 'sever_log_src_locators_valid'),
         ('yu.sever_log'::regclass, 'sever_log_thread_src_locators_valid')
       )
         AND c.contype = 'c'
         AND c.convalidated
     ) <> 5 THEN
    RAISE EXCEPTION 'TEST FAILED: source-locator hard constraints are incomplete';
  END IF;

  IF (
       SELECT count(*)
       FROM pg_catalog.pg_constraint c
       WHERE (c.conrelid, c.conname) IN (
         ('yu.lexicon'::regclass, 'lexicon_gloss_nonempty'),
         ('yu.lexicon'::regclass, 'lexicon_inverse_nonempty'),
         ('yu.lexicon'::regclass, 'lexicon_claimant_nonempty'),
         ('yu.lexicon_versions'::regclass, 'lexicon_versions_gloss_nonempty'),
         ('yu.lexicon_versions'::regclass, 'lexicon_versions_inverse_nonempty'),
         ('yu.lexicon_versions'::regclass, 'lexicon_versions_claimant_nonempty'),
         ('yu.word_versions'::regclass, 'word_versions_gloss_check'),
         ('yu.word_versions'::regclass, 'word_versions_inverse_check'),
         ('yu.word_versions'::regclass, 'word_versions_by_check'),
         ('yu.registry'::regclass, 'registry_claimant_nonempty'),
         ('yu.threads'::regclass, 'threads_claimant_nonempty'),
         ('yu.sever_log'::regclass, 'sever_log_claimant_nonempty'),
         ('yu.sever_log'::regclass, 'sever_log_thread_claimant_nonempty')
       )
         AND c.contype = 'c'
         AND c.convalidated
     ) <> 13 THEN
    RAISE EXCEPTION 'TEST FAILED: portable nonblank hard constraints are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'yu.registry'::regclass
      AND c.conname = 'registry_mapped_columns_distinct'
      AND c.contype = 'c'
      AND c.convalidated
      AND pg_catalog.pg_get_expr(c.conbin, c.conrelid, false) =
        '((id_col <> at_col) AND (id_col <> by_col) AND (id_col <> how_col) AND (id_col <> src_col) AND (at_col <> by_col) AND (at_col <> how_col) AND (at_col <> src_col) AND (by_col <> how_col) AND (by_col <> src_col) AND (how_col <> src_col))'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: mapped card/claim columns are not constrained distinct';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = 'yu.registry'::regclass
      AND t.tgname = 'registry_guard_lifecycle'
      AND NOT t.tgisinternal
      AND t.tgtype = 31
      AND t.tgenabled = 'O'
      AND t.tgfoid = 'yu._maintain_registry_guard()'::regprocedure
      AND ARRAY(
        SELECT a.attname::text
        FROM pg_catalog.unnest(t.tgattr::smallint[])
          WITH ORDINALITY AS key(attnum, position)
        JOIN pg_catalog.pg_attribute a
          ON a.attrelid = t.tgrelid AND a.attnum = key.attnum
        ORDER BY key.position
      ) = ARRAY[
        'book',
        'deck',
        'physical_schema',
        'physical_table',
        'id_col'
      ]::text[]
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: registry guard lifecycle trigger is absent or incorrect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('yu._registry_referenced_ids(text,text)'),
      ('yu._begin_word_version()'),
      ('yu._capture_word_version()'),
      ('yu._reserve_thread_id()'),
      ('yu._lock_thread_context(text,text,text,uuid,text,text,uuid)'),
      ('yu._lock_registry_mapping(text,text)'),
      ('yu._version_gloss()'),
      ('yu.sever(uuid,text,text,text[])'),
      ('yu._guard_delete()'),
      ('yu._guard_truncate()'),
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

CREATE TABLE test_cards.guard_old_cards
  (LIKE test_cards.empty_item_cards INCLUDING ALL);
CREATE TABLE test_cards.guard_new_cards
  (LIKE test_cards.empty_item_cards INCLUDING ALL);

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

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    UPDATE yu.registry
    SET how_col = by_col
    WHERE book = 'tradein' AND deck = 'items';
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  IF NOT refused
     OR (SELECT how_col = by_col
         FROM yu.registry
         WHERE book = 'tradein' AND deck = 'items') THEN
    RAISE EXCEPTION
      'TEST FAILED: registry allowed by/how to collapse onto one column';
  END IF;
END $$;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM yu.registry r
    JOIN pg_catalog.pg_namespace n ON n.nspname = r.physical_schema
    JOIN pg_catalog.pg_class c
      ON c.relnamespace = n.oid AND c.relname = r.physical_table
    JOIN pg_catalog.pg_trigger t
      ON t.tgrelid = c.oid AND t.tgname = 'yutabase_guard_delete'
    WHERE r.book = 'tradein'
      AND NOT t.tgisinternal
      AND t.tgtype = 25
      AND t.tgenabled = 'O'
      AND t.tgfoid = 'yu._guard_delete()'::regprocedure
      AND cardinality(t.tgattr::smallint[]) = 0
  ) <> 3 THEN
    RAISE EXCEPTION 'TEST FAILED: registry insert did not install exact canonical card guards';
  END IF;

  IF (
    SELECT count(*)
    FROM yu.registry r
    JOIN pg_catalog.pg_namespace n ON n.nspname = r.physical_schema
    JOIN pg_catalog.pg_class c
      ON c.relnamespace = n.oid AND c.relname = r.physical_table
    JOIN pg_catalog.pg_trigger t
      ON t.tgrelid = c.oid AND t.tgname = 'yutabase_guard_truncate'
    WHERE r.book = 'tradein'
      AND NOT t.tgisinternal
      AND t.tgtype = 32
      AND t.tgenabled = 'O'
      AND t.tgfoid = 'yu._guard_truncate()'::regprocedure
      AND cardinality(t.tgattr::smallint[]) = 0
  ) <> 3 THEN
    RAISE EXCEPTION 'TEST FAILED: registry insert did not install exact canonical truncate guards';
  END IF;
END $$;

-- The lifecycle upgrades the released canonical DELETE-only shape, maintains
-- both guards across a no-ref remap, refuses same-name conflicts, permits a
-- no-ref truncate, and removes only its exact canonical triggers on cleanup.
CREATE TRIGGER yutabase_guard_delete
  BEFORE DELETE ON test_cards.guard_old_cards
  FOR EACH ROW EXECUTE FUNCTION yu._guard_delete();

INSERT INTO yu.registry (
  book, deck, physical_schema, physical_table,
  id_col, at_col, by_col, how_col, src_col,
  native, by
) VALUES (
  'test', 'guard_lifecycle', 'test_cards', 'guard_old_cards',
  'card_uuid', 'claimed_at', 'claimant', 'claim_kind', 'sources',
  false, 'human:test'
);

INSERT INTO test_cards.guard_old_cards VALUES (
  '0197a1f4-0000-7000-8000-0000000000aa',
  'truncate me',
  clock_timestamp(),
  'human:test',
  'declared',
  NULL
);

-- A BEFORE TRUNCATE application trigger runs while the cards still exist and
-- can therefore create a valid thread. The canonical AFTER guard must observe
-- that final trigger state and roll back both the truncate and inserted ref.
CREATE FUNCTION test_cards.zz_thread_before_truncate()
RETURNS trigger AS $$
BEGIN
  INSERT INTO yu.threads (
    id, word,
    from_book, from_deck, from_id,
    to_book, to_deck, to_id,
    at, by, how
  ) VALUES (
    '019a0000-0000-7000-8000-0000000000aa', 'acted_for',
    'test', 'guard_lifecycle',
    '0197a1f4-0000-7000-8000-0000000000aa',
    'test', 'guard_lifecycle',
    '0197a1f4-0000-7000-8000-0000000000aa',
    clock_timestamp(), 'agent:test', 'witnessed'
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER zz_create_thread
  BEFORE TRUNCATE ON test_cards.guard_old_cards
  FOR EACH STATEMENT
  EXECUTE FUNCTION test_cards.zz_thread_before_truncate();

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    TRUNCATE TABLE test_cards.guard_old_cards;
  EXCEPTION WHEN foreign_key_violation THEN
    refused := true;
  END;
  IF NOT refused
     OR NOT EXISTS (
       SELECT 1 FROM test_cards.guard_old_cards
       WHERE card_uuid = '0197a1f4-0000-7000-8000-0000000000aa'
     )
     OR EXISTS (
       SELECT 1 FROM yu.threads
       WHERE id = '019a0000-0000-7000-8000-0000000000aa'
     )
     OR EXISTS (
       SELECT 1 FROM yu.thread_ids
       WHERE id = '019a0000-0000-7000-8000-0000000000aa'
     ) THEN
    RAISE EXCEPTION
      'TEST FAILED: AFTER truncate guard missed or retained a BEFORE-trigger ref';
  END IF;
END $$;

DROP TRIGGER zz_create_thread ON test_cards.guard_old_cards;
DROP FUNCTION test_cards.zz_thread_before_truncate();

TRUNCATE TABLE test_cards.guard_old_cards;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM test_cards.guard_old_cards)
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger
       WHERE tgrelid = 'test_cards.guard_old_cards'::regclass
         AND tgname = 'yutabase_guard_delete'
         AND tgtype = 25
         AND tgfoid = 'yu._guard_delete()'::regprocedure
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger
       WHERE tgrelid = 'test_cards.guard_old_cards'::regclass
         AND tgname = 'yutabase_guard_truncate'
         AND tgtype = 32
         AND tgfoid = 'yu._guard_truncate()'::regprocedure
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: legacy guard upgrade or no-ref truncate failed';
  END IF;
END $$;

CREATE TRIGGER yutabase_guard_truncate
  BEFORE TRUNCATE ON test_cards.guard_new_cards
  FOR EACH STATEMENT EXECUTE FUNCTION yu._guard_truncate();

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    UPDATE yu.registry
    SET physical_table = 'guard_new_cards',
        at = clock_timestamp(),
        by = 'human:test'
    WHERE book = 'test' AND deck = 'guard_lifecycle';
  EXCEPTION WHEN duplicate_object THEN
    refused := true;
  END;
  IF NOT refused
     OR (SELECT physical_table FROM yu.registry
         WHERE book = 'test' AND deck = 'guard_lifecycle') <> 'guard_old_cards' THEN
    RAISE EXCEPTION 'TEST FAILED: lifecycle overwrote a same-name trigger conflict';
  END IF;
END $$;

DROP TRIGGER yutabase_guard_truncate ON test_cards.guard_new_cards;
UPDATE yu.registry
SET physical_table = 'guard_new_cards',
    at = clock_timestamp(),
    by = 'human:test'
WHERE book = 'test' AND deck = 'guard_lifecycle';

DO $$
BEGIN
  IF EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger
       WHERE tgrelid = 'test_cards.guard_old_cards'::regclass
         AND tgname IN ('yutabase_guard_delete', 'yutabase_guard_truncate')
     ) OR (
       SELECT count(*)
       FROM pg_catalog.pg_trigger
       WHERE tgrelid = 'test_cards.guard_new_cards'::regclass
         AND tgname IN ('yutabase_guard_delete', 'yutabase_guard_truncate')
     ) <> 2 THEN
    RAISE EXCEPTION 'TEST FAILED: no-ref remap did not move both canonical guards';
  END IF;
END $$;

DELETE FROM yu.registry
WHERE book = 'test' AND deck = 'guard_lifecycle';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'test_cards.guard_new_cards'::regclass
      AND tgname IN ('yutabase_guard_delete', 'yutabase_guard_truncate')
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: registry delete left canonical guards behind';
  END IF;
END $$;

DROP TABLE test_cards.guard_old_cards, test_cards.guard_new_cards;

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
  IF NOT EXISTS (
    SELECT 1
    FROM yu._lock_registry_mapping('tradein', 'items') mapping
    WHERE mapping.physical_schema = 'test_cards'
      AND mapping.physical_table = 'item_cards'
      AND mapping.id_col = 'card_uuid'
      AND mapping.at_col = 'claimed_at'
      AND mapping.by_col = 'claimant'
      AND mapping.how_col = 'claim_kind'
      AND mapping.src_col = 'sources'
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: reader could not resolve a mapping through the lock helper';
  END IF;

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

-- Endpoint validation is security-invoker. Grant the two thread-creation roles
-- only the application-deck read surface after proving the reader lacks that
-- oracle.
GRANT USAGE ON SCHEMA test_cards TO yu_appender, yu_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA test_cards TO yu_appender, yu_writer;

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

DO $$
DECLARE
  invalid_locator text;
  refused boolean;
BEGIN
  IF yu._nonblank_text(NULL)
     OR yu._nonblank_text('')
     OR yu._nonblank_text(E' \t\n\013\f\r ')
     OR NOT yu._nonblank_text(E' \t portable \n ')
     OR NOT yu._nonblank_text(chr(160))
     OR NOT yu._source_locators_valid(NULL)
     OR NOT yu._source_locators_valid(ARRAY[]::text[])
     OR NOT yu._source_locators_valid(ARRAY['source locator'])
     OR yu._source_locators_valid(
          ARRAY[['one', 'two'], ['three', 'four']]::text[]
        )
     OR yu._source_locators_valid('[0:1]={one,two}'::text[])
     OR yu._source_locators_valid(ARRAY[NULL::text])
     OR yu._source_locators_valid(ARRAY[''])
     OR yu._source_locators_valid(ARRAY['   '])
     OR yu._source_locators_valid(ARRAY[E'\t'])
     OR yu._source_locators_valid(ARRAY[E'\n'])
     OR yu._source_locators_valid(ARRAY[E'\013'])
     OR yu._source_locators_valid(ARRAY[E'\f'])
     OR yu._source_locators_valid(ARRAY[E'\r'])
     OR yu._source_locators_valid(ARRAY[E' \t\n\013\f\r ']) THEN
    RAISE EXCEPTION 'TEST FAILED: portable nonblank predicates accepted ASCII whitespace or refused valid text';
  END IF;

  FOREACH invalid_locator IN ARRAY ARRAY[
    NULL::text, '', '   ', E'\t', E'\n', E'\013', E'\f', E'\r',
    E' \t\n\013\f\r '
  ]::text[]
  LOOP
    refused := false;
    BEGIN
      INSERT INTO yu.lexicon (
        word, gloss, inverse, from_deck, to_deck,
        at, by, how, src
      ) VALUES (
        'invalid_source_locator',
        'invalid source locator',
        'invalid source locator inverse',
        '*/*', '*/*',
        clock_timestamp(), 'human:test', 'declared',
        ARRAY[invalid_locator]
      );
    EXCEPTION WHEN check_violation THEN
      refused := true;
    END;
    IF NOT refused THEN
      RAISE EXCEPTION
        'TEST FAILED: lexicon accepted invalid source locator %',
        quote_nullable(invalid_locator);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO yu.lexicon (
      word, gloss, inverse, from_deck, to_deck,
      at, by, how, src
    ) VALUES (
      'invalid_multidimensional_sources',
      'invalid multidimensional sources',
      'invalid multidimensional sources inverse',
      '*/*', '*/*',
      clock_timestamp(), 'human:test', 'declared',
      ARRAY[['one', 'two'], ['three', 'four']]::text[]
    );
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION
      'TEST FAILED: lexicon accepted a multidimensional source array';
  END IF;

  refused := false;
  BEGIN
    INSERT INTO yu.lexicon (
      word, gloss, inverse, from_deck, to_deck,
      at, by, how, src
    ) VALUES (
      'invalid_nonstandard_source_bounds',
      'invalid nonstandard source bounds',
      'invalid nonstandard source bounds inverse',
      '*/*', '*/*',
      clock_timestamp(), 'human:test', 'declared',
      '[0:1]={one,two}'::text[]
    );
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION
      'TEST FAILED: lexicon accepted a non-one-based source array';
  END IF;
END $$;

SELECT yu.refresh_via();
RESET ROLE;

CREATE ROLE yutabase_locator_probe NOLOGIN;
GRANT USAGE ON SCHEMA yu TO yutabase_locator_probe;
CREATE SCHEMA locator_probe AUTHORIZATION yutabase_locator_probe;
SET ROLE yutabase_locator_probe;
CREATE TABLE locator_probe.claims (
  id integer PRIMARY KEY,
  by text NOT NULL CHECK (yu._nonblank_text(by)),
  src text[],
  CONSTRAINT claims_source_locators_valid
    CHECK (yu._source_locators_valid(src))
);
INSERT INTO locator_probe.claims VALUES (1, 'agent:probe', ARRAY['app/source']);
DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO locator_probe.claims
    VALUES (2, 'agent:probe', ARRAY['   ']);
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION
      'TEST FAILED: public source predicate did not enforce an application-owned table';
  END IF;

  refused := false;
  BEGIN
    INSERT INTO locator_probe.claims
    VALUES (3, E' \t\n\013\f\r ', ARRAY['app/source']);
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION
      'TEST FAILED: public nonblank predicate did not enforce an application-owned table';
  END IF;
END $$;
RESET ROLE;
DROP SCHEMA locator_probe CASCADE;
REVOKE USAGE ON SCHEMA yu FROM yutabase_locator_probe;
DROP ROLE yutabase_locator_probe;

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

SET ROLE yu_appender;

INSERT INTO yu.threads (
  id, word,
  from_book, from_deck, from_id,
  to_book, to_deck, to_id,
  note, at, by, how
) VALUES (
  '01980000-0000-7000-8000-000000000000', 'contains',
  'tradein', 'submissions', '01977c2e-0000-7000-8000-000000000001',
  'tradein', 'items', '0197a1f4-0000-7000-8000-000000000001',
  'append-only capability probe', clock_timestamp(),
  'agent:test/appender', 'witnessed'
);

DO $$
DECLARE
  sever_refused boolean := false;
  mutation_refused boolean := false;
BEGIN
  BEGIN
    PERFORM yu.sever(
      '01980000-0000-7000-8000-000000000000',
      'agent:test/appender',
      'witnessed'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    sever_refused := true;
  END;

  BEGIN
    UPDATE yu.threads
    SET note = 'not allowed'
    WHERE id = '01980000-0000-7000-8000-000000000000';
  EXCEPTION WHEN insufficient_privilege THEN
    mutation_refused := true;
  END;

  IF NOT sever_refused OR NOT mutation_refused THEN
    RAISE EXCEPTION
      'TEST FAILED: appender could sever or mutate an active thread';
  END IF;
END $$;

RESET ROLE;
SET ROLE yu_writer;
SELECT yu.sever(
  '01980000-0000-7000-8000-000000000000',
  'agent:test/writer',
  'witnessed'
);
RESET ROLE;

\echo 'ok - appender creates immutable threads but cannot sever or mutate them'

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
  invalid_locator text;
  refused boolean;
BEGIN
  FOREACH invalid_locator IN ARRAY ARRAY[
    NULL::text, '', '   ', E'\t', E'\n', E' \t\n '
  ]::text[]
  LOOP
    refused := false;
    BEGIN
      INSERT INTO yu.threads (
        id, word, from_book, from_deck, from_id,
        to_book, to_deck, to_id, at, by, how, src
      ) VALUES (
        gen_random_uuid(), 'acted_for',
        'tradein', 'items', '0197a1f4-0000-7000-8000-000000000002',
        'tradein', 'customers', '01964b10-0000-7000-8000-000000000001',
        clock_timestamp(), 'agent:test', 'declared',
        ARRAY[invalid_locator]
      );
    EXCEPTION WHEN check_violation THEN
      refused := true;
    END;
    IF NOT refused THEN
      RAISE EXCEPTION
        'TEST FAILED: thread accepted invalid source locator %',
        quote_nullable(invalid_locator);
    END IF;
  END LOOP;
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
DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    UPDATE yu.registry
    SET physical_table = 'remap_item_cards',
        at = clock_timestamp(),
        by = 'human:test/nonowner'
    WHERE book = 'tradein' AND deck = 'items';
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: non-owner could maintain physical card guards';
  END IF;
END $$;
RESET ROLE;

ALTER TABLE test_cards.item_cards OWNER TO yu_lexicographer;
ALTER TABLE test_cards.remap_item_cards OWNER TO yu_lexicographer;

SET ROLE yu_lexicographer;
DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    UPDATE yu.registry
    SET physical_table = 'remap_item_cards',
        at = clock_timestamp(),
        by = 'human:test/owner'
    WHERE book = 'tradein' AND deck = 'items';
  EXCEPTION WHEN foreign_key_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: physical owner remapped a deck with active refs hidden by RLS';
  END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT physical_table FROM yu.registry
      WHERE book = 'tradein' AND deck = 'items') <> 'item_cards'
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger
       WHERE tgrelid = 'test_cards.item_cards'::regclass
         AND tgname = 'yutabase_guard_delete'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger
       WHERE tgrelid = 'test_cards.remap_item_cards'::regclass
         AND tgname IN ('yutabase_guard_delete', 'yutabase_guard_truncate')
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: refused registry remap changed mapping or guards';
  END IF;
END $$;

ALTER TABLE test_cards.item_cards OWNER TO CURRENT_USER;
ALTER TABLE test_cards.remap_item_cards OWNER TO CURRENT_USER;
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
  truncate_refused boolean := false;
  delete_mapping_refused boolean := false;
BEGIN
  BEGIN
    TRUNCATE TABLE test_cards.item_cards;
  EXCEPTION WHEN foreign_key_violation THEN
    truncate_refused := true;
  END;
  BEGIN
    DELETE FROM yu.registry
    WHERE book = 'tradein' AND deck = 'items';
  EXCEPTION WHEN foreign_key_violation THEN
    delete_mapping_refused := true;
  END;
  IF NOT truncate_refused
     OR NOT delete_mapping_refused
     OR (SELECT count(*) FROM test_cards.item_cards) <> 4
     OR NOT EXISTS (
       SELECT 1 FROM yu.registry
       WHERE book = 'tradein' AND deck = 'items'
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: active refs did not protect truncate and registry deletion';
  END IF;
END $$;

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
  -- The all-column AFTER guard runs for an unrelated UPDATE and leaves a
  -- same-identity row change intact.
  UPDATE test_cards.item_cards
  SET name = 'Mew guarded'
  WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000003';
  IF (SELECT name FROM test_cards.item_cards
      WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000003') <> 'Mew guarded' THEN
    RAISE EXCEPTION 'TEST FAILED: identity guard discarded a same-identity update';
  END IF;

  BEGIN
    UPDATE test_cards.item_cards
    SET card_uuid = '0197a1f4-0000-7000-8000-000000000009'
    WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000003';
  EXCEPTION WHEN foreign_key_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: identity guard allowed a mapped UUID with live threads to change';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM test_cards.item_cards
       WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000003'
     ) OR EXISTS (
       SELECT 1 FROM test_cards.item_cards
       WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000009'
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: refused identity change altered the physical card';
  END IF;
END $$;

-- A column-filtered or BEFORE-row identity guard can miss a UUID written by a
-- later BEFORE trigger when the original SET list omits that UUID. The
-- canonical AFTER guard must inspect the final NEW row and refuse it.
CREATE FUNCTION test_cards.zz_mutate_mapped_identity()
RETURNS trigger AS $$
BEGIN
  IF NEW.name = 'attempt hidden identity mutation' THEN
    NEW.card_uuid := '0197a1f4-0000-7000-8000-000000000008';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER zz_mutate_id
  BEFORE UPDATE ON test_cards.item_cards
  FOR EACH ROW EXECUTE FUNCTION test_cards.zz_mutate_mapped_identity();

DO $$
DECLARE
  refused boolean := false;
BEGIN
  BEGIN
    UPDATE test_cards.item_cards
    SET name = 'attempt hidden identity mutation'
    WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000003';
  EXCEPTION WHEN foreign_key_violation THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'TEST FAILED: identity guard missed a UUID changed by a BEFORE trigger';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM test_cards.item_cards
       WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000003'
         AND name = 'Mew guarded'
     ) OR EXISTS (
       SELECT 1 FROM test_cards.item_cards
       WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000008'
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: hidden identity refusal did not roll back the row';
  END IF;
END $$;

DROP TRIGGER zz_mutate_id ON test_cards.item_cards;
DROP FUNCTION test_cards.zz_mutate_mapped_identity();

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

-- A privileged operator can bypass immutable-row triggers, but the candidate
-- binding must still recognize denormalized meaning that no longer matches
-- the pinned word-version snapshot. Exercise both active and severed ledgers,
-- then repair the disposable fixture before continuing.
BEGIN;
ALTER TABLE yu.threads DISABLE TRIGGER threads_immutable;
UPDATE yu.threads
SET word_to_one = NOT word_to_one
WHERE id = '01980000-0000-7000-8000-000000000001';
ALTER TABLE yu.threads ENABLE TRIGGER threads_immutable;

ALTER TABLE yu.sever_log DISABLE TRIGGER sever_log_immutable;
UPDATE yu.sever_log
SET word_to_one = NOT word_to_one
WHERE id = '01980000-0000-7000-8000-000000000003';
ALTER TABLE yu.sever_log ENABLE TRIGGER sever_log_immutable;

DO $$
BEGIN
  IF NOT EXISTS (
       SELECT 1
       FROM yu.threads child
       JOIN yu.word_versions parent
         ON parent.word = child.word
        AND parent.word_version = child.word_version
       WHERE child.id = '01980000-0000-7000-8000-000000000001'
         AND child.word_to_one IS DISTINCT FROM parent.to_one
     ) OR NOT EXISTS (
       SELECT 1
       FROM yu.sever_log child
       JOIN yu.word_versions parent
         ON parent.word = child.word
        AND parent.word_version = child.word_version
       WHERE child.id = '01980000-0000-7000-8000-000000000003'
         AND child.word_to_one IS DISTINCT FROM parent.to_one
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: pinned word-version meaning drift was not observable';
  END IF;
END $$;

ALTER TABLE yu.threads DISABLE TRIGGER threads_immutable;
UPDATE yu.threads child
SET word_to_one = parent.to_one
FROM yu.word_versions parent
WHERE parent.word = child.word
  AND parent.word_version = child.word_version
  AND child.word_to_one IS DISTINCT FROM parent.to_one;
ALTER TABLE yu.threads ENABLE TRIGGER threads_immutable;

ALTER TABLE yu.sever_log DISABLE TRIGGER sever_log_immutable;
UPDATE yu.sever_log child
SET word_to_one = parent.to_one
FROM yu.word_versions parent
WHERE parent.word = child.word
  AND parent.word_version = child.word_version
  AND child.word_to_one IS DISTINCT FROM parent.to_one;
ALTER TABLE yu.sever_log ENABLE TRIGGER sever_log_immutable;

DO $$
BEGIN
  IF EXISTS (
       SELECT 1
       FROM yu.threads child
       JOIN yu.word_versions parent
         ON parent.word = child.word
        AND parent.word_version = child.word_version
       WHERE child.word_to_one IS DISTINCT FROM parent.to_one
     ) OR EXISTS (
       SELECT 1
       FROM yu.sever_log child
       JOIN yu.word_versions parent
         ON parent.word = child.word
        AND parent.word_version = child.word_version
       WHERE child.word_to_one IS DISTINCT FROM parent.to_one
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: pinned word-version meaning repair was incomplete';
  END IF;
END $$;
COMMIT;

UPDATE test_cards.item_cards
SET card_uuid = '0197a1f4-0000-7000-8000-000000000009'
WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000003';

DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM test_cards.item_cards
       WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000003'
     ) OR NOT EXISTS (
       SELECT 1 FROM test_cards.item_cards
       WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000009'
     ) THEN
    RAISE EXCEPTION 'TEST FAILED: identity remained blocked after sever';
  END IF;
END $$;

DELETE FROM test_cards.item_cards
WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000009';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM test_cards.item_cards
    WHERE card_uuid = '0197a1f4-0000-7000-8000-000000000009'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: delete remained blocked after sever';
  END IF;
END $$;

\echo 'ok - retirement, historical reads, card identity/delete guard, sever provenance'
\echo '=== ALL CANDIDATE LIFECYCLE TESTS PASSED ==='
