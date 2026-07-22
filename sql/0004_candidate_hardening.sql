-- YUTABASE 0.1.0-candidate.1 — PostgreSQL binding revision 4
--
-- Upgrade path:
--   * fresh: 0001_yu_core.sql, 0002_starter_lexicon.sql, then this file
--   * legacy v0.1: this file only, inside one operator-controlled transaction
--
-- This migration deliberately fails on unknown/partial bases. It does not
-- guess through integrity problems or claim to reconstruct meaning that an
-- older database never recorded.

-- This must be the first SQL statement. READ COMMITTED takes a new snapshot
-- after the core locks are acquired, so rows committed while the migration is
-- waiting cannot be omitted from backfills or final checks. PostgreSQL refuses
-- this statement if the caller already established an incompatible snapshot.
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- Pin catalog deparsing and every unqualified migration reference. In
-- particular, exact legacy CHECK comparison must never resolve through a
-- caller-provided operator or function earlier in search_path.
SET LOCAL search_path = pg_catalog;

-- Never silently validate or backfill through a row-level-security policy
-- that hides legacy rows. A role that cannot bypass an applicable FORCE RLS
-- policy gets an error from the affected query, so identity remains unstamped.
-- LOCAL keeps the setting inside this transaction when an SDK pool reuses the
-- connection after commit.
SET LOCAL row_security = off;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('yu_reader', 'yu_writer', 'yu_lexicographer')
      AND (
        r.rolcanlogin
        OR r.rolsuper
        OR r.rolcreatedb
        OR r.rolcreaterole
        OR r.rolreplication
        OR r.rolbypassrls
      )
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: capability-role names must be unprivileged NOLOGIN roles'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('yu_reader', 'yu_writer', 'yu_lexicographer')
      AND (
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_database d
          WHERE d.datname = current_database() AND d.datdba = r.oid
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_namespace n
          WHERE n.nspname IN ('yu', 'via') AND n.nspowner = r.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname IN ('yu', 'via') AND c.relowner = r.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_proc p
          JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname IN ('yu', 'via') AND p.proowner = r.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_type t
          JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname IN ('yu', 'via') AND t.typowner = r.oid
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_extension e WHERE e.extowner = r.oid
        )
      )
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: capability roles must not own this database or YUTABASE objects'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  IF to_regclass('yu.lexicon') IS NULL
     OR to_regclass('yu.registry') IS NULL
     OR to_regclass('yu.threads') IS NULL
     OR to_regclass('yu.lexicon_versions') IS NULL
     OR to_regclass('yu.sever_log') IS NULL
     OR to_regnamespace('via') IS NULL THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: expected the complete original v0.1 core before revision 4'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF to_regclass('yu.standard_meta') IS NOT NULL THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: yu.standard_meta already exists; refuse an ambiguous re-application'
      USING ERRCODE = 'duplicate_object';
  END IF;
END $$;

-- Freeze the complete legacy core before inspecting or rewriting it. This
-- makes the preflight and the eventual stamp describe one database state.
LOCK TABLE
  yu.lexicon,
  yu.lexicon_versions,
  yu.registry,
  yu.threads,
  yu.sever_log
IN ACCESS EXCLUSIVE MODE;

-- Original v0.1 has exactly these three user triggers and no rewrite rules on
-- core tables. Unknown trigger ordering or rewrite behavior can mutate rows
-- after candidate validators run, so refuse it instead of trying to normalize
-- code whose intent is unknown.
DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'yu'
      AND c.relname IN (
        'lexicon', 'lexicon_versions', 'registry', 'threads', 'sever_log'
      )
      AND NOT t.tgisinternal
  ) <> 3
  OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('yu.lexicon', 'lexicon_version_gloss', 19,
        'yu._version_gloss()', ARRAY['gloss', 'inverse']::text[]),
      ('yu.threads', 'threads_enforce_to_one', 7,
        'yu._enforce_to_one()', ARRAY[]::text[]),
      ('yu.threads', 'threads_validate', 7,
        'yu._validate_thread()', ARRAY[]::text[])
    ) AS required(
      relation_name, trigger_name, trigger_type, function_name,
      trigger_columns
    )
    LEFT JOIN pg_catalog.pg_trigger t
      ON t.tgrelid = to_regclass(required.relation_name)
     AND t.tgname = required.trigger_name
    WHERE t.oid IS NULL
       OR t.tgisinternal
       OR t.tgconstraint <> 0
       OR t.tgtype <> required.trigger_type
       OR t.tgenabled <> 'O'
       OR t.tgfoid <> to_regprocedure(required.function_name)
       OR ARRAY(
         SELECT a.attname::text
         FROM unnest(t.tgattr::smallint[]) WITH ORDINALITY AS k(attnum, position)
         JOIN pg_catalog.pg_attribute a
           ON a.attrelid = t.tgrelid AND a.attnum = k.attnum
         ORDER BY k.position
       ) <> required.trigger_columns
       OR t.tgqual IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: unexpected legacy core trigger surface'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_rewrite r
    JOIN pg_catalog.pg_class c ON c.oid = r.ev_class
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'yu'
      AND c.relname IN (
        'lexicon', 'lexicon_versions', 'registry', 'threads', 'sever_log'
      )
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: unexpected legacy core rewrite-rule surface'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END $$;

-- The catalog shape above identifies the supported legacy gates, but their
-- stored function bodies are not trusted as migration code. ACCESS EXCLUSIVE
-- locks already exclude ordinary writers, so remove all three legacy triggers
-- before any backfill/update and install the candidate replacements below.
DROP TRIGGER lexicon_version_gloss ON yu.lexicon;
DROP TRIGGER threads_enforce_to_one ON yu.threads;
DROP TRIGGER threads_validate ON yu.threads;

