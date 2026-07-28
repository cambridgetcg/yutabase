-- YUTABASE 0.1.0-candidate.1 — PostgreSQL binding revision 5
--
-- Apply only to the exact released revision-4 candidate, in its own fresh
-- operator-controlled transaction. This revision makes mapped-card guards
-- mandatory and rejects null or blank entries in YUTABASE-owned source arrays.

-- This must be the first SQL statement. As in revision 4, READ COMMITTED takes
-- a fresh snapshot after the declared locks are acquired.
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

SET LOCAL search_path = pg_catalog;
SET LOCAL row_security = off;

DO $$
BEGIN
  IF to_regclass('yu.standard_meta') IS NULL
     OR to_regclass('yu.lexicon') IS NULL
     OR to_regclass('yu.lexicon_versions') IS NULL
     OR to_regclass('yu.word_versions') IS NULL
     OR to_regclass('yu.registry') IS NULL
     OR to_regclass('yu.thread_ids') IS NULL
     OR to_regclass('yu.threads') IS NULL
     OR to_regclass('yu.sever_log') IS NULL
     OR to_regprocedure('yu._guard_delete()') IS NULL
     OR to_regprocedure('yu._registry_referenced_ids(text,text)') IS NULL
     OR to_regprocedure('yu._validate_registry_mapping()') IS NULL THEN
    RAISE EXCEPTION
      'YUTABASE REVISION 5: expected the complete revision-4 candidate'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END $$;

-- Freeze every core relation read or altered by this migration. Registry
-- reconciliation locks each mapped physical table separately below.
LOCK TABLE
  yu.standard_meta,
  yu.lexicon,
  yu.lexicon_versions,
  yu.word_versions,
  yu.registry,
  yu.thread_ids,
  yu.threads,
  yu.sever_log
IN ACCESS EXCLUSIVE MODE;

-- Revision metadata is a compatibility gate, not proof that the released
-- catalog is still intact. These normalized fingerprints are derived from the
-- released 0004 output and are identical on supported PostgreSQL 16 and 17.
-- Dynamic data, owners, ACLs, and generated views are checked separately.
DO $$
DECLARE
  actual text;
BEGIN
  WITH surface AS (
    SELECT format(
      '%s|%s|%s|%s|%s',
      n.nspname,
      c.relname,
      c.relkind,
      c.relpersistence,
      c.relispartition
    ) AS item
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'yu'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  )
  SELECT md5(string_agg(item, E'\n' ORDER BY item)) INTO actual FROM surface;
  IF actual IS DISTINCT FROM 'a9fa656542d5dfe6f4b706b99d076b57' THEN
    RAISE EXCEPTION 'YUTABASE REVISION 5: revision-4 relation surface drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  WITH surface AS (
    SELECT format(
      '%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',
      a.attrelid::regclass,
      a.attnum,
      a.attname,
      pg_catalog.format_type(a.atttypid, a.atttypmod),
      a.attnotnull,
      a.attidentity,
      a.attgenerated,
      a.attcollation::regcollation,
      a.attstorage,
      a.attcompression,
      coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '')
    ) AS item
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef d
      ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = 'yu'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
  )
  SELECT md5(string_agg(item, E'\n' ORDER BY item)) INTO actual FROM surface;
  IF actual IS DISTINCT FROM 'f9a2e37d4721f9dea55444df19507484' THEN
    RAISE EXCEPTION 'YUTABASE REVISION 5: revision-4 column surface drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  WITH surface AS (
    SELECT format(
      '%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',
      c.conrelid::regclass,
      c.conname,
      c.contype,
      c.convalidated,
      c.condeferrable,
      c.condeferred,
      c.conislocal,
      c.coninhcount,
      c.connoinherit,
      pg_catalog.pg_get_constraintdef(c.oid, true)
    ) AS item
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'yu'
  )
  SELECT md5(string_agg(item, E'\n' ORDER BY item)) INTO actual FROM surface;
  IF actual IS DISTINCT FROM '312f94715a423d1ace44d3c81e339f26' THEN
    RAISE EXCEPTION 'YUTABASE REVISION 5: revision-4 constraint surface drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  WITH surface AS (
    SELECT format(
      '%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',
      i.indrelid::regclass,
      index_class.relname,
      i.indisunique,
      i.indisprimary,
      i.indisvalid,
      i.indisready,
      i.indimmediate,
      i.indnullsnotdistinct,
      coalesce(pg_catalog.pg_get_expr(i.indpred, i.indrelid), ''),
      coalesce(pg_catalog.pg_get_expr(i.indexprs, i.indrelid), ''),
      pg_catalog.pg_get_indexdef(i.indexrelid)
    ) AS item
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class index_class ON index_class.oid = i.indexrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = index_class.relnamespace
    WHERE n.nspname = 'yu'
  )
  SELECT md5(string_agg(item, E'\n' ORDER BY item)) INTO actual FROM surface;
  IF actual IS DISTINCT FROM 'e5bac00de1f3c06b2d90a3d0ba9b65b2' THEN
    RAISE EXCEPTION 'YUTABASE REVISION 5: revision-4 index surface drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index index_row
    JOIN pg_catalog.pg_class index_relation
      ON index_relation.oid = index_row.indexrelid
    JOIN pg_catalog.pg_namespace n
      ON n.oid = index_relation.relnamespace
    WHERE n.nspname = 'yu'
      AND (
        index_row.indisexclusion
        OR NOT index_row.indislive
      )
  ) THEN
    RAISE EXCEPTION
      'YUTABASE REVISION 5: revision-4 index enforcement flags drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  WITH surface AS (
    SELECT format(
      '%s|%s|%s|%s|%s',
      t.tgrelid::regclass,
      t.tgname,
      t.tgtype,
      t.tgenabled,
      pg_catalog.pg_get_triggerdef(t.oid, true)
    ) AS item
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'yu' AND NOT t.tgisinternal
  )
  SELECT md5(string_agg(item, E'\n' ORDER BY item)) INTO actual FROM surface;
  IF actual IS DISTINCT FROM '6c8c27eaa8d4866ba63b764ca964f91e' THEN
    RAISE EXCEPTION 'YUTABASE REVISION 5: revision-4 trigger surface drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_row
    JOIN pg_catalog.pg_namespace n
      ON n.oid = constraint_row.connamespace
    LEFT JOIN pg_catalog.pg_trigger trigger_row
      ON trigger_row.tgconstraint = constraint_row.oid
    WHERE n.nspname = 'yu'
      AND constraint_row.contype = 'f'
    GROUP BY
      constraint_row.oid,
      constraint_row.conrelid,
      constraint_row.confrelid
    HAVING count(trigger_row.oid) <> 4
       OR count(trigger_row.oid) FILTER (
            WHERE trigger_row.tgisinternal
              AND trigger_row.tgenabled = 'O'
              AND trigger_row.tgparentid = 0
              AND trigger_row.tgoldtable IS NULL
              AND trigger_row.tgnewtable IS NULL
              AND trigger_row.tgqual IS NULL
              AND cardinality(trigger_row.tgattr::smallint[]) = 0
          ) <> 4
       OR count(trigger_row.oid) FILTER (
            WHERE trigger_row.tgrelid = constraint_row.conrelid
          ) <> 2
       OR count(trigger_row.oid) FILTER (
            WHERE trigger_row.tgrelid = constraint_row.confrelid
          ) <> 2
  ) THEN
    RAISE EXCEPTION
      'YUTABASE REVISION 5: revision-4 foreign-key enforcement triggers drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  WITH surface AS (
    SELECT format(
      '%s|%s|%s|%s|%s|%s|%s',
      s.seqrelid::regclass,
      s.seqtypid::regtype,
      s.seqstart,
      s.seqincrement,
      s.seqmax,
      s.seqmin,
      s.seqcache
    ) AS item
    FROM pg_catalog.pg_sequence s
    JOIN pg_catalog.pg_class c ON c.oid = s.seqrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'yu'
  )
  SELECT md5(string_agg(item, E'\n' ORDER BY item)) INTO actual FROM surface;
  IF actual IS DISTINCT FROM 'beeaa76522610e98d313254a2f0fb7bf' THEN
    RAISE EXCEPTION 'YUTABASE REVISION 5: revision-4 sequence surface drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF pg_catalog.pg_get_serial_sequence(
       'yu.lexicon_versions', 'version_id'
     ) IS DISTINCT FROM 'yu.lexicon_versions_version_id_seq'
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class sequence_relation
       JOIN pg_catalog.pg_namespace sequence_namespace
         ON sequence_namespace.oid = sequence_relation.relnamespace
       JOIN pg_catalog.pg_sequence sequence_state
         ON sequence_state.seqrelid = sequence_relation.oid
       JOIN pg_catalog.pg_class owning_table
         ON owning_table.oid = 'yu.lexicon_versions'::regclass
       WHERE sequence_namespace.nspname = 'yu'
         AND sequence_relation.relname = 'lexicon_versions_version_id_seq'
         AND sequence_relation.relkind = 'S'
         AND sequence_relation.relpersistence = 'p'
         AND sequence_relation.relowner = owning_table.relowner
         AND NOT sequence_state.seqcycle
         AND sequence_state.seqcache = 1
     )
     OR (
       SELECT count(*)
       FROM pg_catalog.pg_depend dependency
       WHERE dependency.classid = 'pg_catalog.pg_class'::regclass
         AND dependency.objid =
           'yu.lexicon_versions_version_id_seq'::regclass
         AND dependency.deptype = 'i'
     ) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_depend dependency
       WHERE dependency.classid = 'pg_catalog.pg_class'::regclass
         AND dependency.objid =
           'yu.lexicon_versions_version_id_seq'::regclass
         AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
         AND dependency.refobjid = 'yu.lexicon_versions'::regclass
         AND dependency.refobjsubid = 1
         AND dependency.deptype = 'i'
     ) THEN
    RAISE EXCEPTION
      'YUTABASE REVISION 5: revision-4 sequence ownership or identity dependency drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  WITH required(signature) AS (
    VALUES
      ('yu._begin_word_insert()'),
      ('yu._begin_word_version()'),
      ('yu._capture_word_version()'),
      ('yu._card_exists(text,text,uuid)'),
      ('yu._card_lock_key(text,text,uuid)'),
      ('yu._deck_matches(text,text,text)'),
      ('yu._guard_delete()'),
      ('yu._lock_thread_context(text,text,text,uuid,text,text,uuid)'),
      ('yu._refuse_sever_log_mutation()'),
      ('yu._refuse_thread_mutation()'),
      ('yu._refuse_word_version_mutation()'),
      ('yu._registry_referenced_ids(text,text)'),
      ('yu._reserve_thread_id()'),
      ('yu._validate_registry_mapping()'),
      ('yu._validate_thread()'),
      ('yu._version_gloss()'),
      ('yu.doctor()'),
      ('yu.refresh_via()'),
      ('yu.sever(uuid,text,text,text[])'),
      ('yu.stale()')
  ),
  surface AS (
    SELECT format(
      '%s|%s|%s|%s|%s|%s',
      required.signature,
      p.prosecdef,
      p.provolatile,
      p.proparallel,
      coalesce(array_to_string(p.proconfig, ','), ''),
      md5(pg_catalog.pg_get_functiondef(p.oid))
    ) AS item
    FROM required
    LEFT JOIN pg_catalog.pg_proc p
      ON p.oid = to_regprocedure(required.signature)
  )
  SELECT md5(string_agg(item, E'\n' ORDER BY item)) INTO actual FROM surface;
  IF actual IS DISTINCT FROM '7913b32cca8876b7a93c936464acf996' THEN
    RAISE EXCEPTION 'YUTABASE REVISION 5: revision-4 function surface drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'yu'
      AND p.prokind = 'f'
  ) <> 20
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'yu'
      AND p.prokind <> 'f'
  )
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'via'
  ) THEN
    RAISE EXCEPTION 'YUTABASE REVISION 5: revision-4 routine surface drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_rewrite rewrite
    JOIN pg_catalog.pg_class relation ON relation.oid = rewrite.ev_class
    JOIN pg_catalog.pg_namespace n ON n.oid = relation.relnamespace
    WHERE n.nspname = 'yu'
      AND relation.relkind = 'r'
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_inherits inheritance
    WHERE inheritance.inhrelid IN (
      'yu.standard_meta'::regclass,
      'yu.lexicon'::regclass,
      'yu.lexicon_versions'::regclass,
      'yu.word_versions'::regclass,
      'yu.registry'::regclass,
      'yu.thread_ids'::regclass,
      'yu.threads'::regclass,
      'yu.sever_log'::regclass
    )
       OR inheritance.inhparent IN (
         'yu.standard_meta'::regclass,
         'yu.lexicon'::regclass,
         'yu.lexicon_versions'::regclass,
         'yu.word_versions'::regclass,
         'yu.registry'::regclass,
         'yu.thread_ids'::regclass,
         'yu.threads'::regclass,
         'yu.sever_log'::regclass
       )
  ) THEN
    RAISE EXCEPTION 'YUTABASE REVISION 5: revision-4 storage surface drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END $$;

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
         AND capabilities = ARRAY[
           'row-claims',
           'logical-physical-registry',
           'word-version-pinning',
           'global-thread-id-ledger',
           'endpoint-existence-on-insert',
           'concurrency-safe-to-one',
           'role-scoped-functions'
         ]::text[]
     ) THEN
    RAISE EXCEPTION
      'YUTABASE REVISION 5: exact YUTABASE/postgres/0.1.0-candidate.1 revision 4 is required'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF to_regprocedure('yu._nonblank_text(text)') IS NOT NULL
     OR to_regprocedure('yu._source_locators_valid(text[])') IS NOT NULL
     OR to_regprocedure('yu._maintain_registry_guard()') IS NOT NULL
     OR to_regprocedure('yu._guard_truncate()') IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_trigger t
       WHERE t.tgrelid = 'yu.registry'::regclass
         AND t.tgname = 'registry_guard_lifecycle'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint c
       WHERE c.conrelid IN (
         'yu.lexicon'::regclass,
         'yu.word_versions'::regclass,
         'yu.threads'::regclass,
         'yu.sever_log'::regclass
       )
         AND c.conname IN (
           'lexicon_src_locators_valid',
           'word_versions_src_locators_valid',
           'threads_src_locators_valid',
           'sever_log_src_locators_valid',
           'sever_log_thread_src_locators_valid'
         )
     ) THEN
    RAISE EXCEPTION
      'YUTABASE REVISION 5: refuse an ambiguous partial revision-5 surface'
      USING ERRCODE = 'duplicate_object';
  END IF;
END $$;

DO $$
DECLARE
  refresh_owner oid;
  view_definition text;
  word_row record;
  endpoint record;
BEGIN
  SELECT p.proowner INTO STRICT refresh_owner
  FROM pg_catalog.pg_proc p
  WHERE p.oid = 'yu.refresh_via()'::regprocedure;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'via'
  ) <> (SELECT count(*) FROM yu.lexicon)
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN yu.lexicon l ON l.word = c.relname
    WHERE n.nspname = 'via'
      AND (
        l.word IS NULL
        OR c.relkind <> 'v'
        OR c.relowner <> refresh_owner
        OR c.reloptions
          IS DISTINCT FROM ARRAY['security_invoker=true']::text[]
      )
  ) THEN
    RAISE EXCEPTION 'YUTABASE REVISION 5: revision-4 generated-view surface drifted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  FOR word_row IN SELECT word FROM yu.lexicon ORDER BY word LOOP
    IF to_regclass(format('via.%I', word_row.word)) IS NULL THEN
      RAISE EXCEPTION 'YUTABASE REVISION 5: generated view via.% is absent',
        word_row.word
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    SELECT pg_catalog.pg_get_viewdef(
      format('via.%I', word_row.word)::regclass,
      true
    ) INTO view_definition;
    IF position(
         format('WHERE t.word = %L::text;', word_row.word)
         IN view_definition
       ) = 0
       OR md5(
         regexp_replace(
           view_definition,
           E'WHERE t\\.word = ''[a-z_][a-z0-9_]*''::text;',
           'WHERE t.word = __WORD__::text;'
         )
       ) IS DISTINCT FROM 'ef5f14bca04257f825a175f23456e504' THEN
      RAISE EXCEPTION 'YUTABASE REVISION 5: generated view via.% drifted',
        word_row.word
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
  END LOOP;

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
  ) OR EXISTS (
    SELECT 1
    FROM yu.lexicon parent
    LEFT JOIN yu.word_versions child ON child.word = parent.word
    GROUP BY parent.word, parent.current_version
    HAVING count(child.word) <> parent.current_version
       OR min(child.word_version) IS DISTINCT FROM 1
       OR max(child.word_version)
            IS DISTINCT FROM parent.current_version
  ) OR EXISTS (
    SELECT 1
    FROM yu.registry mapping
    WHERE mapping.id_col = mapping.at_col
       OR mapping.id_col = mapping.by_col
       OR mapping.id_col = mapping.how_col
       OR mapping.id_col = mapping.src_col
       OR mapping.at_col = mapping.by_col
       OR mapping.at_col = mapping.how_col
       OR mapping.at_col = mapping.src_col
       OR mapping.by_col = mapping.how_col
       OR mapping.by_col = mapping.src_col
       OR mapping.how_col = mapping.src_col
  ) OR EXISTS (
    SELECT id FROM yu.threads
    UNION
    SELECT id FROM yu.sever_log
    EXCEPT
    SELECT id FROM yu.thread_ids
  ) OR EXISTS (
    SELECT 1
    FROM yu.threads active
    JOIN yu.sever_log retired USING (id)
  ) OR EXISTS (
    SELECT 1
    FROM yu.lexicon_versions child
    LEFT JOIN yu.lexicon parent ON parent.word = child.word
    WHERE parent.word IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM yu.word_versions child
    LEFT JOIN yu.lexicon parent ON parent.word = child.word
    WHERE parent.word IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM yu.threads child
    LEFT JOIN yu.lexicon parent ON parent.word = child.word
    WHERE parent.word IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM yu.threads child
    LEFT JOIN yu.word_versions parent
      ON parent.word = child.word
     AND parent.word_version = child.word_version
    WHERE parent.word IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM yu.threads child
    LEFT JOIN yu.registry parent
      ON parent.book = child.from_book
     AND parent.deck = child.from_deck
    WHERE parent.book IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM yu.threads child
    LEFT JOIN yu.registry parent
      ON parent.book = child.to_book
     AND parent.deck = child.to_deck
    WHERE parent.book IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM yu.sever_log child
    LEFT JOIN yu.word_versions parent
      ON parent.word = child.word
     AND parent.word_version = child.word_version
    WHERE parent.word IS NULL
  ) OR EXISTS (
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
  ) OR EXISTS (
    SELECT 1
    FROM yu.sever_log history
    WHERE NOT (
      (
        history.thread_at IS NULL
        AND history.thread_by IS NULL
        AND history.thread_how IS NULL
        AND history.thread_src IS NULL
      )
      OR (
        history.thread_at IS NOT NULL
        AND history.thread_by IS NOT NULL
        AND history.thread_how IS NOT NULL
        AND (
          history.thread_how NOT IN ('cached', 'computed')
          OR (
            history.thread_src IS NOT NULL
            AND cardinality(history.thread_src) > 0
          )
        )
      )
    )
  ) OR EXISTS (
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
  ) OR EXISTS (
    SELECT 1
    FROM yu.threads thread
    JOIN yu.word_versions word
      ON word.word = thread.word
     AND word.word_version = thread.word_version
    WHERE NOT yu._deck_matches(
            word.from_deck, thread.from_book, thread.from_deck
          )
       OR NOT yu._deck_matches(
            word.to_deck, thread.to_book, thread.to_deck
          )
  ) OR EXISTS (
    SELECT 1
    FROM yu.sever_log history
    JOIN yu.word_versions word
      ON word.word = history.word
     AND word.word_version = history.word_version
    WHERE history.thread_at IS NOT NULL
      AND (
        history.from_book !~ '^[a-z_][a-z0-9_]*$'
        OR history.from_deck !~ '^[a-z_][a-z0-9_]*$'
        OR history.to_book !~ '^[a-z_][a-z0-9_]*$'
        OR history.to_deck !~ '^[a-z_][a-z0-9_]*$'
        OR NOT yu._deck_matches(
             word.from_deck, history.from_book, history.from_deck
           )
        OR NOT yu._deck_matches(
             word.to_deck, history.to_book, history.to_deck
           )
      )
  ) THEN
    RAISE EXCEPTION 'YUTABASE REVISION 5: revision-4 semantic ledgers drifted'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  FOR endpoint IN
    SELECT from_book AS book, from_deck AS deck, from_id AS id
    FROM yu.threads
    UNION
    SELECT to_book, to_deck, to_id
    FROM yu.threads
  LOOP
    IF NOT yu._card_exists(endpoint.book, endpoint.deck, endpoint.id) THEN
      RAISE EXCEPTION 'YUTABASE REVISION 5: active endpoint %/%/% is absent',
        endpoint.book, endpoint.deck, endpoint.id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  reader_oid oid := to_regrole('yu_reader')::oid;
  writer_oid oid := to_regrole('yu_writer')::oid;
  lexicographer_oid oid := to_regrole('yu_lexicographer')::oid;