-- The supported upgrade starts from the original key structure, not a
-- lookalike collection of columns. Missing keys could otherwise let revision
-- 4 stamp a database that cannot uphold card or relation identity.
DO $$
DECLARE
  expected record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_trgm'
  ) THEN
    RAISE EXCEPTION 'YUTABASE CANDIDATE: required legacy extension pg_trgm is absent'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  FOR expected IN
    SELECT *
    FROM (VALUES
      ('lexicon'),
      ('lexicon_versions'),
      ('registry'),
      ('threads'),
      ('sever_log')
    ) AS required(relation_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'yu'
        AND c.relname = expected.relation_name
        AND c.relkind = 'r'
        AND c.relpersistence = 'p'
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_inherits i
          WHERE i.inhrelid = c.oid OR i.inhparent = c.oid
        )
    ) THEN
      RAISE EXCEPTION
        'YUTABASE CANDIDATE: yu.% must be a standalone permanent ordinary table',
        expected.relation_name
        USING ERRCODE = 'invalid_table_definition';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'via'
      AND (c.relkind <> 'v' OR c.relpersistence <> 'p')
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: legacy via objects must be permanent views'
      USING ERRCODE = 'invalid_table_definition';
  END IF;

  -- Match the complete original column contract before using rowtypes, casts,
  -- or backfills that depend on it. Extra/dropped columns, changed
  -- nullability, generated expressions, collations, and defaults are all
  -- executable behavior and therefore require explicit operator review.
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid IN (
      'yu.lexicon'::regclass,
      'yu.lexicon_versions'::regclass,
      'yu.registry'::regclass,
      'yu.threads'::regclass,
      'yu.sever_log'::regclass
    )
      AND a.attnum > 0
  ) <> 55 THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: unexpected legacy core column surface'
      USING ERRCODE = 'invalid_table_definition';
  END IF;

  FOR expected IN
    SELECT *
    FROM (VALUES
      ('yu.lexicon', 'word', 'text', true),
      ('yu.lexicon', 'gloss', 'text', true),
      ('yu.lexicon', 'inverse', 'text', true),
      ('yu.lexicon', 'from_deck', 'text', true),
      ('yu.lexicon', 'to_deck', 'text', true),
      ('yu.lexicon', 'to_one', 'boolean', true),
      ('yu.lexicon', 'ttl', 'interval', false),
      ('yu.lexicon', 'status', 'text', true),
      ('yu.lexicon', 'at', 'timestamptz', true),
      ('yu.lexicon', 'by', 'text', true),
      ('yu.lexicon', 'how', 'text', true),
      ('yu.lexicon', 'src', 'text[]', false),

      ('yu.lexicon_versions', 'version_id', 'bigint', true),
      ('yu.lexicon_versions', 'word', 'text', true),
      ('yu.lexicon_versions', 'gloss', 'text', true),
      ('yu.lexicon_versions', 'inverse', 'text', true),
      ('yu.lexicon_versions', 'changed_at', 'timestamptz', true),
      ('yu.lexicon_versions', 'changed_by', 'text', true),

      ('yu.registry', 'book', 'text', true),
      ('yu.registry', 'deck', 'text', true),
      ('yu.registry', 'id_col', 'text', true),
      ('yu.registry', 'at_col', 'text', true),
      ('yu.registry', 'by_col', 'text', true),
      ('yu.registry', 'how_col', 'text', true),
      ('yu.registry', 'src_col', 'text', true),
      ('yu.registry', 'ttl', 'interval', false),
      ('yu.registry', 'native', 'boolean', true),
      ('yu.registry', 'at', 'timestamptz', true),
      ('yu.registry', 'by', 'text', true),

      ('yu.threads', 'id', 'uuid', true),
      ('yu.threads', 'word', 'text', true),
      ('yu.threads', 'from_book', 'text', true),
      ('yu.threads', 'from_deck', 'text', true),
      ('yu.threads', 'from_id', 'uuid', true),
      ('yu.threads', 'to_book', 'text', true),
      ('yu.threads', 'to_deck', 'text', true),
      ('yu.threads', 'to_id', 'uuid', true),
      ('yu.threads', 'note', 'text', false),
      ('yu.threads', 'at', 'timestamptz', true),
      ('yu.threads', 'by', 'text', true),
      ('yu.threads', 'how', 'text', true),
      ('yu.threads', 'src', 'text[]', false),

      ('yu.sever_log', 'id', 'uuid', true),
      ('yu.sever_log', 'word', 'text', true),
      ('yu.sever_log', 'from_book', 'text', true),
      ('yu.sever_log', 'from_deck', 'text', true),
      ('yu.sever_log', 'from_id', 'uuid', true),
      ('yu.sever_log', 'to_book', 'text', true),
      ('yu.sever_log', 'to_deck', 'text', true),
      ('yu.sever_log', 'to_id', 'uuid', true),
      ('yu.sever_log', 'note', 'text', false),
      ('yu.sever_log', 'at', 'timestamptz', true),
      ('yu.sever_log', 'by', 'text', true),
      ('yu.sever_log', 'how', 'text', true),
      ('yu.sever_log', 'src', 'text[]', false)
    ) AS required(relation_name, column_name, type_name, required_not_null)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = to_regclass(expected.relation_name)
        AND a.attname = expected.column_name
        AND a.atttypid = expected.type_name::regtype
        AND a.atttypmod = -1
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND a.attnotnull = expected.required_not_null
        AND a.attidentity = CASE
          WHEN expected.relation_name = 'yu.lexicon_versions'
           AND expected.column_name = 'version_id' THEN 'a'
          ELSE ''
        END
        AND a.attgenerated = ''
        AND a.attcollation = (
          SELECT t.typcollation
          FROM pg_catalog.pg_type t
          WHERE t.oid = expected.type_name::regtype
        )
    ) THEN
      RAISE EXCEPTION 'YUTABASE CANDIDATE: %.% must be %',
        expected.relation_name,
        expected.column_name,
        expected.type_name
          || CASE WHEN expected.required_not_null THEN ' NOT NULL' ELSE '' END
        USING ERRCODE = 'invalid_table_definition';
    END IF;
  END LOOP;

  FOR expected IN
    SELECT
      layout.relation_name,
      layout.column_names[position] AS column_name,
      position
    FROM (VALUES
      ('yu.lexicon', ARRAY[
        'word', 'gloss', 'inverse', 'from_deck', 'to_deck', 'to_one',
        'ttl', 'status', 'at', 'by', 'how', 'src'
      ]::text[]),
      ('yu.lexicon_versions', ARRAY[
        'version_id', 'word', 'gloss', 'inverse', 'changed_at', 'changed_by'
      ]::text[]),
      ('yu.registry', ARRAY[
        'book', 'deck', 'id_col', 'at_col', 'by_col', 'how_col', 'src_col',
        'ttl', 'native', 'at', 'by'
      ]::text[]),
      ('yu.threads', ARRAY[
        'id', 'word', 'from_book', 'from_deck', 'from_id',
        'to_book', 'to_deck', 'to_id', 'note', 'at', 'by', 'how', 'src'
      ]::text[]),
      ('yu.sever_log', ARRAY[
        'id', 'word', 'from_book', 'from_deck', 'from_id',
        'to_book', 'to_deck', 'to_id', 'note', 'at', 'by', 'how', 'src'
      ]::text[])
    ) AS layout(relation_name, column_names)
    CROSS JOIN LATERAL generate_subscripts(layout.column_names, 1) AS position
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = to_regclass(expected.relation_name)
        AND a.attnum = expected.position
        AND a.attname = expected.column_name
        AND NOT a.attisdropped
        AND a.attislocal
        AND a.attinhcount = 0
    ) THEN
      RAISE EXCEPTION 'YUTABASE CANDIDATE: %.% column position is invalid',
        expected.relation_name, expected.column_name
        USING ERRCODE = 'invalid_table_definition';
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_attrdef d
    WHERE d.adrelid IN (
      'yu.lexicon'::regclass,
      'yu.lexicon_versions'::regclass,
      'yu.registry'::regclass,
      'yu.threads'::regclass,
      'yu.sever_log'::regclass
    )
  ) <> 11 THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: unexpected legacy core default surface'
      USING ERRCODE = 'invalid_table_definition';
  END IF;

  FOR expected IN
    SELECT *
    FROM (VALUES
      ('yu.lexicon', 'to_one', $expr$false$expr$),
      ('yu.lexicon', 'status', $expr$'live'::text$expr$),
      ('yu.lexicon_versions', 'changed_at', $expr$now()$expr$),
      ('yu.registry', 'id_col', $expr$'id'::text$expr$),
      ('yu.registry', 'at_col', $expr$'at'::text$expr$),
      ('yu.registry', 'by_col', $expr$'by'::text$expr$),
      ('yu.registry', 'how_col', $expr$'how'::text$expr$),
      ('yu.registry', 'src_col', $expr$'src'::text$expr$),
      ('yu.registry', 'native', $expr$true$expr$),
      ('yu.registry', 'at', $expr$now()$expr$),
      ('yu.sever_log', 'at', $expr$now()$expr$)
    ) AS required(relation_name, column_name, expression)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_attrdef d
        ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = to_regclass(expected.relation_name)
        AND a.attname = expected.column_name
        AND pg_catalog.pg_get_expr(d.adbin, d.adrelid, false)
              = expected.expression
    ) THEN
      RAISE EXCEPTION 'YUTABASE CANDIDATE: %.% default is absent or invalid',
        expected.relation_name, expected.column_name
        USING ERRCODE = 'invalid_table_definition';
    END IF;
  END LOOP;

  FOR expected IN
    SELECT *
    FROM (VALUES
      ('yu.lexicon',          true,  ARRAY['word']::text[]),
      ('yu.lexicon_versions', true,  ARRAY['version_id']::text[]),
      ('yu.registry',         true,  ARRAY['book','deck']::text[]),
      ('yu.threads',          true,  ARRAY['id']::text[]),
      ('yu.threads',          false, ARRAY[
        'word','from_book','from_deck','from_id',
        'to_book','to_deck','to_id'
      ]::text[]),
      ('yu.sever_log',        true,  ARRAY['id']::text[])
    ) AS required(relation_name, primary_only, key_columns)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_index i ON i.indexrelid = c.conindid
      WHERE c.conrelid = to_regclass(expected.relation_name)
        AND c.contype = CASE WHEN expected.primary_only THEN 'p' ELSE 'u' END
        AND c.convalidated
        AND c.conislocal
        AND c.coninhcount = 0
        AND c.conparentid = 0
        AND NOT c.condeferrable
        AND NOT c.condeferred
        AND ARRAY(
          SELECT a.attname::text
          FROM unnest(c.conkey::smallint[]) WITH ORDINALITY AS k(attnum, ordinality)
          JOIN pg_catalog.pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = k.attnum
          ORDER BY k.ordinality
        ) = expected.key_columns
        AND i.indrelid = c.conrelid
        AND i.indisunique
        AND i.indisprimary = expected.primary_only
        AND i.indimmediate
        AND i.indisvalid
        AND i.indisready
        AND NOT i.indnullsnotdistinct
        AND i.indpred IS NULL
        AND i.indexprs IS NULL
        AND i.indnkeyatts = cardinality(expected.key_columns)
        AND i.indnatts = i.indnkeyatts
        AND ARRAY(
          SELECT a.attname::text
          FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum, ordinality)
          JOIN pg_catalog.pg_attribute a
            ON a.attrelid = i.indrelid AND a.attnum = k.attnum
          WHERE k.ordinality <= i.indnkeyatts
          ORDER BY k.ordinality
        ) = expected.key_columns
    ) THEN
      RAISE EXCEPTION 'YUTABASE CANDIDATE: %.% key is absent or invalid',
        expected.relation_name, array_to_string(expected.key_columns, ',')
        USING ERRCODE = 'invalid_table_definition';
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_index i
    WHERE i.indrelid IN (
      'yu.lexicon'::regclass,
      'yu.lexicon_versions'::regclass,
      'yu.registry'::regclass,
      'yu.threads'::regclass,
      'yu.sever_log'::regclass
    )
  ) <> 8 THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: unexpected legacy core index surface'
      USING ERRCODE = 'invalid_table_definition';
  END IF;

  FOR expected IN
    SELECT *
    FROM (VALUES
      ('lexicon_pkey',
        $index$CREATE UNIQUE INDEX lexicon_pkey ON yu.lexicon USING btree (word)$index$),
      ('lexicon_versions_pkey',
        $index$CREATE UNIQUE INDEX lexicon_versions_pkey ON yu.lexicon_versions USING btree (version_id)$index$),
      ('registry_pkey',
        $index$CREATE UNIQUE INDEX registry_pkey ON yu.registry USING btree (book, deck)$index$),
      ('threads_pkey',
        $index$CREATE UNIQUE INDEX threads_pkey ON yu.threads USING btree (id)$index$),
      ('threads_word_from_book_from_deck_from_id_to_book_to_deck_to_key',
        $index$CREATE UNIQUE INDEX threads_word_from_book_from_deck_from_id_to_book_to_deck_to_key ON yu.threads USING btree (word, from_book, from_deck, from_id, to_book, to_deck, to_id)$index$),
      ('threads_out',
        $index$CREATE INDEX threads_out ON yu.threads USING btree (word, from_book, from_deck, from_id)$index$),
      ('threads_in',
        $index$CREATE INDEX threads_in ON yu.threads USING btree (word, to_book, to_deck, to_id)$index$),
      ('sever_log_pkey',
        $index$CREATE UNIQUE INDEX sever_log_pkey ON yu.sever_log USING btree (id)$index$)
    ) AS required(index_name, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_index i
      WHERE i.indexrelid = to_regclass(format('yu.%I', expected.index_name))
        AND i.indisvalid
        AND i.indisready
        AND i.indislive
        AND i.indimmediate
        AND NOT i.indisclustered
        AND NOT i.indisreplident
        AND NOT i.indcheckxmin
        AND pg_catalog.pg_get_indexdef(i.indexrelid) = expected.definition
    ) THEN
      RAISE EXCEPTION 'YUTABASE CANDIDATE: yu.% index definition is absent or invalid',
        expected.index_name
        USING ERRCODE = 'invalid_table_definition';
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'yu.lexicon_versions'::regclass
      AND a.attname = 'version_id'
      AND a.atttypid = 'bigint'::regtype
      AND a.attnotnull
      AND a.attidentity = 'a'
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: yu.lexicon_versions.version_id must remain a generated-always bigint identity'
      USING ERRCODE = 'invalid_table_definition';
  END IF;

  IF pg_catalog.pg_get_serial_sequence(
       'yu.lexicon_versions', 'version_id'
     ) IS DISTINCT FROM 'yu.lexicon_versions_version_id_seq'
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class sequence_relation
       JOIN pg_catalog.pg_sequence sequence_state
         ON sequence_state.seqrelid = sequence_relation.oid
       JOIN pg_catalog.pg_class owning_table
         ON owning_table.oid = 'yu.lexicon_versions'::regclass
       WHERE sequence_relation.oid =
               'yu.lexicon_versions_version_id_seq'::regclass
         AND sequence_relation.relnamespace = 'yu'::regnamespace
         AND sequence_relation.relkind = 'S'
         AND sequence_relation.relpersistence = 'p'
         AND sequence_relation.relowner = owning_table.relowner
         AND sequence_state.seqtypid = 'bigint'::regtype
         AND sequence_state.seqstart = 1
         AND sequence_state.seqincrement = 1
         AND sequence_state.seqmax = 9223372036854775807
         AND sequence_state.seqmin = 1
         AND sequence_state.seqcache = 1
         AND NOT sequence_state.seqcycle
     )
     OR (
       SELECT count(*)
       FROM pg_catalog.pg_depend dependency
       WHERE dependency.classid = 'pg_catalog.pg_class'::regclass
         AND dependency.objid =
               'yu.lexicon_versions_version_id_seq'::regclass
         AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
         AND dependency.refobjid = 'yu.lexicon_versions'::regclass
         AND dependency.refobjsubid = 1
         AND dependency.deptype = 'i'
     ) <> 1 THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: yu.lexicon_versions.version_id identity sequence is invalid'
      USING ERRCODE = 'invalid_table_definition';
  END IF;

  -- Constraints are executable behavior, not labels. Require the complete
  -- original surface so a same-named narrower CHECK, altered FK action, or
  -- additional constraint cannot be silently retained under a revision-4
  -- stamp. The six required identity keys were verified structurally above.
  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid IN (
      'yu.lexicon'::regclass,
      'yu.lexicon_versions'::regclass,
      'yu.registry'::regclass,
      'yu.threads'::regclass,
      'yu.sever_log'::regclass
    )
  ) <> 16 THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: unexpected legacy core constraint surface'
      USING ERRCODE = 'invalid_table_definition';
  END IF;

  FOR expected IN
    SELECT *
    FROM (VALUES
      ('yu.lexicon', 'lexicon_status_check',
        $expr$(status = ANY (ARRAY['live'::text, 'retired'::text]))$expr$),
      ('yu.lexicon', 'lexicon_how_check',
        $expr$(how = ANY (ARRAY['witnessed'::text, 'live'::text, 'cached'::text, 'computed'::text, 'declared'::text]))$expr$),
      ('yu.lexicon', 'lexicon_check',
        $expr$((how <> 'cached'::text) OR (src IS NOT NULL))$expr$),
      ('yu.lexicon', 'lexicon_check1',
        $expr$((how <> 'computed'::text) OR (src IS NOT NULL))$expr$),
      ('yu.threads', 'threads_how_check',
        $expr$(how = ANY (ARRAY['witnessed'::text, 'live'::text, 'cached'::text, 'computed'::text, 'declared'::text]))$expr$),
      ('yu.threads', 'threads_check',
        $expr$((how <> 'cached'::text) OR (src IS NOT NULL))$expr$),
      ('yu.threads', 'threads_check1',
        $expr$((how <> 'computed'::text) OR (src IS NOT NULL))$expr$),
      ('yu.sever_log', 'sever_log_how_check',
        $expr$(how = ANY (ARRAY['witnessed'::text, 'live'::text, 'cached'::text, 'computed'::text, 'declared'::text]))$expr$)
    ) AS required(relation_name, constraint_name, expression)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = to_regclass(expected.relation_name)
        AND c.conname = expected.constraint_name
        AND c.contype = 'c'
        AND c.convalidated
        AND c.conislocal
        AND c.coninhcount = 0
        AND NOT c.connoinherit
        AND NOT c.condeferrable
        AND NOT c.condeferred
        AND pg_catalog.pg_get_expr(c.conbin, c.conrelid, false)
              = expected.expression
    ) THEN
      RAISE EXCEPTION 'YUTABASE CANDIDATE: %.% definition is absent or invalid',
        expected.relation_name, expected.constraint_name
        USING ERRCODE = 'invalid_table_definition';
    END IF;
  END LOOP;

  FOR expected IN
    SELECT *
    FROM (VALUES
      ('yu.lexicon_versions', ARRAY['word']::text[],
        'yu.lexicon', ARRAY['word']::text[]),
      ('yu.threads', ARRAY['word']::text[],
        'yu.lexicon', ARRAY['word']::text[])
    ) AS required(
      relation_name, key_columns, referenced_relation, referenced_columns
    )
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = to_regclass(expected.relation_name)
        AND c.contype = 'f'
        AND c.confrelid = to_regclass(expected.referenced_relation)
        AND c.conindid = (
          SELECT referenced.conindid
          FROM pg_catalog.pg_constraint referenced
          WHERE referenced.conrelid = to_regclass(expected.referenced_relation)
            AND referenced.contype = 'p'
        )
        AND c.convalidated
        AND c.conislocal
        AND c.coninhcount = 0
        AND NOT c.condeferrable
        AND NOT c.condeferred
        AND c.confupdtype = 'a'
        AND c.confdeltype = 'a'
        AND c.confmatchtype = 's'
        AND ARRAY(
          SELECT a.attname::text
          FROM unnest(c.conkey::smallint[]) WITH ORDINALITY AS k(attnum, position)
          JOIN pg_catalog.pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = k.attnum
          ORDER BY k.position
        ) = expected.key_columns
        AND ARRAY(
          SELECT a.attname::text
          FROM unnest(c.confkey::smallint[]) WITH ORDINALITY AS k(attnum, position)
          JOIN pg_catalog.pg_attribute a
            ON a.attrelid = c.confrelid AND a.attnum = k.attnum
          ORDER BY k.position
        ) = expected.referenced_columns
        AND (
          SELECT count(*)
          FROM pg_catalog.pg_trigger t
          WHERE t.tgconstraint = c.oid
        ) = 4
        AND NOT EXISTS (
          SELECT 1
          FROM (VALUES
            (true,  9, 'RI_FKey_noaction_del'),
            (true, 17, 'RI_FKey_noaction_upd'),
            (false, 5, 'RI_FKey_check_ins'),
            (false,17, 'RI_FKey_check_upd')
          ) AS required_trigger(
            on_referenced_relation, trigger_type, function_name
          )
          WHERE NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_trigger t
            WHERE t.tgconstraint = c.oid
              AND t.tgrelid = to_regclass(
                CASE
                  WHEN required_trigger.on_referenced_relation
                    THEN expected.referenced_relation
                  ELSE expected.relation_name
                END
              )
              AND t.tgisinternal
              AND t.tgenabled = 'O'
              AND t.tgtype = required_trigger.trigger_type
              AND t.tgfoid = to_regprocedure(
                format('pg_catalog.%I()', required_trigger.function_name)
              )
              AND NOT t.tgdeferrable
              AND NOT t.tginitdeferred
              AND cardinality(t.tgattr::smallint[]) = 0
              AND t.tgqual IS NULL
          )
        )
    ) THEN
      RAISE EXCEPTION 'YUTABASE CANDIDATE: %.% foreign key is absent or invalid',
        expected.relation_name, array_to_string(expected.key_columns, ',')
        USING ERRCODE = 'invalid_table_definition';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM yu.lexicon_versions history
    LEFT JOIN yu.lexicon word ON word.word = history.word
    WHERE word.word IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM yu.threads thread
    LEFT JOIN yu.lexicon word ON word.word = thread.word
    WHERE word.word IS NULL
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: legacy word foreign-key data is inconsistent'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- Candidate identity: database truth, not an SDK guess
-- ──────────────────────────────────────────────────────────