BEGIN
  IF reader_oid IS NULL OR writer_oid IS NULL OR lexicographer_oid IS NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles role
       WHERE role.oid IN (reader_oid, writer_oid, lexicographer_oid)
         AND (
           role.rolcanlogin
           OR role.rolsuper
           OR role.rolcreatedb
           OR role.rolcreaterole
           OR role.rolreplication
           OR role.rolbypassrls
         )
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles role
       WHERE role.oid IN (reader_oid, writer_oid, lexicographer_oid)
         AND (
           EXISTS (
             SELECT 1
             FROM pg_catalog.pg_database database_row
             WHERE database_row.datname = current_database()
               AND database_row.datdba = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_namespace namespace_row
             WHERE namespace_row.nspname IN ('yu', 'via')
               AND namespace_row.nspowner = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_class relation
             JOIN pg_catalog.pg_namespace namespace_row
               ON namespace_row.oid = relation.relnamespace
             WHERE namespace_row.nspname IN ('yu', 'via')
               AND relation.relowner = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_proc routine
             JOIN pg_catalog.pg_namespace namespace_row
               ON namespace_row.oid = routine.pronamespace
             WHERE namespace_row.nspname IN ('yu', 'via')
               AND routine.proowner = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_type type_row
             JOIN pg_catalog.pg_namespace namespace_row
               ON namespace_row.oid = type_row.typnamespace
             WHERE namespace_row.nspname IN ('yu', 'via')
               AND type_row.typowner = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_extension extension_row
             WHERE extension_row.extowner = role.oid
           )
         )
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_auth_members membership
       WHERE membership.member = writer_oid
         AND membership.roleid = reader_oid
         AND membership.inherit_option
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_auth_members membership
       WHERE membership.member = lexicographer_oid
         AND membership.roleid = reader_oid
         AND membership.inherit_option
     )
     OR NOT pg_catalog.has_schema_privilege('yu_reader', 'yu', 'USAGE')
     OR NOT pg_catalog.has_schema_privilege('yu_reader', 'via', 'USAGE')
     OR NOT pg_catalog.has_table_privilege('yu_writer', 'yu.threads', 'INSERT')
     OR NOT pg_catalog.has_table_privilege(
       'yu_lexicographer', 'yu.lexicon', 'INSERT,UPDATE'
     )
     OR NOT pg_catalog.has_table_privilege(
       'yu_lexicographer', 'yu.registry', 'INSERT,UPDATE,DELETE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'yu_reader', 'yu._card_exists(text,text,uuid)', 'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'yu_reader', 'yu.stale()', 'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'yu_reader', 'yu.doctor()', 'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'yu_writer',
       'yu._lock_thread_context(text,text,text,uuid,text,text,uuid)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'yu_writer', 'yu.sever(uuid,text,text,text[])', 'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'yu_lexicographer',
       'yu._registry_referenced_ids(text,text)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'yu_lexicographer', 'yu.refresh_via()', 'EXECUTE'
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname IN ('yu', 'via')
         AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND NOT pg_catalog.has_table_privilege(
           'yu_reader', c.oid, 'SELECT'
         )
     ) THEN
    RAISE EXCEPTION 'YUTABASE REVISION 5: revision-4 required ACL surface drifted'
      USING ERRCODE = 'invalid_grant_operation';
  END IF;

  IF EXISTS (
    WITH protected_relations AS (
      SELECT
        relation.oid,
        relation.relowner,
        relation.relkind,
        namespace_row.nspname,
        relation.relname,
        relation.relacl
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace_row
        ON namespace_row.oid = relation.relnamespace
      WHERE namespace_row.nspname IN ('yu', 'via')
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    ),
    expected AS (
      SELECT
        'schema'::text AS object_class,
        namespace_row.oid AS object_oid,
        0::integer AS sub_id,
        reader_oid AS grantee,
        'USAGE'::text AS privilege_type,
        false AS is_grantable
      FROM pg_catalog.pg_namespace namespace_row
      WHERE namespace_row.nspname IN ('yu', 'via')

      UNION ALL

      SELECT
        'relation',
        relation.oid,
        0,
        reader_oid,
        'SELECT',
        false
      FROM protected_relations relation
      WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')

      UNION ALL

      SELECT
        'relation',
        relation.oid,
        0,
        required.grantee,
        required.privilege_type,
        false
      FROM (VALUES
        ('yu', 'threads', writer_oid, 'INSERT'::text),
        ('yu', 'lexicon', lexicographer_oid, 'INSERT'::text),
        ('yu', 'lexicon', lexicographer_oid, 'UPDATE'::text),
        ('yu', 'registry', lexicographer_oid, 'INSERT'::text),
        ('yu', 'registry', lexicographer_oid, 'UPDATE'::text),
        ('yu', 'registry', lexicographer_oid, 'DELETE'::text)
      ) AS required(
        schema_name,
        relation_name,
        grantee,
        privilege_type
      )
      JOIN protected_relations relation
        ON relation.nspname = required.schema_name
       AND relation.relname = required.relation_name

      UNION ALL

      SELECT
        'function',
        required.signature::regprocedure::oid,
        0,
        required.grantee,
        'EXECUTE',
        false
      FROM (VALUES
        ('yu._card_exists(text,text,uuid)', reader_oid),
        ('yu.stale()', reader_oid),
        ('yu.doctor()', reader_oid),
        (
          'yu._lock_thread_context(text,text,text,uuid,text,text,uuid)',
          writer_oid
        ),
        ('yu.sever(uuid,text,text,text[])', writer_oid),
        (
          'yu._registry_referenced_ids(text,text)',
          lexicographer_oid
        ),
        ('yu.refresh_via()', lexicographer_oid)
      ) AS required(signature, grantee)
    ),
    actual AS (
      SELECT
        'schema'::text AS object_class,
        namespace_row.oid AS object_oid,
        0::integer AS sub_id,
        acl.grantee,
        acl.privilege_type,
        acl.is_grantable
      FROM pg_catalog.pg_namespace namespace_row
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(
          namespace_row.nspacl,
          pg_catalog.acldefault('n', namespace_row.nspowner)
        )
      ) acl
      WHERE namespace_row.nspname IN ('yu', 'via')
        AND acl.grantee <> namespace_row.nspowner

      UNION ALL

      SELECT
        'relation',
        relation.oid,
        0,
        acl.grantee,
        acl.privilege_type,
        acl.is_grantable
      FROM protected_relations relation
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(
          relation.relacl,
          pg_catalog.acldefault(
            CASE
              WHEN relation.relkind = 'S' THEN 'S'::"char"
              ELSE 'r'::"char"
            END,
            relation.relowner
          )
        )
      ) acl
      WHERE acl.grantee <> relation.relowner

      UNION ALL

      SELECT
        'column',
        relation.oid,
        attribute.attnum::integer,
        acl.grantee,
        acl.privilege_type,
        acl.is_grantable
      FROM protected_relations relation
      JOIN pg_catalog.pg_attribute attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
      WHERE acl.grantee <> relation.relowner

      UNION ALL

      SELECT
        'function',
        routine.oid,
        0,
        acl.grantee,
        acl.privilege_type,
        acl.is_grantable
      FROM pg_catalog.pg_proc routine
      JOIN pg_catalog.pg_namespace namespace_row
        ON namespace_row.oid = routine.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(
          routine.proacl,
          pg_catalog.acldefault('f', routine.proowner)
        )
      ) acl
      WHERE namespace_row.nspname IN ('yu', 'via')
        AND acl.grantee <> routine.proowner
    )
    SELECT 1
    FROM (
      (
        SELECT * FROM actual
        EXCEPT ALL
        SELECT * FROM expected
      )
      UNION ALL
      (
        SELECT * FROM expected
        EXCEPT ALL
        SELECT * FROM actual
      )
    ) difference
  ) THEN
    RAISE EXCEPTION 'YUTABASE REVISION 5: revision-4 direct ACL surface drifted'
      USING
        ERRCODE = 'invalid_grant_operation',
        HINT = 'Review \ddp, \dp yu.*, \dp via.*, and \df+ yu.*; revoke every non-release non-owner direct grant, then retry revision 5.';
  END IF;
END $$;

-- The portable nonblank class is deliberately narrow and locale-independent:
-- TAB (U+0009), LF, VT, FF, CR (U+000A..U+000D), and SPACE (U+0020). PostgreSQL
-- text cannot contain NUL. The SDK applies the same six-code-point definition
-- before asking PostgreSQL to enforce it.
CREATE FUNCTION yu._nonblank_text(candidate text)
RETURNS boolean AS $$
  SELECT candidate IS NOT NULL
     AND pg_catalog.btrim(candidate, E' \t\n\013\f\r') <> ''
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, pg_temp;

-- NULL means that no sources were claimed. A present array may be empty for
-- claim kinds that do not require sources, but a present, non-empty array must
-- be a conventional one-dimensional, one-based array and every locator it
-- contains must satisfy the shared portable nonblank predicate. PostgreSQL
-- represents an empty array with NULL dimensional metadata, so coalesce that
-- representation to the one accepted empty-list shape.
CREATE FUNCTION yu._source_locators_valid(source_locators text[])
RETURNS boolean AS $$
  SELECT source_locators IS NULL
      OR (
        coalesce(pg_catalog.array_ndims(source_locators), 1) = 1
        AND coalesce(pg_catalog.array_lower(source_locators, 1), 1) = 1
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.unnest(source_locators) AS entry(locator)
          WHERE yu._nonblank_text(locator) IS NOT TRUE
        )
      )
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, pg_temp;