CREATE TABLE yu.standard_meta (
  singleton    boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  standard     text NOT NULL CHECK (standard = 'YUTABASE'),
  profile      text NOT NULL CHECK (profile = 'postgres'),
  version      text NOT NULL,
  revision     integer NOT NULL CHECK (revision >= 0),
  capabilities text[] NOT NULL DEFAULT '{}'::text[],
  installed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  upgraded_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- ──────────────────────────────────────────────────────────
-- Logical-to-physical registry mapping
-- ──────────────────────────────────────────────────────────

ALTER TABLE yu.registry
  ADD COLUMN physical_schema text,
  ADD COLUMN physical_table text;

UPDATE yu.registry
SET physical_schema = book,
    physical_table = deck
WHERE physical_schema IS NULL OR physical_table IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM yu.registry
    WHERE octet_length(physical_schema) > 63
       OR octet_length(physical_table) > 63
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: physical schema and table names must fit PostgreSQL identifiers (63 bytes)'
      USING ERRCODE = 'name_too_long';
  END IF;
END $$;

ALTER TABLE yu.registry
  ALTER COLUMN physical_schema SET NOT NULL,
  ALTER COLUMN physical_table SET NOT NULL,
  ADD CONSTRAINT registry_logical_book_identifier
    CHECK (book ~ '^[a-z_][a-z0-9_]*$'),
  ADD CONSTRAINT registry_logical_deck_identifier
    CHECK (deck ~ '^[a-z_][a-z0-9_]*$'),
  ADD CONSTRAINT registry_physical_schema_identifier
    CHECK (
      physical_schema ~ '^[a-z_][a-z0-9_]*$'
      AND octet_length(physical_schema) <= 63
    ),
  ADD CONSTRAINT registry_physical_table_identifier
    CHECK (
      physical_table ~ '^[a-z_][a-z0-9_]*$'
      AND octet_length(physical_table) <= 63
    ),
  ADD CONSTRAINT registry_id_column_identifier
    CHECK (id_col ~ '^[a-z_][a-z0-9_]*$'),
  ADD CONSTRAINT registry_at_column_identifier
    CHECK (at_col ~ '^[a-z_][a-z0-9_]*$'),
  ADD CONSTRAINT registry_by_column_identifier
    CHECK (by_col ~ '^[a-z_][a-z0-9_]*$'),
  ADD CONSTRAINT registry_how_column_identifier
    CHECK (how_col ~ '^[a-z_][a-z0-9_]*$'),
  ADD CONSTRAINT registry_src_column_identifier
    CHECK (src_col ~ '^[a-z_][a-z0-9_]*$'),
  ADD CONSTRAINT registry_claimant_nonempty
    CHECK (btrim(by) <> ''),
  ADD CONSTRAINT registry_physical_table_unique
    UNIQUE (physical_schema, physical_table);

-- Enumerate active logical references with owner rights so row-level security
-- cannot hide an invariant from the remap check. The caller still reads the
-- proposed physical table with its own application privileges below.
CREATE OR REPLACE FUNCTION yu._registry_referenced_ids(
  logical_book text,
  logical_deck text
)
RETURNS SETOF uuid AS $$
  SELECT t.from_id
  FROM yu.threads t
  WHERE t.from_book = logical_book AND t.from_deck = logical_deck
  UNION
  SELECT t.to_id
  FROM yu.threads t
  WHERE t.to_book = logical_book AND t.to_deck = logical_deck
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, yu, pg_temp
SET row_security = off;

CREATE OR REPLACE FUNCTION yu._validate_registry_mapping()
RETURNS trigger AS $$
DECLARE
  relation_oid regclass;
  relation_kind "char";
  relation_persistence "char";
  actual_type regtype;
  id_not_null boolean;
  referenced_id uuid;
  reference_found boolean;
BEGIN
  -- Resolve the catalog names exactly. regclass input truncates overlong SQL
  -- identifiers, which could otherwise make two stored mappings alias one
  -- physical relation.
  SELECT c.oid::regclass, c.relkind, c.relpersistence
  INTO relation_oid, relation_kind, relation_persistence
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = NEW.physical_schema
    AND c.relname = NEW.physical_table;
  IF relation_oid IS NULL THEN
    RAISE EXCEPTION 'REGISTRY: physical table %.% does not exist',
      NEW.physical_schema, NEW.physical_table
      USING ERRCODE = 'undefined_table';
  END IF;
  IF relation_kind <> 'r'
     OR relation_persistence <> 'p'
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_inherits i
       WHERE i.inhrelid = relation_oid OR i.inhparent = relation_oid
     ) THEN
    RAISE EXCEPTION
      'REGISTRY: physical deck %.% must be a standalone permanent ordinary table',
      NEW.physical_schema, NEW.physical_table
      USING ERRCODE = 'invalid_table_definition';
  END IF;

  SELECT a.atttypid::regtype, a.attnotnull
  INTO actual_type, id_not_null
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = relation_oid
    AND a.attname = NEW.id_col
    AND a.attnum > 0
    AND NOT a.attisdropped;
  IF NOT FOUND OR actual_type <> 'uuid'::regtype OR NOT id_not_null THEN
    RAISE EXCEPTION 'REGISTRY: %.%.% must exist and be uuid NOT NULL',
      NEW.physical_schema, NEW.physical_table, NEW.id_col
      USING ERRCODE = 'datatype_mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attnum = i.indkey[0]
    WHERE i.indrelid = relation_oid
      AND i.indisunique
      AND i.indisvalid
      AND i.indisready
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indnkeyatts = 1
      AND a.attname = NEW.id_col
  ) THEN
    RAISE EXCEPTION 'REGISTRY: %.%.% must be the sole key of a valid unique index or primary key',
      NEW.physical_schema, NEW.physical_table, NEW.id_col
      USING ERRCODE = 'invalid_table_definition';
  END IF;

  SELECT a.atttypid::regtype INTO actual_type
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = relation_oid AND a.attname = NEW.at_col
    AND a.attnum > 0 AND NOT a.attisdropped;
  IF NOT FOUND OR actual_type <> 'timestamp with time zone'::regtype THEN
    RAISE EXCEPTION 'REGISTRY: %.%.% must exist and have type timestamptz',
      NEW.physical_schema, NEW.physical_table, NEW.at_col
      USING ERRCODE = 'datatype_mismatch';
  END IF;

  SELECT a.atttypid::regtype INTO actual_type
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = relation_oid AND a.attname = NEW.by_col
    AND a.attnum > 0 AND NOT a.attisdropped;
  IF NOT FOUND OR actual_type <> 'text'::regtype THEN
    RAISE EXCEPTION 'REGISTRY: %.%.% must exist and have type text',
      NEW.physical_schema, NEW.physical_table, NEW.by_col
      USING ERRCODE = 'datatype_mismatch';
  END IF;

  SELECT a.atttypid::regtype INTO actual_type
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = relation_oid AND a.attname = NEW.how_col
    AND a.attnum > 0 AND NOT a.attisdropped;
  IF NOT FOUND OR actual_type <> 'text'::regtype THEN
    RAISE EXCEPTION 'REGISTRY: %.%.% must exist and have type text',
      NEW.physical_schema, NEW.physical_table, NEW.how_col
      USING ERRCODE = 'datatype_mismatch';
  END IF;

  SELECT a.atttypid::regtype INTO actual_type
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = relation_oid AND a.attname = NEW.src_col
    AND a.attnum > 0 AND NOT a.attisdropped;
  IF NOT FOUND OR actual_type <> 'text[]'::regtype THEN
    RAISE EXCEPTION 'REGISTRY: %.%.% must exist and have type text[]',
      NEW.physical_schema, NEW.physical_table, NEW.src_col
      USING ERRCODE = 'datatype_mismatch';
  END IF;

  -- A remap may move a logical deck, but it may not silently strand any
  -- active logical refs. UUID equality is the strongest check this binding
  -- can make; semantic equivalence remains an operator responsibility.
  IF TG_OP = 'UPDATE'
     AND ROW(NEW.physical_schema, NEW.physical_table, NEW.id_col)
         IS DISTINCT FROM
         ROW(OLD.physical_schema, OLD.physical_table, OLD.id_col) THEN
    FOR referenced_id IN
      SELECT id FROM yu._registry_referenced_ids(OLD.book, OLD.deck) AS ids(id)
    LOOP
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1)',
        NEW.physical_schema, NEW.physical_table, NEW.id_col
      ) INTO reference_found USING referenced_id;
      IF NOT reference_found THEN
        RAISE EXCEPTION 'REGISTRY REMAP: active ref %/%/% is absent from %.%',
          OLD.book, OLD.deck, referenced_id,
          NEW.physical_schema, NEW.physical_table
          USING ERRCODE = 'foreign_key_violation';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, yu, pg_temp;