ALTER TABLE yu.lexicon
  DROP CONSTRAINT lexicon_gloss_nonempty,
  DROP CONSTRAINT lexicon_inverse_nonempty,
  DROP CONSTRAINT lexicon_claimant_nonempty,
  ADD CONSTRAINT lexicon_gloss_nonempty
    CHECK (yu._nonblank_text(gloss)),
  ADD CONSTRAINT lexicon_inverse_nonempty
    CHECK (yu._nonblank_text(inverse)),
  ADD CONSTRAINT lexicon_claimant_nonempty
    CHECK (yu._nonblank_text(by));

ALTER TABLE yu.lexicon_versions
  ADD CONSTRAINT lexicon_versions_gloss_nonempty
    CHECK (yu._nonblank_text(gloss)),
  ADD CONSTRAINT lexicon_versions_inverse_nonempty
    CHECK (yu._nonblank_text(inverse)),
  ADD CONSTRAINT lexicon_versions_claimant_nonempty
    CHECK (yu._nonblank_text(changed_by));

ALTER TABLE yu.word_versions
  DROP CONSTRAINT word_versions_gloss_check,
  DROP CONSTRAINT word_versions_inverse_check,
  DROP CONSTRAINT word_versions_by_check,
  ADD CONSTRAINT word_versions_gloss_check
    CHECK (yu._nonblank_text(gloss)),
  ADD CONSTRAINT word_versions_inverse_check
    CHECK (yu._nonblank_text(inverse)),
  ADD CONSTRAINT word_versions_by_check
    CHECK (yu._nonblank_text(by));

ALTER TABLE yu.registry
  DROP CONSTRAINT registry_claimant_nonempty,
  ADD CONSTRAINT registry_claimant_nonempty
    CHECK (yu._nonblank_text(by));

ALTER TABLE yu.threads
  DROP CONSTRAINT threads_claimant_nonempty,
  ADD CONSTRAINT threads_claimant_nonempty
    CHECK (yu._nonblank_text(by));

ALTER TABLE yu.sever_log
  DROP CONSTRAINT sever_log_claimant_nonempty,
  DROP CONSTRAINT sever_log_thread_claimant_nonempty,
  ADD CONSTRAINT sever_log_claimant_nonempty
    CHECK (yu._nonblank_text(by)),
  ADD CONSTRAINT sever_log_thread_claimant_nonempty
    CHECK (thread_by IS NULL OR yu._nonblank_text(thread_by));

ALTER TABLE yu.lexicon
  ADD CONSTRAINT lexicon_src_locators_valid
    CHECK (yu._source_locators_valid(src));

ALTER TABLE yu.word_versions
  ADD CONSTRAINT word_versions_src_locators_valid
    CHECK (yu._source_locators_valid(src));

ALTER TABLE yu.threads
  ADD CONSTRAINT threads_src_locators_valid
    CHECK (yu._source_locators_valid(src));

ALTER TABLE yu.sever_log
  ADD CONSTRAINT sever_log_src_locators_valid
    CHECK (yu._source_locators_valid(src)),
  ADD CONSTRAINT sever_log_thread_src_locators_valid
    CHECK (yu._source_locators_valid(thread_src));

ALTER TABLE yu.registry
  ADD CONSTRAINT registry_mapped_columns_distinct
    CHECK (
      id_col <> at_col
      AND id_col <> by_col
      AND id_col <> how_col
      AND id_col <> src_col
      AND at_col <> by_col
      AND at_col <> how_col
      AND at_col <> src_col
      AND by_col <> how_col
      AND by_col <> src_col
      AND how_col <> src_col
    );

-- Reader, appender, and writer roles intentionally lack UPDATE on the registry,
-- so they cannot issue SELECT ... FOR SHARE directly. This narrow owner-rights
-- helper returns only one already-readable mapping while holding its row lock
-- until the caller's transaction ends.
CREATE FUNCTION yu._lock_registry_mapping(
  logical_book text,
  logical_deck text
)
RETURNS TABLE (
  physical_schema text,
  physical_table text,
  id_col text,
  at_col text,
  by_col text,
  how_col text,
  src_col text
) AS $$
  SELECT
    mapping.physical_schema,
    mapping.physical_table,
    mapping.id_col,
    mapping.at_col,
    mapping.by_col,
    mapping.how_col,
    mapping.src_col
  FROM yu.registry mapping
  WHERE mapping.book = logical_book
    AND mapping.deck = logical_deck
  FOR SHARE
$$ LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, yu, pg_temp
SET row_security = off;

-- Narrowing a word to to_one scans existing threads after serializing on the
-- lexicon row. A transaction-start snapshot would remain stale after that
-- wait, so the narrowing side of the protocol also requires READ COMMITTED.
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
  IF NEW.to_one AND NOT OLD.to_one
     AND current_setting('transaction_isolation')
           IS DISTINCT FROM 'read committed' THEN
    RAISE EXCEPTION
      'TO_ONE TRANSITION: READ COMMITTED isolation is required for lock-coherent thread checks'
      USING ERRCODE = 'feature_not_supported';
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

-- Runtime advisory/table-lock protocols require statement-fresh snapshots.
-- PostgreSQL does not refresh a REPEATABLE READ snapshot after a waited lock,
-- so reject stronger runtime isolation before validating a new endpoint.
CREATE OR REPLACE FUNCTION yu._validate_thread()
RETURNS trigger AS $$
DECLARE
  context record;
  endpoint_exists boolean;
BEGIN
  IF current_setting('transaction_isolation')
       IS DISTINCT FROM 'read committed' THEN
    RAISE EXCEPTION
      'THREAD VALIDATION: READ COMMITTED isolation is required for lock-coherent endpoint checks'
      USING ERRCODE = 'feature_not_supported';
  END IF;

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

  -- These reads intentionally run with the inserting caller's privileges.
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

-- CREATE VIEW honors the refresh owner's table default privileges. A hostile
-- or simply over-broad ALTER DEFAULT PRIVILEGES must not turn a newly coined
-- correspondence word into an authority side channel. Normalize every
-- non-owner relation and column ACL, rebuild the one released reader grant,
-- and fail closed if a grant from another grantor survives revocation.
CREATE OR REPLACE FUNCTION yu.refresh_via()
RETURNS void AS $$
DECLARE
  w record;
  acl_row record;
  view_oid oid;
BEGIN
  -- Retired words remain queryable because existing threads retain meaning.
  FOR w IN SELECT word FROM yu.lexicon LOOP
    EXECUTE pg_catalog.format(
      'CREATE OR REPLACE VIEW %I.%I WITH (security_invoker = true) AS
         SELECT
           (t.from_book || ''/'' || t.from_deck || ''/'' || t.from_id::text) AS from_ref,
           (t.to_book   || ''/'' || t.to_deck   || ''/'' || t.to_id::text) AS to_ref,
           t.note, t.at, t.by, t.how, t.src, t.id AS thread_id,
           t.word_version, v.gloss, v.inverse
         FROM yu.threads t
         JOIN yu.word_versions v
           ON v.word = t.word AND v.word_version = t.word_version
         WHERE t.word = %L',
      'via', w.word, w.word
    );
    EXECUTE pg_catalog.format(
      'ALTER VIEW %I.%I OWNER TO %I',
      'via', w.word, current_user
    );

    SELECT relation.oid INTO STRICT view_oid
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.oid = relation.relnamespace
    WHERE namespace_row.nspname = 'via'
      AND relation.relname = w.word;

    FOR acl_row IN
      SELECT DISTINCT acl.grantee
      FROM pg_catalog.pg_class relation
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(
          relation.relacl,
          pg_catalog.acldefault('r', relation.relowner)
        )
      ) acl
      WHERE relation.oid = view_oid
        AND acl.grantee <> relation.relowner
    LOOP
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %s CASCADE',
        'via',
        w.word,
        CASE
          WHEN acl_row.grantee = 0 THEN 'PUBLIC'
          ELSE pg_catalog.quote_ident(
            pg_catalog.pg_get_userbyid(acl_row.grantee)
          )
        END
      );
    END LOOP;

    FOR acl_row IN
      SELECT DISTINCT attribute.attname, acl.grantee
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_attribute attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
      WHERE relation.oid = view_oid
        AND acl.grantee <> relation.relowner
    LOOP
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES (%I) ON TABLE %I.%I FROM %s CASCADE',
        acl_row.attname,
        'via',
        w.word,
        CASE
          WHEN acl_row.grantee = 0 THEN 'PUBLIC'
          ELSE pg_catalog.quote_ident(
            pg_catalog.pg_get_userbyid(acl_row.grantee)
          )
        END
      );
    END LOOP;

    EXECUTE pg_catalog.format(
      'GRANT SELECT ON TABLE %I.%I TO %I',
      'via', w.word, 'yu_reader'
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace_row
        ON namespace_row.oid = relation.relnamespace
      WHERE relation.oid = view_oid
        AND namespace_row.nspname = 'via'
        AND relation.relname = w.word
        AND relation.relkind = 'v'
        AND relation.relpersistence = 'p'
        AND relation.relowner = pg_catalog.to_regrole(current_user)::oid
        AND relation.reloptions
          IS NOT DISTINCT FROM ARRAY['security_invoker=true']::text[]
    ) THEN
      RAISE EXCEPTION
        'VIA REFRESH: generated view via.% has an unexpected owner or structure',
        w.word
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF EXISTS (
      WITH expected AS (
        SELECT
          'relation'::text AS object_class,
          relation.oid AS object_oid,
          0::integer AS sub_id,
          relation.relowner AS grantor,
          pg_catalog.to_regrole('yu_reader')::oid AS grantee,
          'SELECT'::text AS privilege_type,
          false AS is_grantable
        FROM pg_catalog.pg_class relation
        WHERE relation.oid = view_oid
      ),
      actual AS (
        SELECT
          'relation'::text AS object_class,
          relation.oid AS object_oid,
          0::integer AS sub_id,
          acl.grantor,
          acl.grantee,
          acl.privilege_type,
          acl.is_grantable
        FROM pg_catalog.pg_class relation
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          coalesce(
            relation.relacl,
            pg_catalog.acldefault('r', relation.relowner)
          )
        ) acl
        WHERE relation.oid = view_oid
          AND acl.grantee <> relation.relowner

        UNION ALL

        SELECT
          'column',
          relation.oid,
          attribute.attnum::integer,
          acl.grantor,
          acl.grantee,
          acl.privilege_type,
          acl.is_grantable
        FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_attribute attribute
          ON attribute.attrelid = relation.oid
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
        WHERE relation.oid = view_oid
          AND acl.grantee <> relation.relowner
      ),
      difference AS (
        (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
        UNION ALL
        (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
      )
      SELECT 1 FROM difference
    ) THEN
      RAISE EXCEPTION
        'VIA REFRESH: generated view via.% direct ACL surface is not exact',
        w.word
        USING ERRCODE = 'invalid_grant_operation';
    END IF;
  END LOOP;

  FOR w IN
    SELECT viewname
    FROM pg_catalog.pg_views
    WHERE schemaname = 'via'
      AND viewname NOT IN (SELECT word FROM yu.lexicon)
  LOOP
    EXECUTE pg_catalog.format(
      'DROP VIEW IF EXISTS %I.%I',
      'via', w.viewname
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, yu, pg_temp
SET row_security = off;

-- Card identity is part of a logical ref. The canonical AFTER-row guard sees
-- the final UUID after every BEFORE trigger and generated-column computation,
-- then rolls the statement back if the old identity is still referenced.
-- Registry row locks are deliberately absent: the registry lifecycle takes a
-- conflicting physical-table lock before changing a mapping, avoiding the
-- registry-row/physical-table lock inversion.
CREATE OR REPLACE FUNCTION yu._guard_delete()
RETURNS trigger AS $$
DECLARE
  r yu.registry%ROWTYPE;
  card_id uuid;
  next_card_id uuid;
  thread_count bigint;
BEGIN
  IF TG_OP NOT IN ('DELETE', 'UPDATE') THEN
    RAISE EXCEPTION 'CARD GUARD: unsupported trigger operation %', TG_OP
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  SELECT * INTO r
  FROM yu.registry
  WHERE physical_schema = TG_TABLE_SCHEMA
    AND physical_table = TG_TABLE_NAME;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CARD GUARD: physical table %.% has no registry mapping',
      TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  card_id := NULLIF(to_jsonb(OLD) ->> r.id_col, '')::uuid;
  IF card_id IS NULL THEN
    RAISE EXCEPTION 'CARD GUARD: old %.%.% did not yield a UUID identity',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, r.id_col
      USING ERRCODE = 'datatype_mismatch';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    next_card_id := NULLIF(to_jsonb(NEW) ->> r.id_col, '')::uuid;
    IF next_card_id IS NULL THEN
      RAISE EXCEPTION 'CARD GUARD: new %.%.% did not yield a UUID identity',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, r.id_col
        USING ERRCODE = 'datatype_mismatch';
    END IF;
    IF next_card_id = card_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF current_setting('transaction_isolation')
       IS DISTINCT FROM 'read committed' THEN
    RAISE EXCEPTION
      'CARD GUARD: READ COMMITTED isolation is required for lock-coherent reference checks'
      USING ERRCODE = 'feature_not_supported';
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
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION
        'LIVE THREADS: %/%/% has % thread(s); sever before changing mapped identity',
        r.book, r.deck, card_id, thread_count
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RAISE EXCEPTION 'LIVE THREADS: %/%/% has % thread(s); sever before deleting',
      r.book, r.deck, card_id, thread_count
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, yu, pg_temp
SET row_security = off;

-- TRUNCATE bypasses row triggers. The AFTER statement guard observes all
-- application BEFORE-trigger work; raising here still rolls the truncate and
-- that work back. PostgreSQL holds ACCESS EXCLUSIVE throughout, serializing it
-- with endpoint checks and registry lifecycle DDL.
CREATE FUNCTION yu._guard_truncate()
RETURNS trigger AS $$
DECLARE
  r yu.registry%ROWTYPE;
  thread_count bigint;
BEGIN
  IF current_setting('transaction_isolation')
       IS DISTINCT FROM 'read committed' THEN
    RAISE EXCEPTION
      'TRUNCATE GUARD: READ COMMITTED isolation is required for lock-coherent reference checks'
      USING ERRCODE = 'feature_not_supported';
  END IF;

  IF TG_OP <> 'TRUNCATE' THEN
    RAISE EXCEPTION 'TRUNCATE GUARD: unsupported trigger operation %', TG_OP
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  SELECT * INTO r
  FROM yu.registry
  WHERE physical_schema = TG_TABLE_SCHEMA
    AND physical_table = TG_TABLE_NAME
  FOR UPDATE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRUNCATE GUARD: physical table %.% has no registry mapping',
      TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  SELECT count(*) INTO thread_count
  FROM yu.threads t
  WHERE (
      t.from_book = r.book
      AND t.from_deck = r.deck
    ) OR (
      t.to_book = r.book
      AND t.to_deck = r.deck
    );

  IF thread_count > 0 THEN
    RAISE EXCEPTION
      'LIVE THREADS: %/% has % thread(s); sever before truncating',
      r.book, r.deck, thread_count
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, yu, pg_temp
SET row_security = off;

-- Maintain the canonical row and statement guards as the registry changes. This
-- is SECURITY INVOKER by design: registry mutation does not confer authority
-- to install or remove triggers on somebody else's table.
CREATE FUNCTION yu._maintain_registry_guard()
RETURNS trigger AS $$
DECLARE
  lock_schemas text[];
  lock_tables text[];
  target record;
  relation_oid oid;
  relation_owner oid;
  id_attnum smallint;
  guard_exists boolean;
  guard_desired boolean;
  guard_legacy boolean;
  mapping_changed boolean := false;
BEGIN
  IF current_setting('transaction_isolation')
       IS DISTINCT FROM 'read committed' THEN
    RAISE EXCEPTION
      'REGISTRY GUARD: READ COMMITTED isolation is required for lock-coherent lifecycle checks'
      USING ERRCODE = 'feature_not_supported';
  END IF;

  IF TG_OP = 'INSERT' THEN
    lock_schemas := ARRAY[NEW.physical_schema];
    lock_tables := ARRAY[NEW.physical_table];
  ELSIF TG_OP = 'DELETE' THEN
    lock_schemas := ARRAY[OLD.physical_schema];
    lock_tables := ARRAY[OLD.physical_table];
  ELSIF TG_OP = 'UPDATE' THEN
    lock_schemas := ARRAY[OLD.physical_schema, NEW.physical_schema];
    lock_tables := ARRAY[OLD.physical_table, NEW.physical_table];
    mapping_changed :=
      ROW(
        NEW.book,
        NEW.deck,
        NEW.physical_schema,
        NEW.physical_table,
        NEW.id_col
      )
      IS DISTINCT FROM
      ROW(
        OLD.book,
        OLD.deck,
        OLD.physical_schema,
        OLD.physical_table,
        OLD.id_col
      );
  ELSE
    RAISE EXCEPTION 'REGISTRY GUARD: unsupported trigger operation %', TG_OP
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- Every participant derives the same table order from exact stored names.
  -- SHARE ROW EXCLUSIVE conflicts with card writes and concurrent lifecycle
  -- DDL, while still permitting ordinary reads.
  FOR target IN
    SELECT DISTINCT candidate.physical_schema, candidate.physical_table
    FROM (
      SELECT
        lock_schemas[position] AS physical_schema,
        lock_tables[position] AS physical_table
      FROM pg_catalog.generate_subscripts(lock_schemas, 1)
        AS positions(position)
    ) AS candidate
    ORDER BY candidate.physical_schema, candidate.physical_table
  LOOP
    SELECT c.oid, c.relowner
    INTO relation_oid, relation_owner
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = target.physical_schema
      AND c.relname = target.physical_table;

    IF relation_oid IS NULL THEN
      RAISE EXCEPTION 'REGISTRY GUARD: physical table %.% does not exist',
        target.physical_schema, target.physical_table
        USING ERRCODE = 'undefined_table';
    END IF;
    IF NOT pg_catalog.pg_has_role(current_user, relation_owner, 'USAGE') THEN
      RAISE EXCEPTION
        'REGISTRY GUARD: % must own physical table %.% or inherit its owner role',
        current_user, target.physical_schema, target.physical_table
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    EXECUTE format(
      'LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE',
      target.physical_schema,
      target.physical_table
    );
  END LOOP;

  -- Deleting a mapping or moving its physical identity while refs are active
  -- would make the old logical endpoints unguarded. Same-value UPDATEs remain
  -- useful as an explicit reconciliation operation.
  IF TG_OP = 'DELETE' OR mapping_changed THEN
    PERFORM 1
    FROM yu._registry_referenced_ids(OLD.book, OLD.deck)
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION
        'REGISTRY GUARD: active refs prevent deleting or remapping %/%',
        OLD.book, OLD.deck
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  -- Remove the old canonical trigger only when its complete definition is one
  -- this binding owns: either revision 5 or the released DELETE-only legacy
  -- form. A same-name trigger with any other meaning is never overwritten.
  IF TG_OP = 'DELETE' OR mapping_changed THEN
    SELECT c.oid, a.attnum
    INTO relation_oid, id_attnum
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = c.oid
     AND a.attname = OLD.id_col
     AND a.attnum > 0
     AND NOT a.attisdropped
    WHERE n.nspname = OLD.physical_schema
      AND c.relname = OLD.physical_table;

    guard_exists := false;
    guard_desired := false;
    guard_legacy := false;
    SELECT
      true,
      t.tgfoid = 'yu._guard_delete()'::regprocedure
        AND t.tgtype = 25
        AND t.tgenabled = 'O'
        AND NOT t.tgisinternal
        AND t.tgconstraint = 0
        AND t.tgparentid = 0
        AND t.tgnargs = 0
        AND t.tgqual IS NULL
        AND t.tgoldtable IS NULL
        AND t.tgnewtable IS NULL
        AND cardinality(t.tgattr::smallint[]) = 0,
      t.tgfoid = 'yu._guard_delete()'::regprocedure
        AND t.tgtype = 11
        AND t.tgenabled = 'O'
        AND NOT t.tgisinternal
        AND t.tgconstraint = 0
        AND t.tgparentid = 0
        AND t.tgnargs = 0
        AND t.tgqual IS NULL
        AND t.tgoldtable IS NULL
        AND t.tgnewtable IS NULL
        AND cardinality(t.tgattr::smallint[]) = 0
    INTO guard_exists, guard_desired, guard_legacy
    FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = relation_oid
      AND t.tgname = 'yutabase_guard_delete';
    IF NOT FOUND THEN
      guard_exists := false;
      guard_desired := false;
      guard_legacy := false;
    END IF;

    IF guard_exists AND NOT guard_desired AND NOT guard_legacy THEN
      RAISE EXCEPTION
        'REGISTRY GUARD: conflicting trigger yutabase_guard_delete exists on %.%',
        OLD.physical_schema, OLD.physical_table
        USING ERRCODE = 'duplicate_object';
    END IF;
    IF guard_exists THEN
      EXECUTE format(
        'DROP TRIGGER %I ON %I.%I',
        'yutabase_guard_delete',
        OLD.physical_schema,
        OLD.physical_table
      );
    END IF;

    guard_exists := false;
    guard_desired := false;
    SELECT
      true,
      t.tgfoid = 'yu._guard_truncate()'::regprocedure
        AND t.tgtype = 32
        AND t.tgenabled = 'O'
        AND NOT t.tgisinternal
        AND t.tgconstraint = 0
        AND t.tgparentid = 0
        AND t.tgnargs = 0
        AND t.tgqual IS NULL
        AND t.tgoldtable IS NULL
        AND t.tgnewtable IS NULL
        AND cardinality(t.tgattr::smallint[]) = 0
    INTO guard_exists, guard_desired
    FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = relation_oid
      AND t.tgname = 'yutabase_guard_truncate';
    IF NOT FOUND THEN
      guard_exists := false;
      guard_desired := false;
    END IF;

    IF guard_exists AND NOT guard_desired THEN
      RAISE EXCEPTION
        'REGISTRY GUARD: conflicting trigger yutabase_guard_truncate exists on %.%',
        OLD.physical_schema, OLD.physical_table
        USING ERRCODE = 'duplicate_object';
    END IF;
    IF guard_exists THEN
      EXECUTE format(
        'DROP TRIGGER %I ON %I.%I',
        'yutabase_guard_truncate',
        OLD.physical_schema,
        OLD.physical_table
      );
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT c.oid, a.attnum
    INTO relation_oid, id_attnum
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = c.oid
     AND a.attname = NEW.id_col
     AND a.attnum > 0
     AND NOT a.attisdropped
    WHERE n.nspname = NEW.physical_schema
      AND c.relname = NEW.physical_table;

    IF relation_oid IS NULL OR id_attnum IS NULL THEN
      RAISE EXCEPTION 'REGISTRY GUARD: %.%.% does not exist',
        NEW.physical_schema, NEW.physical_table, NEW.id_col
        USING ERRCODE = 'undefined_column';
    END IF;

    guard_exists := false;
    guard_desired := false;
    guard_legacy := false;
    SELECT
      true,
      t.tgfoid = 'yu._guard_delete()'::regprocedure
        AND t.tgtype = 25
        AND t.tgenabled = 'O'
        AND NOT t.tgisinternal
        AND t.tgconstraint = 0
        AND t.tgparentid = 0
        AND t.tgnargs = 0
        AND t.tgqual IS NULL
        AND t.tgoldtable IS NULL
        AND t.tgnewtable IS NULL
        AND cardinality(t.tgattr::smallint[]) = 0,
      t.tgfoid = 'yu._guard_delete()'::regprocedure
        AND t.tgtype = 11
        AND t.tgenabled = 'O'
        AND NOT t.tgisinternal
        AND t.tgconstraint = 0
        AND t.tgparentid = 0
        AND t.tgnargs = 0
        AND t.tgqual IS NULL
        AND t.tgoldtable IS NULL
        AND t.tgnewtable IS NULL
        AND cardinality(t.tgattr::smallint[]) = 0
    INTO guard_exists, guard_desired, guard_legacy
    FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = relation_oid
      AND t.tgname = 'yutabase_guard_delete';
    IF NOT FOUND THEN
      guard_exists := false;
      guard_desired := false;
      guard_legacy := false;
    END IF;

    IF guard_exists AND NOT guard_desired AND NOT guard_legacy THEN
      RAISE EXCEPTION
        'REGISTRY GUARD: conflicting trigger yutabase_guard_delete exists on %.%',
        NEW.physical_schema, NEW.physical_table
        USING ERRCODE = 'duplicate_object';
    END IF;
    IF guard_legacy THEN
      EXECUTE format(
        'DROP TRIGGER %I ON %I.%I',
        'yutabase_guard_delete',
        NEW.physical_schema,
        NEW.physical_table
      );
      guard_exists := false;
      guard_desired := false;
    END IF;

    IF NOT guard_desired THEN
      EXECUTE format(
        'CREATE TRIGGER %I AFTER DELETE OR UPDATE ON %I.%I '
        'FOR EACH ROW EXECUTE FUNCTION yu._guard_delete()',
        'yutabase_guard_delete',
        NEW.physical_schema,
        NEW.physical_table
      );
    END IF;

    guard_exists := false;
    guard_desired := false;
    SELECT
      true,
      t.tgfoid = 'yu._guard_truncate()'::regprocedure
        AND t.tgtype = 32
        AND t.tgenabled = 'O'
        AND NOT t.tgisinternal
        AND t.tgconstraint = 0
        AND t.tgparentid = 0
        AND t.tgnargs = 0
        AND t.tgqual IS NULL
        AND t.tgoldtable IS NULL
        AND t.tgnewtable IS NULL
        AND cardinality(t.tgattr::smallint[]) = 0
    INTO guard_exists, guard_desired
    FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = relation_oid
      AND t.tgname = 'yutabase_guard_truncate';
    IF NOT FOUND THEN
      guard_exists := false;
      guard_desired := false;
    END IF;

    IF guard_exists AND NOT guard_desired THEN
      RAISE EXCEPTION
        'REGISTRY GUARD: conflicting trigger yutabase_guard_truncate exists on %.%',
        NEW.physical_schema, NEW.physical_table
        USING ERRCODE = 'duplicate_object';
    END IF;
    IF NOT guard_desired THEN
      EXECUTE format(
        'CREATE TRIGGER %I AFTER TRUNCATE ON %I.%I '
        'FOR EACH STATEMENT EXECUTE FUNCTION yu._guard_truncate()',
        'yutabase_guard_truncate',
        NEW.physical_schema,
        NEW.physical_table
      );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, yu, pg_temp;

CREATE TRIGGER registry_guard_lifecycle
  BEFORE INSERT OR DELETE OR UPDATE OF
    book, deck, physical_schema, physical_table, id_col
  ON yu.registry
  FOR EACH ROW EXECUTE FUNCTION yu._maintain_registry_guard();

-- As revision 4 did, normalize every candidate function and generated view to
-- the operator performing this supported upgrade. Cross-owner upgrades require
-- ownership-equivalent or superuser authority.
ALTER FUNCTION yu._begin_word_insert() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._begin_word_version() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._capture_word_version() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._card_exists(text, text, uuid) OWNER TO CURRENT_USER;
ALTER FUNCTION yu._card_lock_key(text, text, uuid) OWNER TO CURRENT_USER;
ALTER FUNCTION yu._deck_matches(text, text, text) OWNER TO CURRENT_USER;
ALTER FUNCTION yu._guard_delete() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._guard_truncate() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._lock_registry_mapping(text, text) OWNER TO CURRENT_USER;
ALTER FUNCTION yu._lock_thread_context(
  text, text, text, uuid, text, text, uuid
) OWNER TO CURRENT_USER;
ALTER FUNCTION yu._maintain_registry_guard() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._nonblank_text(text) OWNER TO CURRENT_USER;
ALTER FUNCTION yu._refuse_sever_log_mutation() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._refuse_thread_mutation() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._refuse_word_version_mutation() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._registry_referenced_ids(text, text) OWNER TO CURRENT_USER;
ALTER FUNCTION yu._reserve_thread_id() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._source_locators_valid(text[]) OWNER TO CURRENT_USER;
ALTER FUNCTION yu._validate_registry_mapping() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._validate_thread() OWNER TO CURRENT_USER;
ALTER FUNCTION yu._version_gloss() OWNER TO CURRENT_USER;
ALTER FUNCTION yu.doctor() OWNER TO CURRENT_USER;
ALTER FUNCTION yu.refresh_via() OWNER TO CURRENT_USER;
ALTER FUNCTION yu.sever(uuid, text, text, text[]) OWNER TO CURRENT_USER;
ALTER FUNCTION yu.stale() OWNER TO CURRENT_USER;

DO $$
DECLARE
  generated_view record;
BEGIN
  FOR generated_view IN SELECT word FROM yu.lexicon ORDER BY word LOOP
    EXECUTE format(
      'ALTER VIEW %I.%I OWNER TO %I',
      'via',
      generated_view.word,
      current_user
    );
  END LOOP;
END $$;

-- Revision 5 adds a deliberately narrow thread-append capability without
-- rebasing the cluster-wide revision-4 writer hierarchy. Keeping the existing
-- writer -> reader membership and direct writer grants lets revision-4 and
-- revision-5 databases coexist in one PostgreSQL cluster.
DO $$
BEGIN
  CREATE ROLE yu_appender
    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
    INHERIT NOREPLICATION NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A same-named cluster role may predate this database. Refuse it before
-- granting anything unless all four standard roles are safe and the existing
-- internal subgraph has exactly the revision-4 edges plus, at most, the one
-- canonical appender -> reader edge created by another revision-5 database.
DO $$
DECLARE
  reader_oid oid := to_regrole('yu_reader')::oid;
  appender_oid oid := to_regrole('yu_appender')::oid;
  writer_oid oid := to_regrole('yu_writer')::oid;
  lexicographer_oid oid := to_regrole('yu_lexicographer')::oid;
BEGIN
  IF reader_oid IS NULL
     OR appender_oid IS NULL
     OR writer_oid IS NULL
     OR lexicographer_oid IS NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles role
       WHERE role.oid IN (
         reader_oid, appender_oid, writer_oid, lexicographer_oid
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
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles role
       WHERE role.oid IN (
         reader_oid, appender_oid, writer_oid, lexicographer_oid
       )
         AND (
           EXISTS (
             SELECT 1
             FROM pg_catalog.pg_database database_row
             WHERE database_row.datname = current_database()
               AND database_row.datdba = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_namespace namespace_row
             WHERE namespace_row.nspname IN ('yu', 'via')
               AND namespace_row.nspowner = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_class relation
             JOIN pg_catalog.pg_namespace namespace_row
               ON namespace_row.oid = relation.relnamespace
             WHERE namespace_row.nspname IN ('yu', 'via')
               AND relation.relowner = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_proc routine
             JOIN pg_catalog.pg_namespace namespace_row
               ON namespace_row.oid = routine.pronamespace
             WHERE namespace_row.nspname IN ('yu', 'via')
               AND routine.proowner = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_type type_row
             JOIN pg_catalog.pg_namespace namespace_row
               ON namespace_row.oid = type_row.typnamespace
             WHERE namespace_row.nspname IN ('yu', 'via')
               AND type_row.typowner = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_extension extension_row
             WHERE extension_row.extowner = role.oid
           )
         )
     )
     OR (
       SELECT count(*)
       FROM pg_catalog.pg_auth_members membership
       WHERE membership.roleid = reader_oid
         AND membership.member = writer_oid
     ) < 1
     OR (
       SELECT count(*)
       FROM pg_catalog.pg_auth_members membership
       WHERE membership.roleid = reader_oid
         AND membership.member = lexicographer_oid
     ) < 1
     OR EXISTS (
       WITH capability_roles(oid) AS (
         VALUES
           (reader_oid),
           (appender_oid),
           (writer_oid),
           (lexicographer_oid)
       )
       SELECT 1
       FROM pg_catalog.pg_auth_members membership
       JOIN capability_roles parent
         ON parent.oid = membership.roleid
       JOIN capability_roles child
         ON child.oid = membership.member
       WHERE membership.admin_option
          OR NOT membership.inherit_option
          OR NOT membership.set_option
          OR (membership.roleid, membership.member) NOT IN (
            (reader_oid, appender_oid),
            (reader_oid, writer_oid),
            (reader_oid, lexicographer_oid)
          )
     ) THEN
    RAISE EXCEPTION
      'YUTABASE REVISION 5: reused appender or capability hierarchy is unsafe'
      USING ERRCODE = 'invalid_grant_operation';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members membership
    WHERE membership.roleid = to_regrole('yu_reader')
      AND membership.member = to_regrole('yu_appender')
      AND NOT membership.admin_option
      AND membership.inherit_option
      AND membership.set_option
  ) THEN
    EXECUTE
      'GRANT yu_reader TO yu_appender WITH INHERIT TRUE';
  END IF;
END $$;

-- CREATE FUNCTION honors the migration role's default privileges. Normalize
-- every non-owner ACL on the revision-5 function set before rebuilding the
-- released direct surface; this includes arbitrary roles named by ALTER
-- DEFAULT PRIVILEGES, not only the standard roles and PUBLIC.
DO $$
DECLARE
  acl_row record;
BEGIN
  FOR acl_row IN
    SELECT DISTINCT
      format(
        '%I.%I(%s)',
        namespace_row.nspname,
        routine.proname,
        pg_catalog.pg_get_function_identity_arguments(routine.oid)
      ) AS signature,
      acl.grantee
    FROM pg_catalog.pg_proc routine
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.oid = routine.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(
        routine.proacl,
        pg_catalog.acldefault('f', routine.proowner)
      )
    ) acl
    WHERE routine.oid = ANY (ARRAY[
      'yu._source_locators_valid(text[])'::regprocedure::oid,
      'yu._nonblank_text(text)'::regprocedure::oid,
      'yu._maintain_registry_guard()'::regprocedure::oid,
      'yu._guard_delete()'::regprocedure::oid,
      'yu._guard_truncate()'::regprocedure::oid,
      'yu._lock_registry_mapping(text,text)'::regprocedure::oid
    ])
      AND acl.grantee <> routine.proowner
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s CASCADE',
      acl_row.signature,
      CASE
        WHEN acl_row.grantee = 0 THEN 'PUBLIC'
        ELSE quote_ident(pg_catalog.pg_get_userbyid(acl_row.grantee))
      END
    );
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION yu._source_locators_valid(text[])
  FROM PUBLIC, yu_reader, yu_appender, yu_writer, yu_lexicographer;