CREATE TRIGGER registry_validate_physical_mapping
  BEFORE INSERT OR UPDATE OF physical_schema, physical_table, id_col, at_col, by_col, how_col, src_col
  ON yu.registry
  FOR EACH ROW EXECUTE FUNCTION yu._validate_registry_mapping();

-- Validate legacy mappings now. This no-op update deliberately fires the
-- validator for every existing declaration; any broken mapping aborts the
-- surrounding migration transaction.
UPDATE yu.registry
SET physical_schema = physical_schema,
    physical_table = physical_table,
    id_col = id_col,
    at_col = at_col,
    by_col = by_col,
    how_col = how_col,
    src_col = src_col;

-- ──────────────────────────────────────────────────────────
-- Immutable word semantics and explicit thread pinning
-- ──────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM yu.lexicon WHERE octet_length(word) > 63
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: lexicon words must fit PostgreSQL view identifiers (63 bytes)'
      USING ERRCODE = 'name_too_long';
  END IF;
END $$;

ALTER TABLE yu.lexicon
  ADD COLUMN current_version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT lexicon_status_candidate
    CHECK (status IN ('live', 'retired')),
  ADD CONSTRAINT lexicon_how_candidate
    CHECK (how IN ('witnessed','live','cached','computed','declared')),
  ADD CONSTRAINT lexicon_word_identifier
    CHECK (
      word ~ '^[a-z_][a-z0-9_]*$'
      AND octet_length(word) <= 63
    ),
  ADD CONSTRAINT lexicon_gloss_nonempty
    CHECK (btrim(gloss) <> ''),
  ADD CONSTRAINT lexicon_inverse_nonempty
    CHECK (btrim(inverse) <> ''),
  ADD CONSTRAINT lexicon_from_pattern
    CHECK (from_deck ~ '^(\*|[a-z_][a-z0-9_]*)/(\*|[a-z_][a-z0-9_]*)$'),
  ADD CONSTRAINT lexicon_to_pattern
    CHECK (to_deck ~ '^(\*|[a-z_][a-z0-9_]*)/(\*|[a-z_][a-z0-9_]*)$'),
  ADD CONSTRAINT lexicon_claimant_nonempty
    CHECK (btrim(by) <> ''),
  ADD CONSTRAINT lexicon_sources_nonempty_when_required
    CHECK (
      how NOT IN ('cached', 'computed')
      OR (src IS NOT NULL AND cardinality(src) > 0)
    ),
  ADD CONSTRAINT lexicon_current_version_positive
    CHECK (current_version >= 1);