REVOKE ALL ON FUNCTION yu._nonblank_text(text)
  FROM PUBLIC, yu_reader, yu_appender, yu_writer, yu_lexicographer;
REVOKE ALL ON FUNCTION yu._maintain_registry_guard()
  FROM PUBLIC, yu_reader, yu_appender, yu_writer, yu_lexicographer;
REVOKE ALL ON FUNCTION yu._guard_delete()
  FROM PUBLIC, yu_reader, yu_appender, yu_writer, yu_lexicographer;
REVOKE ALL ON FUNCTION yu._guard_truncate()
  FROM PUBLIC, yu_reader, yu_appender, yu_writer, yu_lexicographer;
REVOKE ALL ON FUNCTION yu._lock_registry_mapping(text, text)
  FROM PUBLIC, yu_reader, yu_appender, yu_writer, yu_lexicographer;

-- A physical owner using inherited lexicographer privileges needs EXECUTE to
-- install the trigger functions. The immutable locator predicate is a public
-- constraint API: retained core owners and application-table writers must be
-- able to evaluate CHECK constraints without joining a capability role.
GRANT EXECUTE ON FUNCTION yu._guard_delete(), yu._guard_truncate()
  TO yu_lexicographer;
GRANT EXECUTE ON FUNCTION yu._lock_registry_mapping(text, text)
  TO yu_reader;