CREATE TABLE yu.word_versions (
  word          text NOT NULL REFERENCES yu.lexicon(word) ON UPDATE RESTRICT ON DELETE RESTRICT,
  word_version  integer NOT NULL CHECK (word_version >= 1),
  gloss         text NOT NULL CHECK (btrim(gloss) <> ''),
  inverse       text NOT NULL CHECK (btrim(inverse) <> ''),
  from_deck     text NOT NULL,
  to_deck       text NOT NULL,
  to_one        boolean NOT NULL,
  ttl           interval,
  status        text NOT NULL CHECK (status IN ('live', 'retired')),
  at            timestamptz NOT NULL,
  by            text NOT NULL CHECK (btrim(by) <> ''),
  how           text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared')),
  src           text[],
  recorded_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (word, word_version),
  CHECK (from_deck ~ '^(\*|[a-z_][a-z0-9_]*)/(\*|[a-z_][a-z0-9_]*)$'),
  CHECK (to_deck ~ '^(\*|[a-z_][a-z0-9_]*)/(\*|[a-z_][a-z0-9_]*)$'),
  CHECK (
    how NOT IN ('cached', 'computed')
    OR (src IS NOT NULL AND cardinality(src) > 0)
  )
);

-- Legacy rows did not pin a complete historical definition. Version 1 is an
-- honest migration-time snapshot of the current row, not reconstructed past.
INSERT INTO yu.word_versions (
  word, word_version, gloss, inverse, from_deck, to_deck, to_one, ttl,
  status, at, by, how, src
)
SELECT
  word, 1, gloss, inverse, from_deck, to_deck, to_one, ttl,
  status, at, by, how, src
FROM yu.lexicon;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM yu.lexicon l
    LEFT JOIN yu.word_versions v
      ON v.word = l.word AND v.word_version = 1
    WHERE v.word IS NULL
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: every legacy word must receive a version 1 snapshot'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION yu._begin_word_version()
RETURNS trigger AS $$
DECLARE
  semantics_changed boolean;
BEGIN
  semantics_changed := ROW(
    NEW.gloss, NEW.inverse, NEW.from_deck, NEW.to_deck, NEW.to_one,
    NEW.ttl, NEW.status, NEW.at, NEW."by", NEW.how, NEW.src
  ) IS DISTINCT FROM ROW(
    OLD.gloss, OLD.inverse, OLD.from_deck, OLD.to_deck, OLD.to_one,
    OLD.ttl, OLD.status, OLD.at, OLD."by", OLD.how, OLD.src
  );

  IF NOT semantics_changed THEN
    IF NEW.current_version <> OLD.current_version THEN
      RAISE EXCEPTION 'WORD VERSION: current_version is managed by YUTABASE'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.current_version <> OLD.current_version THEN
    RAISE EXCEPTION 'WORD VERSION: callers cannot choose current_version'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.at IS NOT DISTINCT FROM OLD.at THEN
    RAISE EXCEPTION 'WORD VERSION: semantic changes require an explicit new at claim'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.to_one AND NOT OLD.to_one AND EXISTS (
    SELECT 1
    FROM yu.threads t
    WHERE t.word = OLD.word
    GROUP BY t.from_book, t.from_deck, t.from_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'TO_ONE TRANSITION: sever duplicate outgoing threads before narrowing word %',
      OLD.word
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.current_version := OLD.current_version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, yu, pg_temp
SET row_security = off;

CREATE OR REPLACE FUNCTION yu._capture_word_version()
RETURNS trigger AS $$
BEGIN
  INSERT INTO yu.word_versions (
    word, word_version, gloss, inverse, from_deck, to_deck, to_one, ttl,
    status, at, by, how, src
  ) VALUES (
    NEW.word, NEW.current_version, NEW.gloss, NEW.inverse,
    NEW.from_deck, NEW.to_deck, NEW.to_one, NEW.ttl,
    NEW.status, NEW.at, NEW."by", NEW.how, NEW.src
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, yu, pg_temp
SET row_security = off;

CREATE OR REPLACE FUNCTION yu._begin_word_insert()
RETURNS trigger AS $$
BEGIN
  IF NEW.current_version <> 1 THEN
    RAISE EXCEPTION 'WORD VERSION: new words must begin at version 1'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION yu._refuse_word_version_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'WORD VERSION: snapshots are immutable; append through yu.lexicon instead'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lexicon_begin_semantic_version
  BEFORE UPDATE ON yu.lexicon
  FOR EACH ROW EXECUTE FUNCTION yu._begin_word_version();

CREATE TRIGGER lexicon_begin_insert_version
  BEFORE INSERT ON yu.lexicon
  FOR EACH ROW EXECUTE FUNCTION yu._begin_word_insert();

CREATE TRIGGER lexicon_capture_insert_version
  AFTER INSERT ON yu.lexicon
  FOR EACH ROW EXECUTE FUNCTION yu._capture_word_version();

CREATE TRIGGER lexicon_capture_update_version
  AFTER UPDATE ON yu.lexicon
  FOR EACH ROW
  WHEN (NEW.current_version IS DISTINCT FROM OLD.current_version)
  EXECUTE FUNCTION yu._capture_word_version();

CREATE TRIGGER word_versions_immutable
  BEFORE UPDATE OR DELETE ON yu.word_versions
  FOR EACH ROW EXECUTE FUNCTION yu._refuse_word_version_mutation();

ALTER TABLE yu.threads
  ADD COLUMN word_version integer,
  ADD COLUMN word_to_one boolean;

UPDATE yu.threads t
SET word_version = l.current_version,
    word_to_one = l.to_one
FROM yu.lexicon l
WHERE l.word = t.word;

ALTER TABLE yu.threads
  ALTER COLUMN word_version SET NOT NULL,
  ALTER COLUMN word_to_one SET NOT NULL,
  ADD CONSTRAINT threads_how_candidate
    CHECK (how IN ('witnessed','live','cached','computed','declared')),
  ADD CONSTRAINT threads_word_version_positive
    CHECK (word_version >= 1),
  ADD CONSTRAINT threads_claimant_nonempty
    CHECK (btrim(by) <> ''),
  ADD CONSTRAINT threads_sources_nonempty_when_required
    CHECK (
      how NOT IN ('cached', 'computed')
      OR (src IS NOT NULL AND cardinality(src) > 0)
    ),
  ADD CONSTRAINT threads_word_version_fk
    FOREIGN KEY (word, word_version)
    REFERENCES yu.word_versions(word, word_version),
  ADD CONSTRAINT threads_from_registry_fk
    FOREIGN KEY (from_book, from_deck)
    REFERENCES yu.registry(book, deck),
  ADD CONSTRAINT threads_to_registry_fk
    FOREIGN KEY (to_book, to_deck)
    REFERENCES yu.registry(book, deck);

DROP FUNCTION IF EXISTS yu._enforce_to_one();

CREATE UNIQUE INDEX threads_to_one_active
  ON yu.threads (word, from_book, from_deck, from_id)
  WHERE word_to_one;

-- A thread UUID names one relation event for the lifetime of the database,
-- including after severance. The original schema enforced uniqueness only
-- within each of the active and archive tables, so reject an already-ambiguous
-- legacy base before creating the durable reservation ledger.
DO $$
BEGIN
  IF EXISTS (
    SELECT id
    FROM (
      SELECT id FROM yu.threads
      UNION ALL
      SELECT id FROM yu.sever_log
    ) AS historical_ids
    GROUP BY id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: a thread UUID exists in both active and severed history'
      USING ERRCODE = 'unique_violation';
  END IF;
END $$;

CREATE TABLE yu.thread_ids (
  id uuid PRIMARY KEY
);

INSERT INTO yu.thread_ids (id)
SELECT id FROM yu.threads
UNION
SELECT id FROM yu.sever_log;

CREATE OR REPLACE FUNCTION yu._reserve_thread_id()
RETURNS trigger AS $$
BEGIN
  INSERT INTO yu.thread_ids (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, yu, pg_temp
SET row_security = off;

-- Reserve only after PostgreSQL has accepted the active row. BEFORE-trigger
-- side effects survive when ON CONFLICT skips a row; an AFTER trigger does not
-- fire for that skipped row, while a duplicate historical UUID still aborts
-- and rolls back the newly inserted active row.
CREATE TRIGGER threads_reserve_id
  AFTER INSERT ON yu.threads
  FOR EACH ROW EXECUTE FUNCTION yu._reserve_thread_id();

CREATE OR REPLACE FUNCTION yu._card_exists(
  logical_book text,
  logical_deck text,
  card_id uuid
)
RETURNS boolean AS $$
DECLARE
  r yu.registry%ROWTYPE;
  found boolean;
BEGIN
  SELECT * INTO STRICT r
  FROM yu.registry
  WHERE book = logical_book AND deck = logical_deck;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1)',
    r.physical_schema, r.physical_table, r.id_col
  ) INTO found USING card_id;

  RETURN found;
EXCEPTION
  WHEN no_data_found THEN
    RAISE EXCEPTION 'UNREGISTERED DECK: %/%', logical_book, logical_deck
      USING ERRCODE = 'foreign_key_violation';
  WHEN undefined_table OR undefined_column THEN
    -- Registered endpoints are soft references. A missing physical object is
    -- reported as a dead reference by doctor/check instead of aborting the
    -- integrity scan itself.
    RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, yu, pg_temp;

-- A deterministic transaction-lock key lets thread insertion and an installed
-- deck guard serialize without requiring UPDATE privilege on application
-- tables. Hash collisions only over-serialize unrelated cards; they cannot
-- weaken the integrity check.
CREATE OR REPLACE FUNCTION yu._card_lock_key(
  logical_book text,
  logical_deck text,
  card_id uuid
)
RETURNS bigint AS $$
  SELECT pg_catalog.hashtextextended(
    logical_book || '/' || logical_deck || '/' || card_id::text,
    0
  )
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

-- Upgrade is intentionally strict: candidate identity is not stamped onto a
-- database whose pre-candidate threads already point at missing cards.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT id, from_book, from_deck, from_id, to_book, to_deck, to_id
    FROM yu.threads
  LOOP
    IF NOT yu._card_exists(t.from_book, t.from_deck, t.from_id) THEN
      RAISE EXCEPTION 'MISSING LEGACY CARD: thread % source %/%/% does not exist',
        t.id, t.from_book, t.from_deck, t.from_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NOT yu._card_exists(t.to_book, t.to_deck, t.to_id) THEN
      RAISE EXCEPTION 'MISSING LEGACY CARD: thread % target %/%/% does not exist',
        t.id, t.to_book, t.to_deck, t.to_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION yu._deck_matches(
  pattern text,
  book text,
  deck text
)
RETURNS boolean AS $$
  SELECT
    (split_part(pattern, '/', 1) = '*' OR split_part(pattern, '/', 1) = book)
    AND
    (split_part(pattern, '/', 2) = '*' OR split_part(pattern, '/', 2) = deck)
$$ LANGUAGE sql IMMUTABLE;

-- Legacy words were editable after thread insertion. Refuse to pin a current
-- definition as version 1 when its endpoint patterns no longer describe an
-- active legacy thread.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM yu.threads t
    JOIN yu.lexicon l ON l.word = t.word
    WHERE NOT yu._deck_matches(l.from_deck, t.from_book, t.from_deck)
       OR NOT yu._deck_matches(l.to_deck, t.to_book, t.to_deck)
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: a legacy thread violates its current word endpoint patterns'
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- Keep global semantic and registry locks behind a narrow owner-rights helper.
-- The outer trigger remains security-invoker so physical endpoint reads obey
-- the writer's application-deck grants and row-level-security policy.
CREATE OR REPLACE FUNCTION yu._lock_thread_context(
  thread_word text,
  source_book text,
  source_deck text,
  source_id uuid,
  target_book text,
  target_deck text,
  target_id uuid
)
RETURNS TABLE (
  pinned_word_version integer,
  pinned_word_to_one boolean,
  source_physical_schema text,
  source_physical_table text,
  source_id_column text,
  target_physical_schema text,
  target_physical_table text,
  target_id_column text
) AS $$
DECLARE
  lex yu.lexicon%ROWTYPE;
  locked_registry yu.registry%ROWTYPE;
  from_registry yu.registry%ROWTYPE;
  to_registry yu.registry%ROWTYPE;
  from_registered boolean := false;
  to_registered boolean := false;
  endpoint_lock_key bigint;
BEGIN
  -- A semantic edit/retirement cannot cross this insertion: whichever
  -- transaction obtains the word-row lock first defines the visible version.
  SELECT * INTO lex
  FROM yu.lexicon l
  WHERE l.word = thread_word
  FOR SHARE OF l;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN WORD: % — not in the lexicon', thread_word
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF lex.status <> 'live' THEN
    RAISE EXCEPTION 'RETIRED WORD: % — no new threads', thread_word
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT yu._deck_matches(lex.from_deck, source_book, source_deck) THEN
    RAISE EXCEPTION 'ENDPOINT MISMATCH: word % expects from_deck=% but got %/%',
      thread_word, lex.from_deck, source_book, source_deck
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT yu._deck_matches(lex.to_deck, target_book, target_deck) THEN
    RAISE EXCEPTION 'ENDPOINT MISMATCH: word % expects to_deck=% but got %/%',
      thread_word, lex.to_deck, target_book, target_deck
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock both registry rows in canonical order. This makes mapping changes
  -- serialize with thread creation, so an insert cannot validate against an
  -- old table and commit after the logical deck has moved.
  FOR locked_registry IN
    SELECT r.*
    FROM yu.registry r
    WHERE (r.book = source_book AND r.deck = source_deck)
       OR (r.book = target_book AND r.deck = target_deck)
    ORDER BY r.book, r.deck
    FOR SHARE OF r
  LOOP
    IF locked_registry.book = source_book
       AND locked_registry.deck = source_deck THEN
      from_registry := locked_registry;
      from_registered := true;
    END IF;
    IF locked_registry.book = target_book
       AND locked_registry.deck = target_deck THEN
      to_registry := locked_registry;
      to_registered := true;
    END IF;
  END LOOP;

  IF NOT from_registered THEN
    RAISE EXCEPTION 'UNREGISTERED DECK: %/%', source_book, source_deck
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NOT to_registered THEN
    RAISE EXCEPTION 'UNREGISTERED DECK: %/%', target_book, target_deck
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Take both logical-card locks in canonical order. Installed delete guards
  -- take the same transaction lock before checking active threads.
  FOR endpoint_lock_key IN
    SELECT lock_key
    FROM unnest(ARRAY[
      yu._card_lock_key(source_book, source_deck, source_id),
      yu._card_lock_key(target_book, target_deck, target_id)
    ]) AS lock_keys(lock_key)
    GROUP BY lock_key
    ORDER BY lock_key
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(endpoint_lock_key);
  END LOOP;

  -- Existing rows created under an older non-to-one word version still count
  -- once the current word has narrowed. The partial unique index below closes
  -- the concurrent-empty-source race between new to-one inserts.
  IF lex.to_one AND EXISTS (
    SELECT 1
    FROM yu.threads t
    WHERE t.word = thread_word
      AND t.from_book = source_book
      AND t.from_deck = source_deck
      AND t.from_id = source_id
  ) THEN
    RAISE EXCEPTION 'TO_ONE VIOLATION: word % already has an outgoing thread for %/%/%',
      thread_word, source_book, source_deck, source_id
      USING ERRCODE = 'unique_violation';
  END IF;

  pinned_word_version := lex.current_version;
  pinned_word_to_one := lex.to_one;
  source_physical_schema := from_registry.physical_schema;
  source_physical_table := from_registry.physical_table;
  source_id_column := from_registry.id_col;
  target_physical_schema := to_registry.physical_schema;
  target_physical_table := to_registry.physical_table;
  target_id_column := to_registry.id_col;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, yu, pg_temp
SET row_security = off;

CREATE OR REPLACE FUNCTION yu._validate_thread()
RETURNS trigger AS $$
DECLARE
  context record;
  endpoint_exists boolean;
BEGIN
  SELECT * INTO STRICT context
  FROM yu._lock_thread_context(
    NEW.word,
    NEW.from_book,
    NEW.from_deck,
    NEW.from_id,
    NEW.to_book,
    NEW.to_deck,
    NEW.to_id
  );

  -- These reads intentionally run with the inserting writer's privileges.
  -- Registration says where a card lives; it never grants access to it.
  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1)',
    context.source_physical_schema,
    context.source_physical_table,
    context.source_id_column
  ) INTO endpoint_exists USING NEW.from_id;
  IF NOT endpoint_exists THEN
    RAISE EXCEPTION 'MISSING CARD: source %/%/% does not exist',
      NEW.from_book, NEW.from_deck, NEW.from_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1)',
    context.target_physical_schema,
    context.target_physical_table,
    context.target_id_column
  ) INTO endpoint_exists USING NEW.to_id;
  IF NOT endpoint_exists THEN
    RAISE EXCEPTION 'MISSING CARD: target %/%/% does not exist',
      NEW.to_book, NEW.to_deck, NEW.to_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Callers cannot select old meanings or bypass a to_one word.
  NEW.word_version := context.pinned_word_version;
  NEW.word_to_one := context.pinned_word_to_one;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, yu, pg_temp;