GRANT INSERT ON yu.threads TO yu_appender;
GRANT EXECUTE ON FUNCTION yu._lock_thread_context(
  text, text, text, uuid, text, text, uuid
) TO yu_appender;
GRANT EXECUTE ON FUNCTION
  yu._nonblank_text(text),
  yu._source_locators_valid(text[])
TO PUBLIC;

-- Fire lifecycle and the existing validator in trigger-name order for every
-- released mapping. This installs missing canonical guards and upgrades the
-- exact legacy DELETE-only canonical form transactionally.
UPDATE yu.registry
SET physical_schema = physical_schema,
    physical_table = physical_table,
    id_col = id_col;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM yu.registry r
    JOIN pg_catalog.pg_namespace n
      ON n.nspname = r.physical_schema
    JOIN pg_catalog.pg_class c
      ON c.relnamespace = n.oid
     AND c.relname = r.physical_table
    LEFT JOIN pg_catalog.pg_trigger t
      ON t.tgrelid = c.oid
     AND t.tgname = 'yutabase_guard_delete'
    WHERE t.oid IS NULL
       OR t.tgfoid <> 'yu._guard_delete()'::regprocedure
       OR t.tgtype <> 25
       OR t.tgenabled <> 'O'
       OR t.tgisinternal
       OR t.tgconstraint <> 0
       OR t.tgparentid <> 0
       OR t.tgnargs <> 0
       OR t.tgqual IS NOT NULL
       OR t.tgoldtable IS NOT NULL
       OR t.tgnewtable IS NOT NULL
       OR cardinality(t.tgattr::smallint[]) <> 0
  ) OR EXISTS (
    SELECT 1
    FROM yu.registry r
    JOIN pg_catalog.pg_namespace n
      ON n.nspname = r.physical_schema
    JOIN pg_catalog.pg_class c
      ON c.relnamespace = n.oid
     AND c.relname = r.physical_table
    LEFT JOIN pg_catalog.pg_trigger t
      ON t.tgrelid = c.oid
     AND t.tgname = 'yutabase_guard_truncate'
    WHERE t.oid IS NULL
       OR t.tgfoid <> 'yu._guard_truncate()'::regprocedure
       OR t.tgtype <> 32
       OR t.tgenabled <> 'O'
       OR t.tgisinternal
       OR t.tgconstraint <> 0
       OR t.tgparentid <> 0
       OR t.tgnargs <> 0
       OR t.tgqual IS NOT NULL
       OR t.tgoldtable IS NOT NULL
       OR t.tgnewtable IS NOT NULL
       OR cardinality(t.tgattr::smallint[]) <> 0
  ) THEN
    RAISE EXCEPTION
      'YUTABASE REVISION 5: canonical mapped-card guard reconciliation is incomplete'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END $$;

-- The first endpoint scan established that the released revision-4 data was
-- coherent. Reconciliation above now holds SHARE ROW EXCLUSIVE on every mapped
-- physical table until commit, so repeat the scan inside that closed world.
-- Without this second scan, an unguarded revision-4 DELETE, UUID UPDATE, or
-- TRUNCATE could land after preflight but before its canonical guards existed.
DO $$
DECLARE
  endpoint record;
BEGIN
  FOR endpoint IN
    SELECT from_book AS book, from_deck AS deck, from_id AS id
    FROM yu.threads
    UNION
    SELECT to_book, to_deck, to_id
    FROM yu.threads
  LOOP
    IF NOT yu._card_exists(endpoint.book, endpoint.deck, endpoint.id) THEN
      RAISE EXCEPTION 'YUTABASE REVISION 5: active endpoint %/%/% is absent after guard reconciliation',
        endpoint.book, endpoint.deck, endpoint.id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END LOOP;
END $$;

-- Reading a sequence relation does not consume or advance it. Refuse a
-- revision-4 identity state whose next generated value would collide with
-- retained history or fall beyond the non-cycling sequence maximum. The exact
-- sequence fingerprint above fixes increment=1; numeric arithmetic avoids
-- bigint overflow at the configured maximum. An uncalled sequence positioned
-- exactly at seqmax still has one valid generated value and remains accepted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM yu.lexicon_versions_version_id_seq sequence_state
    JOIN pg_catalog.pg_sequence sequence_definition
      ON sequence_definition.seqrelid =
         'yu.lexicon_versions_version_id_seq'::regclass
    CROSS JOIN LATERAL (
      SELECT coalesce(max(history.version_id)::numeric, 0) AS max_version_id
      FROM yu.lexicon_versions history
    ) retained
    WHERE (
      (
        sequence_state.last_value::numeric
        + CASE WHEN sequence_state.is_called THEN 1 ELSE 0 END
      ) <= retained.max_version_id
      OR (
        sequence_state.last_value::numeric
        + CASE WHEN sequence_state.is_called THEN 1 ELSE 0 END
      ) > sequence_definition.seqmax::numeric
    )
  ) THEN
    RAISE EXCEPTION
      'YUTABASE REVISION 5: lexicon version identity has no safe next value'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