CREATE TRIGGER threads_validate
  BEFORE INSERT ON yu.threads
  FOR EACH ROW EXECUTE FUNCTION yu._validate_thread();

DROP FUNCTION IF EXISTS yu._refuse_retired_new_threads();

CREATE OR REPLACE FUNCTION yu._refuse_thread_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'THREADS ARE IMMUTABLE: sever and create a new thread'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER threads_immutable
  BEFORE UPDATE ON yu.threads
  FOR EACH ROW EXECUTE FUNCTION yu._refuse_thread_mutation();

-- ──────────────────────────────────────────────────────────
-- Roles used by the candidate's least-privilege surface
-- ──────────────────────────────────────────────────────────

DO $$
BEGIN
  CREATE ROLE yu_lexicographer NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE ROLE yu_reader NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE ROLE yu_writer NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Recheck at the grant boundary. This closes the ordinary concurrent
-- CREATEROLE window between the early preflight and the duplicate-tolerant
-- role creation blocks; malicious superuser changes remain out of scope.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('yu_reader', 'yu_writer', 'yu_lexicographer')
      AND (
        r.rolcanlogin
        OR r.rolsuper
        OR r.rolcreatedb
        OR r.rolcreaterole
        OR r.rolreplication
        OR r.rolbypassrls
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('yu_reader', 'yu_writer', 'yu_lexicographer')
      AND (
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_database d
          WHERE d.datname = current_database() AND d.datdba = r.oid
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_namespace n
          WHERE n.nspname IN ('yu', 'via') AND n.nspowner = r.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname IN ('yu', 'via') AND c.relowner = r.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_proc p
          JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname IN ('yu', 'via') AND p.proowner = r.oid
        )
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_type t
          JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname IN ('yu', 'via') AND t.typowner = r.oid
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_extension e WHERE e.extowner = r.oid
        )
      )
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: capability roles changed or own protected objects at the grant boundary'
      USING ERRCODE = 'invalid_authorization_specification';
  END IF;
END $$;

GRANT yu_reader TO yu_writer WITH INHERIT TRUE;
GRANT yu_reader TO yu_lexicographer WITH INHERIT TRUE;

-- The legacy gloss history remains a compatibility projection. Run its
-- trigger with owner rights so lexicographers do not need direct append
-- permission on an otherwise audit-like table.
CREATE OR REPLACE FUNCTION yu._version_gloss()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (OLD.gloss IS DISTINCT FROM NEW.gloss
          OR OLD.inverse IS DISTINCT FROM NEW.inverse) THEN
    INSERT INTO yu.lexicon_versions (
      word, gloss, inverse, changed_at, changed_by
    ) VALUES (
      OLD.word,
      OLD.gloss,
      OLD.inverse,
      clock_timestamp(),
      NEW."by"
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, yu, pg_temp
SET row_security = off;

CREATE TRIGGER lexicon_version_gloss
  BEFORE UPDATE OF gloss, inverse ON yu.lexicon
  FOR EACH ROW EXECUTE FUNCTION yu._version_gloss();

-- ──────────────────────────────────────────────────────────
-- Severing preserves both meanings and both claims
-- ──────────────────────────────────────────────────────────

ALTER TABLE yu.sever_log
  ADD COLUMN word_version integer,
  ADD COLUMN word_to_one boolean,
  ADD COLUMN thread_at timestamptz,
  ADD COLUMN thread_by text,
  ADD COLUMN thread_how text,
  ADD COLUMN thread_src text[];

-- Older sever rows cannot recover the original relation claim. They are
-- pinned to the migration-time word snapshot, while thread_* remains NULL to
-- state that the older schema did not preserve that evidence.
UPDATE yu.sever_log s
SET word_version = l.current_version,
    word_to_one = l.to_one
FROM yu.lexicon l
WHERE l.word = s.word;

ALTER TABLE yu.sever_log
  ALTER COLUMN word_version SET NOT NULL,
  ALTER COLUMN word_to_one SET NOT NULL,
  ADD CONSTRAINT sever_log_how_candidate
    CHECK (how IN ('witnessed','live','cached','computed','declared')),
  ADD CONSTRAINT sever_log_word_version_positive
    CHECK (word_version >= 1),
  ADD CONSTRAINT sever_log_claimant_nonempty
    CHECK (btrim(by) <> ''),
  ADD CONSTRAINT sever_log_sources_nonempty_when_required
    CHECK (
      how NOT IN ('cached', 'computed')
      OR (src IS NOT NULL AND cardinality(src) > 0)
    ),
  ADD CONSTRAINT sever_log_thread_claimant_nonempty
    CHECK (thread_by IS NULL OR btrim(thread_by) <> ''),
  ADD CONSTRAINT sever_log_thread_how_valid
    CHECK (
      thread_how IS NULL
      OR thread_how IN ('witnessed','live','cached','computed','declared')
    ),
  ADD CONSTRAINT sever_log_thread_sources_nonempty_when_required
    CHECK (
      thread_how IS NULL
      OR thread_how NOT IN ('cached', 'computed')
      OR (thread_src IS NOT NULL AND cardinality(thread_src) > 0)
    ),
  ADD CONSTRAINT sever_log_word_version_fk
    FOREIGN KEY (word, word_version)
    REFERENCES yu.word_versions(word, word_version);

CREATE OR REPLACE FUNCTION yu.sever(
  thread_uuid uuid,
  claim_by text,
  claim_how text,
  claim_src text[] DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  t yu.threads%ROWTYPE;
BEGIN
  IF claim_by IS NULL OR btrim(claim_by) = '' THEN
    RAISE EXCEPTION 'HONESTY: sever claims require a non-empty by'
      USING ERRCODE = 'check_violation';
  END IF;
  IF claim_how IS NULL
     OR claim_how NOT IN ('witnessed','live','cached','computed','declared') THEN
    RAISE EXCEPTION 'HONESTY: invalid sever claim kind %', claim_how
      USING ERRCODE = 'check_violation';
  END IF;
  IF claim_how IN ('cached','computed')
     AND (claim_src IS NULL OR cardinality(claim_src) = 0) THEN
    RAISE EXCEPTION 'HONESTY: % sever claims require a non-empty src', claim_how
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO t
  FROM yu.threads
  WHERE id = thread_uuid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'THREAD NOT FOUND: %', thread_uuid
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO yu.sever_log (
    id, word, word_version, word_to_one,
    from_book, from_deck, from_id,
    to_book, to_deck, to_id,
    note,
    thread_at, thread_by, thread_how, thread_src,
    at, by, how, src
  ) VALUES (
    t.id, t.word, t.word_version, t.word_to_one,
    t.from_book, t.from_deck, t.from_id,
    t.to_book, t.to_deck, t.to_id,
    t.note,
    t.at, t."by", t.how, t.src,
    clock_timestamp(), claim_by, claim_how, claim_src
  );

  DELETE FROM yu.threads WHERE id = thread_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, yu, pg_temp
SET row_security = off;

CREATE OR REPLACE FUNCTION yu._refuse_sever_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SEVER LOG IS IMMUTABLE: sever events are append-only'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sever_log_immutable
  BEFORE UPDATE OR DELETE ON yu.sever_log
  FOR EACH ROW EXECUTE FUNCTION yu._refuse_sever_log_mutation();

-- ──────────────────────────────────────────────────────────
-- Delete guards resolve logical identity through the registry
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION yu._guard_delete()
RETURNS trigger AS $$
DECLARE
  r yu.registry%ROWTYPE;
  card_id uuid;
  thread_count integer;
BEGIN
  SELECT * INTO r
  FROM yu.registry
  WHERE physical_schema = TG_TABLE_SCHEMA
    AND physical_table = TG_TABLE_NAME
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELETE GUARD: physical table %.% has no registry mapping',
      TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  card_id := NULLIF(to_jsonb(OLD) ->> r.id_col, '')::uuid;
  IF card_id IS NULL THEN
    RAISE EXCEPTION 'DELETE GUARD: %.%.% did not yield a UUID identity',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, r.id_col
      USING ERRCODE = 'datatype_mismatch';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    yu._card_lock_key(r.book, r.deck, card_id)
  );

  SELECT count(*) INTO thread_count
  FROM yu.threads t
  WHERE (
      t.from_book = r.book
      AND t.from_deck = r.deck
      AND t.from_id = card_id
    ) OR (
      t.to_book = r.book
      AND t.to_deck = r.deck
      AND t.to_id = card_id
    );

  IF thread_count > 0 THEN
    RAISE EXCEPTION 'LIVE THREADS: %/%/% has % thread(s); sever before deleting',
      r.book, r.deck, card_id, thread_count
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, yu, pg_temp
SET row_security = off;

-- ──────────────────────────────────────────────────────────
-- Query surfaces use each thread's pinned meaning
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION yu.refresh_via()
RETURNS void AS $$
DECLARE
  w record;
  view_column text;
BEGIN
  -- Retired words remain queryable because existing threads retain meaning.
  FOR w IN SELECT word FROM yu.lexicon LOOP
    EXECUTE format(
      'CREATE OR REPLACE VIEW via.%I WITH (security_invoker = true) AS
         SELECT
           (t.from_book || ''/'' || t.from_deck || ''/'' || t.from_id::text) AS from_ref,
           (t.to_book   || ''/'' || t.to_deck   || ''/'' || t.to_id::text) AS to_ref,
           t.note, t.at, t.by, t.how, t.src, t.id AS thread_id,
           t.word_version, v.gloss, v.inverse
         FROM yu.threads t
         JOIN yu.word_versions v
           ON v.word = t.word AND v.word_version = t.word_version
         WHERE t.word = %L',
      w.word, w.word
    );
    EXECUTE format('ALTER VIEW via.%I OWNER TO %I', w.word, current_user);
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON via.%I FROM PUBLIC, yu_reader, yu_writer, yu_lexicographer',
      w.word
    );
    FOR view_column IN
      SELECT a.attname
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = to_regclass(format('via.%I', w.word))
        AND a.attnum > 0
        AND NOT a.attisdropped
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%I) ON TABLE via.%I FROM yu_reader, yu_writer, yu_lexicographer',
        view_column,
        w.word
      );
    END LOOP;
    EXECUTE format('GRANT SELECT ON via.%I TO yu_reader', w.word);
  END LOOP;

  FOR w IN
    SELECT viewname
    FROM pg_catalog.pg_views
    WHERE schemaname = 'via'
      AND viewname NOT IN (SELECT word FROM yu.lexicon)
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS via.%I', w.viewname);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, yu, pg_temp
SET row_security = off;

CREATE OR REPLACE FUNCTION yu.stale()
RETURNS TABLE (
  book text,
  deck text,
  id uuid,
  how text,
  age interval,
  ttl interval,
  thread_word text
) AS $$
DECLARE
  r yu.registry%ROWTYPE;
  how_val text;
  at_val timestamptz;
  id_val uuid;
  ttl_val interval;
  book_val text;
  deck_val text;
  word_val text;
BEGIN
  FOR r IN SELECT reg.* FROM yu.registry reg WHERE reg.ttl IS NOT NULL LOOP
    FOR id_val, how_val, at_val IN
      EXECUTE format(
        'SELECT %I::uuid, %I::text, %I::timestamptz
         FROM %I.%I
         WHERE %I::text IN (''cached'',''computed'')',
        r.id_col, r.how_col, r.at_col,
        r.physical_schema, r.physical_table,
        r.how_col
      )
    LOOP
      IF statement_timestamp() - at_val > r.ttl THEN
        book := r.book;
        deck := r.deck;
        id := id_val;
        how := how_val;
        age := statement_timestamp() - at_val;
        ttl := r.ttl;
        thread_word := NULL;
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;

  FOR id_val, how_val, at_val, book_val, deck_val, ttl_val, word_val IN
    SELECT
      t.from_id,
      t.how,
      t.at,
      t.from_book,
      t.from_deck,
      v.ttl,
      t.word
    FROM yu.threads t
    JOIN yu.word_versions v
      ON v.word = t.word AND v.word_version = t.word_version
    WHERE v.ttl IS NOT NULL
      AND t.how IN ('cached','computed')
      AND statement_timestamp() - t.at > v.ttl
  LOOP
    book := book_val;
    deck := deck_val;
    id := id_val;
    how := how_val;
    age := statement_timestamp() - at_val;
    ttl := ttl_val;
    thread_word := word_val;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;

-- Vocabulary size is guidance, not a conformance gate. The doctor reports
-- unused terms and endpoint collisions without inventing a universal budget.
CREATE OR REPLACE FUNCTION yu.doctor()
RETURNS TABLE (flag text, word text, detail text) AS $$
  SELECT
    'zero_use',
    l.word,
    'word "' || l.word || '" has 0 threads'
  FROM yu.lexicon l
  LEFT JOIN yu.threads t ON t.word = l.word
  WHERE l.status = 'live'
  GROUP BY l.word
  HAVING count(t.id) = 0

  UNION ALL

  SELECT
    'shared_endpoints',
    a.word,
    'words ' || a.word || ' and ' || b.word || ' share endpoints '
      || a.from_deck || ' -> ' || a.to_deck
  FROM yu.lexicon a
  JOIN yu.lexicon b
    ON a.word < b.word
   AND a.from_deck = b.from_deck
   AND a.to_deck = b.to_deck
  WHERE a.status = 'live' AND b.status = 'live';