END $$;

-- Close the standard-role subgraph exactly. Memberships with non-standard
-- application/operator roles remain cluster policy and are deliberately not
-- rewritten here; operators must review those separately.
DO $$
DECLARE
  reader_oid oid := to_regrole('yu_reader')::oid;
  appender_oid oid := to_regrole('yu_appender')::oid;
  writer_oid oid := to_regrole('yu_writer')::oid;
  lexicographer_oid oid := to_regrole('yu_lexicographer')::oid;
BEGIN
  IF reader_oid IS NULL
     OR appender_oid IS NULL
     OR writer_oid IS NULL
     OR lexicographer_oid IS NULL
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles role
       WHERE role.oid IN (
         reader_oid, appender_oid, writer_oid, lexicographer_oid
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
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_roles role
       WHERE role.oid IN (
         reader_oid, appender_oid, writer_oid, lexicographer_oid
       )
         AND (
           EXISTS (
             SELECT 1
             FROM pg_catalog.pg_database database_row
             WHERE database_row.datname = current_database()
               AND database_row.datdba = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_namespace namespace_row
             WHERE namespace_row.nspname IN ('yu', 'via')
               AND namespace_row.nspowner = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_class relation
             JOIN pg_catalog.pg_namespace namespace_row
               ON namespace_row.oid = relation.relnamespace
             WHERE namespace_row.nspname IN ('yu', 'via')
               AND relation.relowner = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_proc routine
             JOIN pg_catalog.pg_namespace namespace_row
               ON namespace_row.oid = routine.pronamespace
             WHERE namespace_row.nspname IN ('yu', 'via')
               AND routine.proowner = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_type type_row
             JOIN pg_catalog.pg_namespace namespace_row
               ON namespace_row.oid = type_row.typnamespace
             WHERE namespace_row.nspname IN ('yu', 'via')
               AND type_row.typowner = role.oid
           )
           OR EXISTS (
             SELECT 1
             FROM pg_catalog.pg_extension extension_row
             WHERE extension_row.extowner = role.oid
           )
         )
     )
     OR EXISTS (
       WITH capability_roles(oid) AS (
         VALUES
           (reader_oid),
           (appender_oid),
           (writer_oid),
           (lexicographer_oid)
       ),
       expected(roleid, member) AS (
         VALUES
           (reader_oid, appender_oid),
           (reader_oid, writer_oid),
           (reader_oid, lexicographer_oid)
       ),
       actual AS (
         SELECT DISTINCT membership.roleid, membership.member
         FROM pg_catalog.pg_auth_members membership
         JOIN capability_roles parent
           ON parent.oid = membership.roleid
         JOIN capability_roles child
           ON child.oid = membership.member
       ),
       bad_options AS (
         SELECT 1
         FROM pg_catalog.pg_auth_members membership
         JOIN capability_roles parent
           ON parent.oid = membership.roleid
         JOIN capability_roles child
           ON child.oid = membership.member
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
      'YUTABASE REVISION 5: capability role hierarchy or ownership is not exact'
      USING ERRCODE = 'invalid_grant_operation';
  END IF;
END $$;

-- Re-read the entire non-owner schema/relation/column/routine ACL multiset at
-- the final grant boundary. This proves default privileges on newly created
-- functions were normalized and refuses any unaccounted direct authority
-- before the revision-5 identity is stamped.
DO $$
DECLARE
  reader_oid oid := to_regrole('yu_reader')::oid;
  appender_oid oid := to_regrole('yu_appender')::oid;
  writer_oid oid := to_regrole('yu_writer')::oid;
  lexicographer_oid oid := to_regrole('yu_lexicographer')::oid;
BEGIN
  IF EXISTS (
    WITH protected_relations AS (
      SELECT
        relation.oid,
        relation.relowner,
        relation.relkind,
        namespace_row.nspname,
        relation.relname,
        relation.relacl
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace_row
        ON namespace_row.oid = relation.relnamespace
      WHERE namespace_row.nspname IN ('yu', 'via')
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    ),
    expected AS (
      SELECT
        'schema'::text AS object_class,
        namespace_row.oid AS object_oid,
        0::integer AS sub_id,
        reader_oid AS grantee,
        'USAGE'::text AS privilege_type,
        false AS is_grantable
      FROM pg_catalog.pg_namespace namespace_row
      WHERE namespace_row.nspname IN ('yu', 'via')

      UNION ALL

      SELECT
        'relation',
        relation.oid,
        0,
        reader_oid,
        'SELECT',
        false
      FROM protected_relations relation
      WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'f')

      UNION ALL

      SELECT
        'relation',
        relation.oid,
        0,
        required.grantee,
        required.privilege_type,
        false
      FROM (VALUES
        ('yu', 'threads', writer_oid, 'INSERT'::text),
        ('yu', 'threads', appender_oid, 'INSERT'::text),
        ('yu', 'lexicon', lexicographer_oid, 'INSERT'::text),
        ('yu', 'lexicon', lexicographer_oid, 'UPDATE'::text),
        ('yu', 'registry', lexicographer_oid, 'INSERT'::text),
        ('yu', 'registry', lexicographer_oid, 'UPDATE'::text),
        ('yu', 'registry', lexicographer_oid, 'DELETE'::text)
      ) AS required(
        schema_name,
        relation_name,
        grantee,
        privilege_type
      )
      JOIN protected_relations relation
        ON relation.nspname = required.schema_name
       AND relation.relname = required.relation_name

      UNION ALL

      SELECT
        'function',
        required.signature::regprocedure::oid,
        0,
        required.grantee,
        'EXECUTE',
        false
      FROM (VALUES
        ('yu._card_exists(text,text,uuid)', reader_oid),
        ('yu.stale()', reader_oid),
        ('yu.doctor()', reader_oid),
        (
          'yu._lock_thread_context(text,text,text,uuid,text,text,uuid)',
          writer_oid
        ),
        (
          'yu._lock_thread_context(text,text,text,uuid,text,text,uuid)',
          appender_oid
        ),
        ('yu.sever(uuid,text,text,text[])', writer_oid),
        (
          'yu._registry_referenced_ids(text,text)',
          lexicographer_oid
        ),
        ('yu.refresh_via()', lexicographer_oid),
        ('yu._lock_registry_mapping(text,text)', reader_oid),
        ('yu._guard_delete()', lexicographer_oid),
        ('yu._guard_truncate()', lexicographer_oid),
        ('yu._nonblank_text(text)', 0::oid),
        ('yu._source_locators_valid(text[])', 0::oid)
      ) AS required(signature, grantee)
    ),
    actual AS (
      SELECT
        'schema'::text AS object_class,
        namespace_row.oid AS object_oid,
        0::integer AS sub_id,
        acl.grantee,
        acl.privilege_type,
        acl.is_grantable
      FROM pg_catalog.pg_namespace namespace_row
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(
          namespace_row.nspacl,
          pg_catalog.acldefault('n', namespace_row.nspowner)
        )
      ) acl
      WHERE namespace_row.nspname IN ('yu', 'via')
        AND acl.grantee <> namespace_row.nspowner

      UNION ALL

      SELECT
        'relation',
        relation.oid,
        0,
        acl.grantee,
        acl.privilege_type,
        acl.is_grantable
      FROM protected_relations relation
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(
          relation.relacl,
          pg_catalog.acldefault(
            CASE
              WHEN relation.relkind = 'S' THEN 'S'::"char"
              ELSE 'r'::"char"
            END,
            relation.relowner
          )
        )
      ) acl
      WHERE acl.grantee <> relation.relowner

      UNION ALL

      SELECT
        'column',
        relation.oid,
        attribute.attnum::integer,
        acl.grantee,
        acl.privilege_type,
        acl.is_grantable
      FROM protected_relations relation
      JOIN pg_catalog.pg_attribute attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
      WHERE acl.grantee <> relation.relowner

      UNION ALL

      SELECT
        'function',
        routine.oid,
        0,
        acl.grantee,
        acl.privilege_type,
        acl.is_grantable
      FROM pg_catalog.pg_proc routine
      JOIN pg_catalog.pg_namespace namespace_row
        ON namespace_row.oid = routine.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(
          routine.proacl,
          pg_catalog.acldefault('f', routine.proowner)
        )
      ) acl
      WHERE namespace_row.nspname IN ('yu', 'via')
        AND acl.grantee <> routine.proowner
    ),
    difference AS (
      (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
      UNION ALL
      (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
    )
    SELECT 1 FROM difference
  ) THEN
    RAISE EXCEPTION
      'YUTABASE REVISION 5: final direct ACL surface is not exact'
      USING ERRCODE = 'invalid_grant_operation';
  END IF;
END $$;

-- Identity changes only after every constraint, function, privilege, lifecycle
-- trigger, existing mapping, and physical guard has succeeded.
DO $$
DECLARE
  changed integer;
BEGIN
  UPDATE yu.standard_meta
  SET revision = 5,
      capabilities = ARRAY[
        'row-claims',
        'logical-physical-registry',
        'word-version-pinning',
        'global-thread-id-ledger',
        'endpoint-existence-on-insert',
        'concurrency-safe-to-one',
        'role-scoped-functions',
        'guarded-card-identity',
        'nonblank-source-locators'
      ]::text[],
      upgraded_at = clock_timestamp()
  WHERE singleton
    AND standard = 'YUTABASE'
    AND profile = 'postgres'
    AND version = '0.1.0-candidate.1'
    AND revision = 4
    AND capabilities = ARRAY[
      'row-claims',
      'logical-physical-registry',
      'word-version-pinning',
      'global-thread-id-ledger',
      'endpoint-existence-on-insert',
      'concurrency-safe-to-one',
      'role-scoped-functions'
    ]::text[];

  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN
    RAISE EXCEPTION
      'YUTABASE REVISION 5: revision-4 identity changed before the final stamp'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END $$;