$$ LANGUAGE sql STABLE;

-- CREATE OR REPLACE retains a legacy function's owner. A supported
-- cross-owner upgrade therefore transfers every candidate function to the
-- operator running this migration before any SECURITY DEFINER function is
-- invoked. Such an upgrade requires ownership-equivalent or superuser rights.
ALTER FUNCTION yu._validate_registry_mapping() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._registry_referenced_ids(text, text) OWNER TO CURRENT_USER;
ALTER FUNCTION yu._begin_word_version() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._capture_word_version() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._begin_word_insert() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._refuse_word_version_mutation() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._card_exists(text, text, uuid) OWNER TO CURRENT_USER;
ALTER FUNCTION yu._card_lock_key(text, text, uuid) OWNER TO CURRENT_USER;
ALTER FUNCTION yu._deck_matches(text, text, text) OWNER TO CURRENT_USER;
ALTER FUNCTION yu._reserve_thread_id() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._lock_thread_context(text, text, text, uuid, text, text, uuid)
  OWNER TO CURRENT_USER;
ALTER FUNCTION yu._validate_thread() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._refuse_thread_mutation() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._version_gloss() OWNER TO CURRENT_USER;
ALTER FUNCTION yu.sever(uuid, text, text, text[]) OWNER TO CURRENT_USER;
ALTER FUNCTION yu._refuse_sever_log_mutation() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._guard_delete() OWNER TO CURRENT_USER;
ALTER FUNCTION yu.refresh_via() OWNER TO CURRENT_USER;
ALTER FUNCTION yu.stale() OWNER TO CURRENT_USER;
ALTER FUNCTION yu.doctor() OWNER TO CURRENT_USER;

-- Rebuild the views now so legacy threads immediately expose their pinned
-- meaning, including words retired before or after this migration.
SELECT yu.refresh_via();

-- ──────────────────────────────────────────────────────────
-- Replace the legacy PUBLIC grants with explicit capabilities
-- ──────────────────────────────────────────────────────────

REVOKE ALL PRIVILEGES ON SCHEMA yu FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA via FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA yu FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA via FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA yu FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA yu FROM PUBLIC;

-- Existing NOLOGIN roles may carry direct ACLs from an older installation.
-- Clear the complete YUTABASE surface before rebuilding the exact candidate
-- capabilities below. Membership-derived privileges remain an operator audit
-- responsibility and are not silently rewritten here.
REVOKE ALL PRIVILEGES ON SCHEMA yu, via
  FROM yu_reader, yu_writer, yu_lexicographer;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA yu, via
  FROM yu_reader, yu_writer, yu_lexicographer;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA yu, via
  FROM yu_reader, yu_writer, yu_lexicographer;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA yu
  FROM yu_reader, yu_writer, yu_lexicographer;

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT n.nspname, c.relname, a.attname
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('yu', 'via')
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%I) ON TABLE %I.%I FROM yu_reader, yu_writer, yu_lexicographer',
      target.attname,
      target.nspname,
      target.relname
    );
  END LOOP;
END $$;

REVOKE INSERT, UPDATE, DELETE ON yu.lexicon_versions FROM yu_lexicographer;

GRANT USAGE ON SCHEMA yu, via TO yu_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA yu TO yu_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA via TO yu_reader;
GRANT EXECUTE ON FUNCTION yu._card_exists(text, text, uuid) TO yu_reader;
GRANT EXECUTE ON FUNCTION yu.stale() TO yu_reader;
GRANT EXECUTE ON FUNCTION yu.doctor() TO yu_reader;

GRANT INSERT ON yu.threads TO yu_writer;
GRANT EXECUTE ON FUNCTION yu._lock_thread_context(text, text, text, uuid, text, text, uuid)
  TO yu_writer;
GRANT EXECUTE ON FUNCTION yu.sever(uuid, text, text, text[]) TO yu_writer;

GRANT INSERT, UPDATE ON yu.lexicon TO yu_lexicographer;
GRANT INSERT, UPDATE, DELETE ON yu.registry TO yu_lexicographer;
GRANT EXECUTE ON FUNCTION yu._registry_referenced_ids(text, text)
  TO yu_lexicographer;
GRANT EXECUTE ON FUNCTION yu.refresh_via() TO yu_lexicographer;

-- The role grants cover YUTABASE objects only. Operators separately grant
-- access to each registered physical deck according to application policy.

-- REVOKE can only retract grants attributable to the current grantor. Refuse
-- to stamp if a direct ACL issued by some other grantor survived, or if any
-- PUBLIC/capability-role ACL differs from the exact candidate whitelist.
DO $$
DECLARE
  reader_oid oid := to_regrole('yu_reader')::oid;
  writer_oid oid := to_regrole('yu_writer')::oid;
  lexicographer_oid oid := to_regrole('yu_lexicographer')::oid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace n
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
    ) acl
    WHERE n.nspname IN ('yu', 'via')
      AND acl.grantee IN (0::oid, reader_oid, writer_oid, lexicographer_oid)
      AND NOT (
        acl.grantee = reader_oid
        AND acl.privilege_type = 'USAGE'
        AND NOT acl.is_grantable
      )
  ) THEN
    RAISE EXCEPTION 'YUTABASE CANDIDATE: unexpected direct schema ACL survived normalization'
      USING ERRCODE = 'invalid_grant_operation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(
        c.relacl,
        pg_catalog.acldefault(
          CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
          c.relowner
        )
      )
    ) acl
    WHERE n.nspname IN ('yu', 'via')
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND acl.grantee IN (0::oid, reader_oid, writer_oid, lexicographer_oid)
      AND NOT (
        NOT acl.is_grantable
        AND (
          (
            acl.grantee = reader_oid
            AND acl.privilege_type = 'SELECT'
            AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
          )
          OR (
            acl.grantee = writer_oid
            AND n.nspname = 'yu'
            AND c.relname = 'threads'
            AND acl.privilege_type = 'INSERT'
          )
          OR (
            acl.grantee = lexicographer_oid
            AND n.nspname = 'yu'
            AND c.relname = 'lexicon'
            AND acl.privilege_type IN ('INSERT', 'UPDATE')
          )
          OR (
            acl.grantee = lexicographer_oid
            AND n.nspname = 'yu'
            AND c.relname = 'registry'
            AND acl.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'YUTABASE CANDIDATE: unexpected direct relation ACL survived normalization'
      USING ERRCODE = 'invalid_grant_operation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
    WHERE n.nspname IN ('yu', 'via')
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND acl.grantee IN (0::oid, reader_oid, writer_oid, lexicographer_oid)
  ) THEN
    RAISE EXCEPTION 'YUTABASE CANDIDATE: unexpected direct column ACL survived normalization'
      USING ERRCODE = 'invalid_grant_operation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    WHERE n.nspname IN ('yu', 'via')
      AND acl.grantee IN (0::oid, reader_oid, writer_oid, lexicographer_oid)
      AND NOT (
        acl.privilege_type = 'EXECUTE'
        AND NOT acl.is_grantable
        AND (
          (
            acl.grantee = reader_oid
            AND p.oid IN (
              to_regprocedure('yu._card_exists(text,text,uuid)')::oid,
              to_regprocedure('yu.stale()')::oid,
              to_regprocedure('yu.doctor()')::oid
            )
          )
          OR (
            acl.grantee = writer_oid
            AND p.oid IN (
              to_regprocedure('yu._lock_thread_context(text,text,text,uuid,text,text,uuid)')::oid,
              to_regprocedure('yu.sever(uuid,text,text,text[])')::oid
            )
          )
          OR (
            acl.grantee = lexicographer_oid
            AND p.oid IN (
              to_regprocedure('yu._registry_referenced_ids(text,text)')::oid,
              to_regprocedure('yu.refresh_via()')::oid
            )
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'YUTABASE CANDIDATE: unexpected direct function ACL survived normalization'
      USING ERRCODE = 'invalid_grant_operation';
  END IF;
END $$;

-- Recheck the two backfilled ledgers immediately before identity is stamped.
-- With row_security=off these queries either see every applicable row or fail;
-- they never silently accept a policy-filtered subset.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM yu.lexicon l
    LEFT JOIN yu.word_versions v
      ON v.word = l.word
     AND v.word_version = l.current_version
    WHERE v.word IS NULL
       OR ROW(
            v.gloss, v.inverse, v.from_deck, v.to_deck, v.to_one, v.ttl,
            v.status, v.at, v."by", v.how, v.src
          ) IS DISTINCT FROM ROW(
            l.gloss, l.inverse, l.from_deck, l.to_deck, l.to_one, l.ttl,
            l.status, l.at, l."by", l.how, l.src
          )
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: current word definitions are not completely version-pinned'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF EXISTS (
    SELECT id FROM yu.threads
    UNION
    SELECT id FROM yu.sever_log
    EXCEPT
    SELECT id FROM yu.thread_ids
  ) THEN
    RAISE EXCEPTION
      'YUTABASE CANDIDATE: historical thread UUID ledger is incomplete'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
END $$;

-- Stamp exact identity only after every validation, durable object, trigger,
-- view, and grant is in place. The migration is required to be transactional,
-- but this ordering also prevents a mistakenly nontransactional partial run
-- from advertising revision 4.
INSERT INTO yu.standard_meta (
  singleton, standard, profile, version, revision, capabilities
) VALUES (
  true,
  'YUTABASE',
  'postgres',
  '0.1.0-candidate.1',
  4,
  ARRAY[
    'row-claims',
    'logical-physical-registry',
    'word-version-pinning',
    'global-thread-id-ledger',
    'endpoint-existence-on-insert',
    'concurrency-safe-to-one',
    'role-scoped-functions'
  ]::text[]
);
