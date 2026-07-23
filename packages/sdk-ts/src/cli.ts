#!/usr/bin/env node
// cli.ts — the yuta CLI
//
// Doctrine: SPEC.md §7-8
// Commands: init, repl, hello, card, cards, query, thread, sever,
//           explain, doctor, check, words, decks

import { Yuta } from "./index.js";
import { explain } from "./youspeak.js";
import { parseCliArgs, redactConnectionUrl } from "./cli-args.js";
import { validateColumnType } from "./ddl.js";
import {
  hasCandidateDynamicSurfaces,
  hasExactCandidateConstraintSurface,
  hasExactCandidateFunctionSurface,
  hasExactCoreColumnSurface,
  hasExactCoreIndexSurface,
  hasLegacyConstraintSurface,
} from "./catalog.js";
import {
  CANDIDATE_REVISION,
  CANDIDATE_VERSION,
  CANDIDATE_COLUMNS,
  hasAnyColumn,
  planInstall,
  type ColumnShape,
  type InstallProbe,
} from "./install.js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import postgres from "postgres";

// --- helpers ---

function findSqlDir(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(thisDir, "sql"),
    join(thisDir, "..", "..", "..", "sql"),
    join(thisDir, "..", "..", "sql"),
    join(thisDir, "..", "sql"),
    join(process.cwd(), "sql"),
    join(process.cwd(), "..", "sql"),
    join(process.cwd(), "packages", "sdk-ts", "..", "..", "sql"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "0001_yu_core.sql"))) return c;
  }
  throw new Error("CANNOT FIND SQL MIGRATIONS");
}

function getKeychainUrl(): string {
  try {
    const url = execFileSync(
      "security",
      ["find-generic-password", "-s", "yutabase-url", "-w"],
      { encoding: "utf-8" },
    ).trim();
    if (!url) throw new Error("empty");
    return url;
  } catch {
    console.error("No --conn provided and no yutabase-url in keychain.");
    console.error("Set it: security add-generic-password -s yutabase-url -w 'postgresql://...'");
    process.exit(1);
  }
}

// --- yuta init ---

async function doInit(conn: string | undefined): Promise<void> {
  const url = conn ?? getKeychainUrl();
  const sql = postgres(url, { max: 1 });
  const dir = findSqlDir();

  console.log(`yuta init — installing YUTABASE ${CANDIDATE_VERSION}`);
  console.log("  target: " + redactConnectionUrl(url));
  console.log("");

  try {
    const before = await inspectInstall(sql);
    const plan = planInstall(before);
    if (plan.mode === "current") {
      console.log(`  already current: ${CANDIDATE_VERSION} revision ${CANDIDATE_REVISION}`);
      return;
    }

    const migrationSources = plan.migrations.map((filename) => {
      const path = join(dir, filename);
      if (!existsSync(path)) throw new Error(`MISSING MIGRATION: ${filename} not found at ${path}`);
      return { filename, content: readFileSync(path, "utf-8") };
    });

    console.log(`  mode: ${plan.mode}`);
    const phases = plan.mode === "fresh"
      ? [migrationSources.slice(0, 2), migrationSources.slice(2)]
      : [migrationSources];
    for (const phase of phases) {
      await sql.begin(async (tx) => {
        for (const migration of phase) {
          console.log(`  applying ${migration.filename}...`);
          await tx.unsafe(migration.content);
        }
      });
    }

    const after = planInstall(await inspectInstall(sql));
    if (after.mode !== "current") {
      throw new Error("INSTALL VERIFICATION: candidate identity was not materialized");
    }

    console.log("");
    console.log(`  YUTABASE ${CANDIDATE_VERSION} installed with transactional migrations.`);
    console.log("  The vocabulary lives with the data.");
    console.log("");
    console.log("  Next:");
    console.log("    yuta hello   — inspect database identity and capabilities");
    console.log("    yuta repl    — start speaking core YOUSPEAK");
    console.log("");
  } finally {
    await sql.end();
  }
}

type Database = ReturnType<typeof postgres>;

async function inspectInstall(sql: Database): Promise<InstallProbe> {
  const [objects, columns, hasExactLegacyConstraints] = await Promise.all([
    sql`
      SELECT
        to_regnamespace('yu') IS NOT NULL AS has_yu_schema,
        to_regnamespace('via') IS NOT NULL AS has_via_schema,
        to_regclass('yu.lexicon') IS NOT NULL AS has_lexicon,
        to_regclass('yu.lexicon_versions') IS NOT NULL AS has_lexicon_versions,
        to_regclass('yu.registry') IS NOT NULL AS has_registry,
        to_regclass('yu.threads') IS NOT NULL AS has_threads,
        to_regclass('yu.sever_log') IS NOT NULL AS has_sever_log,
        to_regclass('yu.standard_meta') IS NOT NULL AS has_standard_meta,
        (
          EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_trgm')
          AND NOT EXISTS (
            SELECT 1
            FROM (VALUES
              ('lexicon'),
              ('lexicon_versions'),
              ('registry'),
              ('threads'),
              ('sever_log')
            ) AS required(relation_name)
            LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = 'yu'
            LEFT JOIN pg_catalog.pg_class c
              ON c.relnamespace = n.oid AND c.relname = required.relation_name
            WHERE c.oid IS NULL
               OR c.relkind <> 'r'
               OR c.relpersistence <> 'p'
               OR EXISTS (
                 SELECT 1 FROM pg_catalog.pg_inherits i
                 WHERE i.inhrelid = c.oid OR i.inhparent = c.oid
               )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'via'
              AND (c.relkind <> 'v' OR c.relpersistence <> 'p')
          )
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'yu' AND table_name = 'lexicon_versions'
              AND column_name = 'version_id'
              AND is_identity = 'YES' AND identity_generation = 'ALWAYS'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM (VALUES
              ('yu.lexicon',          true,  ARRAY['word']::text[]),
              ('yu.lexicon_versions', true,  ARRAY['version_id']::text[]),
              ('yu.registry',         true,  ARRAY['book', 'deck']::text[]),
              ('yu.threads',          true,  ARRAY['id']::text[]),
              ('yu.threads',          false, ARRAY[
                'word', 'from_book', 'from_deck', 'from_id',
                'to_book', 'to_deck', 'to_id'
              ]::text[]),
              ('yu.sever_log',        true,  ARRAY['id']::text[])
            ) AS expected(relation_name, primary_only, key_columns)
            WHERE NOT EXISTS (
              SELECT 1
              FROM pg_catalog.pg_index i
              WHERE i.indrelid = to_regclass(expected.relation_name)
                AND i.indisunique
                AND i.indisvalid
                AND i.indisready
                AND i.indpred IS NULL
                AND i.indexprs IS NULL
                AND (NOT expected.primary_only OR i.indisprimary)
                AND i.indnkeyatts = cardinality(expected.key_columns)
                AND ARRAY(
                  SELECT a.attname::text
                  FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum, position)
                  JOIN pg_catalog.pg_attribute a
                    ON a.attrelid = i.indrelid AND a.attnum = k.attnum
                  WHERE k.position <= i.indnkeyatts
                  ORDER BY k.position
                ) = expected.key_columns
            )
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint
            WHERE conrelid = to_regclass('yu.lexicon')
              AND conname = 'lexicon_status_check' AND contype = 'c' AND convalidated
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint
            WHERE conrelid = to_regclass('yu.lexicon')
              AND conname = 'lexicon_how_check' AND contype = 'c' AND convalidated
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint
            WHERE conrelid = to_regclass('yu.threads')
              AND conname = 'threads_how_check' AND contype = 'c' AND convalidated
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint
            WHERE conrelid = to_regclass('yu.sever_log')
              AND conname = 'sever_log_how_check' AND contype = 'c' AND convalidated
          )
          AND (
            to_regclass('yu.standard_meta') IS NOT NULL
            OR (
              (
                SELECT count(*)
                FROM pg_catalog.pg_trigger t
                WHERE NOT t.tgisinternal
                  AND t.tgrelid IN (
                    to_regclass('yu.lexicon'),
                    to_regclass('yu.lexicon_versions'),
                    to_regclass('yu.registry'),
                    to_regclass('yu.threads'),
                    to_regclass('yu.sever_log')
                  )
              ) = 3
              AND NOT EXISTS (
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
              )
              AND NOT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_rewrite r
                WHERE r.ev_class IN (
                  to_regclass('yu.lexicon'),
                  to_regclass('yu.lexicon_versions'),
                  to_regclass('yu.registry'),
                  to_regclass('yu.threads'),
                  to_regclass('yu.sever_log')
                )
              )
            )
          )
        ) AS has_legacy_integrity,
        (
          to_regclass('yu.word_versions') IS NOT NULL
          OR to_regclass('yu.thread_ids') IS NOT NULL
          OR to_regprocedure('yu._card_exists(text,text,uuid)') IS NOT NULL
          OR to_regprocedure('yu._card_lock_key(text,text,uuid)') IS NOT NULL
          OR to_regprocedure('yu._registry_referenced_ids(text,text)') IS NOT NULL
          OR to_regprocedure('yu._reserve_thread_id()') IS NOT NULL
          OR to_regprocedure('yu._lock_thread_context(text,text,text,uuid,text,text,uuid)') IS NOT NULL
          OR to_regprocedure('yu._validate_registry_mapping()') IS NOT NULL
          OR to_regprocedure('yu._begin_word_version()') IS NOT NULL
          OR to_regprocedure('yu._capture_word_version()') IS NOT NULL
          OR to_regprocedure('yu._begin_word_insert()') IS NOT NULL
          OR to_regprocedure('yu._refuse_word_version_mutation()') IS NOT NULL
          OR to_regprocedure('yu._refuse_thread_mutation()') IS NOT NULL
          OR to_regprocedure('yu._refuse_sever_log_mutation()') IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint
            WHERE conname IN (
              'lexicon_status_candidate', 'lexicon_how_candidate',
              'threads_how_candidate', 'sever_log_how_candidate'
            ) AND connamespace = to_regnamespace('yu')
          )
          OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_trigger
            WHERE NOT tgisinternal AND tgname IN (
              'registry_validate_physical_mapping',
              'lexicon_begin_semantic_version',
              'lexicon_begin_insert_version',
              'lexicon_capture_insert_version',
              'lexicon_capture_update_version',
              'word_versions_immutable',
              'threads_immutable',
              'sever_log_immutable'
            )
              AND tgrelid IN (
                to_regclass('yu.registry'), to_regclass('yu.lexicon'),
                to_regclass('yu.word_versions'), to_regclass('yu.threads'),
                to_regclass('yu.sever_log')
              )
          )
        ) AS has_candidate_footprint_objects,
        (
          to_regclass('yu.thread_ids') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM (VALUES
              ('standard_meta'),
              ('lexicon'),
              ('lexicon_versions'),
              ('word_versions'),
              ('registry'),
              ('threads'),
              ('thread_ids'),
              ('sever_log')
            ) AS required(relation_name)
            LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = 'yu'
            LEFT JOIN pg_catalog.pg_class c
              ON c.relnamespace = n.oid AND c.relname = required.relation_name
            WHERE c.oid IS NULL
               OR c.relkind <> 'r'
               OR c.relpersistence <> 'p'
               OR EXISTS (
                 SELECT 1 FROM pg_catalog.pg_inherits i
                 WHERE i.inhrelid = c.oid OR i.inhparent = c.oid
               )
          )
          AND to_regprocedure('yu._card_exists(text,text,uuid)') IS NOT NULL
          AND to_regprocedure('yu._card_lock_key(text,text,uuid)') IS NOT NULL
          AND to_regprocedure('yu._deck_matches(text,text,text)') IS NOT NULL
          AND to_regprocedure('yu._registry_referenced_ids(text,text)') IS NOT NULL
          AND to_regprocedure('yu._reserve_thread_id()') IS NOT NULL
          AND to_regprocedure('yu._lock_thread_context(text,text,text,uuid,text,text,uuid)') IS NOT NULL
          AND to_regprocedure('yu._validate_registry_mapping()') IS NOT NULL
          AND to_regprocedure('yu._validate_thread()') IS NOT NULL
          AND to_regprocedure('yu._begin_word_version()') IS NOT NULL
          AND to_regprocedure('yu._capture_word_version()') IS NOT NULL
          AND to_regprocedure('yu._guard_delete()') IS NOT NULL
          AND to_regprocedure('yu.sever(uuid,text,text,text[])') IS NOT NULL
          AND to_regprocedure('yu.refresh_via()') IS NOT NULL
          AND to_regprocedure('yu.stale()') IS NOT NULL
          AND to_regprocedure('yu.doctor()') IS NOT NULL
          AND to_regrole('yu_reader') IS NOT NULL
          AND to_regrole('yu_writer') IS NOT NULL
          AND to_regrole('yu_lexicographer') IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.pg_auth_members membership
            WHERE membership.member = to_regrole('yu_writer')
              AND membership.roleid = to_regrole('yu_reader')
              AND membership.inherit_option
          )
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.pg_auth_members membership
            WHERE membership.member = to_regrole('yu_lexicographer')
              AND membership.roleid = to_regrole('yu_reader')
              AND membership.inherit_option
          )
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_roles r
            WHERE r.rolname IN ('yu_reader', 'yu_writer', 'yu_lexicographer')
              AND (
                r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole
                OR r.rolreplication OR r.rolbypassrls
              )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM (VALUES
              ('yu._registry_referenced_ids(text,text)', true, true),
              ('yu._begin_word_version()', true, true),
              ('yu._capture_word_version()', true, true),
              ('yu._reserve_thread_id()', true, true),
              ('yu._lock_thread_context(text,text,text,uuid,text,text,uuid)', true, true),
              ('yu._version_gloss()', true, true),
              ('yu.sever(uuid,text,text,text[])', true, true),
              ('yu._guard_delete()', true, true),
              ('yu.refresh_via()', true, true),
              ('yu._validate_registry_mapping()', false, false),
              ('yu._validate_thread()', false, false),
              ('yu._card_exists(text,text,uuid)', false, false)
            ) AS required(signature, security_definer, rls_off)
            LEFT JOIN pg_catalog.pg_proc p
              ON p.oid = to_regprocedure(required.signature)
            WHERE p.oid IS NULL
               OR p.prosecdef IS DISTINCT FROM required.security_definer
               OR p.proowner <> (
                 SELECT owner.proowner
                 FROM pg_catalog.pg_proc owner
                 WHERE owner.oid = to_regprocedure('yu.refresh_via()')
               )
               OR NOT coalesce(p.proconfig, '{}'::text[])
                      @> ARRAY['search_path=pg_catalog, yu, pg_temp']
               OR (
                 required.rls_off
                 AND NOT coalesce(p.proconfig, '{}'::text[])
                         @> ARRAY['row_security=off']
               )
               OR (
                 NOT required.rls_off
                 AND coalesce(p.proconfig, '{}'::text[])
                       @> ARRAY['row_security=off']
               )
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint
            WHERE conrelid = to_regclass('yu.lexicon')
              AND conname = 'lexicon_status_candidate' AND contype = 'c' AND convalidated
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint
            WHERE conrelid = to_regclass('yu.lexicon')
              AND conname = 'lexicon_how_candidate' AND contype = 'c' AND convalidated
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint
            WHERE conrelid = to_regclass('yu.threads')
              AND conname = 'threads_how_candidate' AND contype = 'c' AND convalidated
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint
            WHERE conrelid = to_regclass('yu.sever_log')
              AND conname = 'sever_log_how_candidate' AND contype = 'c' AND convalidated
          )
          AND EXISTS (
            SELECT 1
            FROM pg_catalog.pg_index i
            JOIN pg_catalog.pg_attribute a
              ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
            WHERE i.indrelid = to_regclass('yu.thread_ids')
              AND i.indisprimary AND i.indisvalid AND i.indisready
              AND i.indnkeyatts = 1 AND a.attname = 'id'
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_index i
            WHERE i.indexrelid = to_regclass('yu.threads_to_one_active')
              AND i.indrelid = to_regclass('yu.threads')
              AND i.indisunique AND i.indisvalid AND i.indisready
              AND i.indexprs IS NULL
              AND i.indnkeyatts = 4
              AND ARRAY(
                SELECT a.attname::text
                FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum, position)
                JOIN pg_catalog.pg_attribute a
                  ON a.attrelid = i.indrelid AND a.attnum = k.attnum
                WHERE k.position <= i.indnkeyatts
                ORDER BY k.position
              ) = ARRAY['word', 'from_book', 'from_deck', 'from_id']
              AND pg_get_expr(i.indpred, i.indrelid) = 'word_to_one'
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_trigger
            WHERE tgrelid = to_regclass('yu.registry')
              AND tgname = 'registry_validate_physical_mapping' AND NOT tgisinternal
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_trigger
            WHERE tgrelid = to_regclass('yu.lexicon')
              AND tgname = 'lexicon_begin_semantic_version' AND NOT tgisinternal
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_trigger
            WHERE tgrelid = to_regclass('yu.lexicon')
              AND tgname = 'lexicon_begin_insert_version' AND NOT tgisinternal
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_trigger
            WHERE tgrelid = to_regclass('yu.lexicon')
              AND tgname = 'lexicon_capture_insert_version' AND NOT tgisinternal
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_trigger
            WHERE tgrelid = to_regclass('yu.lexicon')
              AND tgname = 'lexicon_capture_update_version' AND NOT tgisinternal
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_trigger
            WHERE tgrelid = to_regclass('yu.lexicon')
              AND tgname = 'lexicon_version_gloss' AND NOT tgisinternal
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_trigger
            WHERE tgrelid = to_regclass('yu.word_versions')
              AND tgname = 'word_versions_immutable' AND NOT tgisinternal
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_trigger
            WHERE tgrelid = to_regclass('yu.threads')
              AND tgname = 'threads_reserve_id' AND NOT tgisinternal
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_trigger
            WHERE tgrelid = to_regclass('yu.threads')
              AND tgname = 'threads_validate' AND NOT tgisinternal
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_trigger
            WHERE tgrelid = to_regclass('yu.threads')
              AND tgname = 'threads_immutable' AND NOT tgisinternal
          )
          AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_trigger
            WHERE tgrelid = to_regclass('yu.sever_log')
              AND tgname = 'sever_log_immutable' AND NOT tgisinternal
          )
          AND (
            SELECT count(*)
            FROM pg_catalog.pg_trigger t
            WHERE NOT t.tgisinternal
              AND t.tgrelid IN (
                to_regclass('yu.standard_meta'),
                to_regclass('yu.lexicon'),
                to_regclass('yu.lexicon_versions'),
                to_regclass('yu.word_versions'),
                to_regclass('yu.registry'),
                to_regclass('yu.threads'),
                to_regclass('yu.thread_ids'),
                to_regclass('yu.sever_log')
              )
          ) = 11
          AND NOT EXISTS (
            SELECT 1
            FROM (VALUES
              ('yu.registry', 'registry_validate_physical_mapping', 23,
                'yu._validate_registry_mapping()', ARRAY[
                  'physical_schema', 'physical_table', 'id_col', 'at_col',
                  'by_col', 'how_col', 'src_col'
                ]::text[], false),
              ('yu.lexicon', 'lexicon_begin_insert_version', 7,
                'yu._begin_word_insert()', ARRAY[]::text[], false),
              ('yu.lexicon', 'lexicon_begin_semantic_version', 19,
                'yu._begin_word_version()', ARRAY[]::text[], false),
              ('yu.lexicon', 'lexicon_capture_insert_version', 5,
                'yu._capture_word_version()', ARRAY[]::text[], false),
              ('yu.lexicon', 'lexicon_capture_update_version', 17,
                'yu._capture_word_version()', ARRAY[]::text[], true),
              ('yu.lexicon', 'lexicon_version_gloss', 19,
                'yu._version_gloss()', ARRAY['gloss', 'inverse']::text[], false),
              ('yu.word_versions', 'word_versions_immutable', 27,
                'yu._refuse_word_version_mutation()', ARRAY[]::text[], false),
              ('yu.threads', 'threads_reserve_id', 5,
                'yu._reserve_thread_id()', ARRAY[]::text[], false),
              ('yu.threads', 'threads_validate', 7,
                'yu._validate_thread()', ARRAY[]::text[], false),
              ('yu.threads', 'threads_immutable', 19,
                'yu._refuse_thread_mutation()', ARRAY[]::text[], false),
              ('yu.sever_log', 'sever_log_immutable', 27,
                'yu._refuse_sever_log_mutation()', ARRAY[]::text[], false)
            ) AS required(
              relation_name, trigger_name, trigger_type, function_name,
              trigger_columns, version_qual
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
               OR (
                 required.version_qual
                 AND (
                   t.tgqual IS NULL
                   OR pg_get_triggerdef(t.oid, true) NOT LIKE
                      '%WHEN (new.current_version IS DISTINCT FROM old.current_version)%'
                 )
               )
               OR (NOT required.version_qual AND t.tgqual IS NOT NULL)
          )
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_rewrite r
            WHERE r.ev_class IN (
              to_regclass('yu.standard_meta'),
              to_regclass('yu.lexicon'),
              to_regclass('yu.lexicon_versions'),
              to_regclass('yu.word_versions'),
              to_regclass('yu.registry'),
              to_regclass('yu.threads'),
              to_regclass('yu.thread_ids'),
              to_regclass('yu.sever_log')
            )
          )
        ) AS has_candidate_objects
    `,
    sql`
      SELECT table_name, column_name, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'yu'
    `,
    hasLegacyConstraintSurface(sql),
  ]);
  const row = objects[0] as Record<string, unknown>;
  const catalogMode = row.has_standard_meta === true ? "candidate" : "legacy";
  const [
    hasExactCoreColumns,
    hasExactCoreIndexes,
    hasExactCandidateConstraints,
    hasExactCandidateFunctions,
  ] = await Promise.all([
    hasExactCoreColumnSurface(sql, catalogMode),
    hasExactCoreIndexSurface(sql, catalogMode),
    catalogMode === "candidate"
      ? hasExactCandidateConstraintSurface(sql)
      : Promise.resolve(false),
    catalogMode === "candidate"
      ? hasExactCandidateFunctionSurface(sql)
      : Promise.resolve(false),
  ]);
  const actualColumns: ColumnShape[] = columns.map((column) => ({
    tableName: String(column.table_name),
    columnName: String(column.column_name),
    udtName: String(column.udt_name),
    notNull: column.is_nullable === "NO",
  }));
  const hasPhysicalSchema = actualColumns.some((column) =>
    column.tableName === "registry" && column.columnName === "physical_schema"
  );
  const hasPhysicalTable = actualColumns.some((column) =>
    column.tableName === "registry" && column.columnName === "physical_table"
  );
  const probe: InstallProbe = {
    hasYuSchema: row.has_yu_schema === true,
    hasLexicon: row.has_lexicon === true,
    hasLexiconVersions: row.has_lexicon_versions === true,
    hasRegistry: row.has_registry === true,
    hasThreads: row.has_threads === true,
    hasSeverLog: row.has_sever_log === true,
    hasViaSchema: row.has_via_schema === true,
    hasLegacyIntegrity:
      row.has_legacy_integrity === true &&
      hasExactLegacyConstraints &&
      hasExactCoreIndexes,
    hasPhysicalSchema,
    hasPhysicalTable,
    hasStandardMeta: row.has_standard_meta === true,
    hasLegacyCoreShape: hasExactCoreColumns,
    hasCandidateShape:
      catalogMode === "candidate" &&
      hasExactCoreColumns &&
      hasExactCandidateConstraints,
    hasCandidateObjects:
      row.has_candidate_objects === true && hasExactCandidateFunctions,
    hasCandidateFootprint:
      hasAnyColumn(actualColumns, CANDIDATE_COLUMNS) ||
      row.has_candidate_footprint_objects === true,
  };

  if (probe.hasStandardMeta && probe.hasCandidateObjects) {
    probe.hasCandidateObjects = await hasCandidateDynamicSurfaces(sql);
  }

  if (probe.hasStandardMeta) {
    const metadata = await sql`
      SELECT standard, profile, version, revision
      FROM yu.standard_meta
      WHERE singleton = true
    `;
    if (metadata.length !== 1) {
      throw new Error("CORRUPT STANDARD META: expected exactly one singleton row");
    }
    const meta = metadata[0] as Record<string, unknown>;
    probe.standard = typeof meta.standard === "string" ? meta.standard : undefined;
    probe.profile = typeof meta.profile === "string" ? meta.profile : undefined;
    probe.version = typeof meta.version === "string" ? meta.version : undefined;
    probe.revision = typeof meta.revision === "number" ? meta.revision : undefined;
  }

  return probe;
}

// --- yuta repl ---

async function doRepl(conn: string | undefined, by: string | undefined): Promise<void> {
  const yuta = new Yuta({ connectionString: conn, claimant: by });

  console.log("");
  console.log("  YOUSPEAK — you speak, and reality listens.");
  console.log("  Type sentences. They compile to SQL; explain shows the logical form.");
  console.log("");
  console.log("  hello                  — inspect installed identity, words, and decks");
  console.log("  card tradein/sub/...   — fetch one card");
  console.log("  ref -> word            — follow a word outward");
  console.log("  ref <- word            — follow it inward");
  console.log("  thread a --w--> b ...  — create a thread");
  console.log("  sever <id> how ...     — end a thread");
  console.log('  explain "sentence"     — see logical SQL before deck resolution');
  console.log("  exit / quit            — leave");
  console.log("");

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "youspeak> ",
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }
    if (input === "exit" || input === "quit" || input === ":q") {
      console.log("  goodbye");
      rl.close();
      return;
    }

    try {
      if (input.startsWith("explain ")) {
        const q = input.slice(8).replace(/^["']|["']$/g, "");
        const sqlStr = explain(q);
        console.log("  " + sqlStr.replace(/\n/g, "\n  "));
        rl.prompt();
        return;
      }

      const result = await yuta.query(input);
      if (input.trim() === "hello") {
        printHello(result.rows[0] as any);
      } else {
        if (result.rows.length === 0) {
          console.log("  (no results)");
        } else {
          console.log(JSON.stringify(result.rows, null, 2));
        }
        if (result.freshness && result.freshness.totalValues > 0) {
          const f = result.freshness;
          console.log("  freshness: " + f.cachedCount + "/" + f.totalValues + " cached, " + f.computedCount + " computed, oldest " + f.oldestCachedDays + "d");
        }
      }
    } catch (err) {
      console.error("  " + (err as Error).message);
    }

    rl.prompt();
  });

  rl.on("close", async () => {
    await yuta.close();
    process.exit(0);
  });
}

// --- hello pretty-printer ---

function printHello(hello: any): void {
  console.log("");
  console.log("  +------------------------------------------------------+");
  console.log("  |       YUTABASE " + (hello.version || "unknown") + " — you speak, reality listens        |");
  console.log("  +------------------------------------------------------+");
  console.log("");

  console.log("  creed:");
  for (const c of hello.creed || []) {
    console.log("    " + c);
  }
  console.log("");

  console.log("  primitives: " + (hello.primitives || []).join(" . "));
  console.log("  binding: " + (hello.profile || "unknown") + " · revision " + (hello.revision ?? "unknown") + " · " + (hello.versionSource || "unknown"));
  if ((hello.capabilities || []).length > 0) {
    console.log("  capabilities: " + hello.capabilities.join(" . "));
  }
  console.log("");

  console.log("  honesty header:");
  console.log("    columns: " + (hello.honesty.columns || []).join(", "));
  console.log("    claims:  " + (hello.honesty.claims || []).join(" . "));
  console.log("    rule:    " + hello.honesty.rule);
  console.log("");

  console.log("  lexicon (" + (hello.lexicon || []).length + " words):");
  for (const w of hello.lexicon || []) {
    const one = w.to_one ? " [to_one]" : "";
    const status = w.status !== "live" ? " (" + w.status + ")" : "";
    console.log("    " + w.word.padEnd(18) + w.inverse.padEnd(18) + " " + w.from_deck + " -> " + w.to_deck + one + status);
    console.log("    " + " ".repeat(18) + "  " + w.gloss);
  }
  console.log("");

  console.log("  decks (" + (hello.decks || []).length + "):");
  for (const d of hello.decks || []) {
    const kind = d.native ? "native" : "annexed";
    console.log("    " + d.book + "/" + d.deck + " (" + kind + ")");
  }
  console.log("");

  console.log("  YOUSPEAK:");
  for (const q of hello.youspeak || []) {
    console.log("    " + q);
  }
  console.log("");

  console.log("  " + hello.vocabularyGuidance);
  console.log("");
}


// --- yuta deck new / deck annex ---

async function doDeck(yuta: Yuta, args: string[]): Promise<void> {
  const sub = args[0];
  if (sub === "new") {
    await doDeckNew(yuta, args.slice(1));
  } else if (sub === "annex") {
    await doDeckAnnex(yuta, args.slice(1));
  } else if (sub === "list") {
    const result = await yuta.sqlTag`SELECT book, deck, native, ttl FROM yu.registry ORDER BY book, deck` as any[];
    for (const d of result) {
      const kind = d.native ? "native" : "annexed";
      const ttl = d.ttl ? " ttl=" + d.ttl : "";
      console.log("  " + d.book + "/" + d.deck + " (" + kind + ttl + ")");
    }
  } else {
    console.error("Usage: yuta deck new <book/deck> [column:type ...] [--ttl <interval>]");
    console.error("       yuta --by <claimant> deck annex <schema.table> as <book/deck> --id <col> --at <col> --by <col> --how <col> [--src <col>]");
    console.error("       yuta deck list");
    process.exit(1);
  }
}

async function doDeckNew(yuta: Yuta, args: string[]): Promise<void> {
  // yuta deck new tradein/submissions status:text --ttl "7 days"
  const deckRef = args[0];
  if (!deckRef || !deckRef.includes("/")) {
    console.error("Usage: yuta deck new <book/deck> [column:type ...] [--ttl <interval>]");
    process.exit(1);
  }
  const [book, deck] = parseLogicalDeckRef(deckRef);
  const columns: { name: string; type: string }[] = [];
  const columnNames = new Set(["id", "at", "by", "how", "src"]);
  let ttl: string | undefined;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--ttl") { ttl = args[++i]; continue; }
    const separator = args[i].indexOf(":");
    const name = separator >= 0 ? args[i].slice(0, separator) : "";
    const type = separator >= 0 ? args[i].slice(separator + 1) : "";
    if (!name || !type) {
      console.error("Bad column spec: " + args[i] + " — expected name:type (e.g. status:text)");
      process.exit(1);
    }
    ident(name);
    if (columnNames.has(name)) throw new Error(`DUPLICATE OR RESERVED COLUMN: ${name}`);
    columnNames.add(name);
    columns.push({ name, type: validateColumnType(type) });
  }

  // Build the CREATE TABLE DDL with the honesty header
  const colDefs = [
    '  id uuid PRIMARY KEY',
    ...columns.map(c => '  ' + ident(c.name) + " " + c.type),
    '  at timestamptz NOT NULL',
    "  by text NOT NULL CHECK (btrim(by) <> '')",
    "  how text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared'))",
    '  src text[]',
    "  CHECK (how NOT IN ('cached','computed') OR (src IS NOT NULL AND cardinality(src) > 0))",
  ].join(",\n");

  const createSchema = 'CREATE SCHEMA IF NOT EXISTS ' + ident(book);
  const createTable = 'CREATE TABLE ' + ident(book) + '.' + ident(deck) + ' (\n' + colDefs + '\n)';
  const register = 'INSERT INTO yu.registry (book, deck, physical_schema, physical_table, native, ttl, by) VALUES (' +
    literal(book) + ', ' + literal(deck) + ', ' + literal(book) + ', ' + literal(deck) + ', true, ' +
    (ttl ? literal(ttl) + '::interval' : 'NULL') + ', ' + literal(yuta.getClaimant()) + ')';
  const dropGuard = 'DROP TRIGGER IF EXISTS yutabase_guard_delete ON ' + ident(book) + '.' + ident(deck);
  const guard = 'CREATE TRIGGER yutabase_guard_delete BEFORE DELETE ON ' + ident(book) + '.' + ident(deck) + ' FOR EACH ROW EXECUTE FUNCTION yu._guard_delete()';

  console.log("deck new — creating " + book + "/" + deck);
  console.log("  columns: id, " + columns.map(c => c.name + ":" + c.type).join(", ") + ", at, by, how, src");

  try {
    await yuta.execTransaction([createSchema, createTable, register, dropGuard, guard]);
    console.log("  done — " + book + "/" + deck + " registered (native)");
  } catch (err) {
    console.error("  FAILED: " + (err as Error).message);
    process.exit(1);
  }
}

async function doDeckAnnex(yuta: Yuta, args: string[]): Promise<void> {
  // yuta deck annex public.tradein_submissions as tradein/submissions --id id --at created_at --by created_by --how declared
  const tableRef = args[0];
  if (!tableRef || args[1] !== "as") {
    console.error("Usage: yuta --by <claimant> deck annex <schema.table> as <book/deck> --id <col> --at <col> --by <col> --how <col> [--src <col>]");
    process.exit(1);
  }
  const [physicalSchema, physicalTable] = parsePhysicalTableRef(tableRef);
  const deckRef = args[2];
  const [book, deck] = parseLogicalDeckRef(deckRef);
  let idCol = "id", atCol = "at", byCol = "by", howCol = "how", srcCol = "src";
  for (let i = 3; i < args.length; i++) {
    if (args[i] === "--id") { idCol = args[++i]; continue; }
    if (args[i] === "--at") { atCol = args[++i]; continue; }
    if (args[i] === "--by") { byCol = args[++i]; continue; }
    if (args[i] === "--how") { howCol = args[++i]; continue; }
    if (args[i] === "--src") { srcCol = args[++i]; continue; }
  }
  for (const value of [idCol, atCol, byCol, howCol, srcCol]) ident(value);

  const validate = `
    DO $yutabase$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM yu.registry
        WHERE book = ${literal(book)} AND deck = ${literal(deck)}
          AND (physical_schema, physical_table) IS DISTINCT FROM
              (${literal(physicalSchema)}, ${literal(physicalTable)})
      ) THEN
        RAISE EXCEPTION 'ANNEX REMAP REFUSED: %/% already names a different physical table',
          ${literal(book)}, ${literal(deck)};
      END IF;
      IF to_regclass(${literal(`${physicalSchema}.${physicalTable}`)}) IS NULL THEN
        RAISE EXCEPTION 'ANNEX TABLE NOT FOUND: %', ${literal(`${physicalSchema}.${physicalTable}`)};
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgrelid = to_regclass(${literal(`${physicalSchema}.${physicalTable}`)})
          AND tgname = 'yutabase_guard_delete' AND NOT tgisinternal
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgrelid = to_regclass(${literal(`${physicalSchema}.${physicalTable}`)})
          AND tgname = 'yutabase_guard_delete' AND NOT tgisinternal
          AND tgfoid = to_regprocedure('yu._guard_delete()')
          AND tgtype = 11
      ) THEN
        RAISE EXCEPTION
          'ANNEX TRIGGER CONFLICT: %.% already has a non-YUTABASE trigger named yutabase_guard_delete',
          ${literal(physicalSchema)}, ${literal(physicalTable)};
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = ${literal(physicalSchema)} AND table_name = ${literal(physicalTable)}
          AND column_name = ${literal(idCol)} AND udt_name = 'uuid' AND is_nullable = 'NO'
      ) THEN RAISE EXCEPTION 'ANNEX ID: %.% must be a non-null uuid', ${literal(`${physicalSchema}.${physicalTable}`)}, ${literal(idCol)}; END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_attribute a
          ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
        WHERE i.indrelid = to_regclass(${literal(`${physicalSchema}.${physicalTable}`)})
          AND i.indisunique
          AND i.indisvalid
          AND i.indisready
          AND i.indpred IS NULL
          AND i.indexprs IS NULL
          AND i.indnkeyatts = 1
          AND a.attname = ${literal(idCol)}
      ) THEN RAISE EXCEPTION 'ANNEX ID: %.% must be the sole key of a valid unique index or primary key', ${literal(`${physicalSchema}.${physicalTable}`)}, ${literal(idCol)}; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = ${literal(physicalSchema)} AND table_name = ${literal(physicalTable)}
          AND column_name = ${literal(atCol)} AND data_type = 'timestamp with time zone'
      ) THEN RAISE EXCEPTION 'ANNEX CLAIM: %.% must be timestamptz', ${literal(`${physicalSchema}.${physicalTable}`)}, ${literal(atCol)}; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = ${literal(physicalSchema)} AND table_name = ${literal(physicalTable)}
          AND column_name = ${literal(byCol)} AND data_type = 'text'
      ) THEN RAISE EXCEPTION 'ANNEX CLAIM: %.% must be text', ${literal(`${physicalSchema}.${physicalTable}`)}, ${literal(byCol)}; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = ${literal(physicalSchema)} AND table_name = ${literal(physicalTable)}
          AND column_name = ${literal(howCol)} AND data_type = 'text'
      ) THEN RAISE EXCEPTION 'ANNEX CLAIM: %.% must be text', ${literal(`${physicalSchema}.${physicalTable}`)}, ${literal(howCol)}; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = ${literal(physicalSchema)} AND table_name = ${literal(physicalTable)}
          AND column_name = ${literal(srcCol)} AND udt_name = '_text'
      ) THEN RAISE EXCEPTION 'ANNEX CLAIM: %.% must be text[]', ${literal(`${physicalSchema}.${physicalTable}`)}, ${literal(srcCol)}; END IF;
    END
    $yutabase$
  `;
  const register = 'INSERT INTO yu.registry (book, deck, physical_schema, physical_table, id_col, at_col, by_col, how_col, src_col, native, by) VALUES (' +
    literal(book) + ', ' + literal(deck) + ', ' + literal(physicalSchema) + ', ' + literal(physicalTable) + ', ' +
    literal(idCol) + ', ' + literal(atCol) + ', ' + literal(byCol) + ', ' + literal(howCol) + ', ' + literal(srcCol) +
    ', false, ' + literal(yuta.getClaimant()) + ') ON CONFLICT (book, deck) DO UPDATE SET ' +
    'physical_schema = EXCLUDED.physical_schema, physical_table = EXCLUDED.physical_table, ' +
    'id_col = EXCLUDED.id_col, at_col = EXCLUDED.at_col, by_col = EXCLUDED.by_col, ' +
    'how_col = EXCLUDED.how_col, src_col = EXCLUDED.src_col, native = false, ' +
    'at = clock_timestamp(), by = EXCLUDED.by';
  const qualifiedPhysicalTable = ident(physicalSchema) + '.' + ident(physicalTable);
  const dropGuard = 'DROP TRIGGER IF EXISTS yutabase_guard_delete ON ' + qualifiedPhysicalTable;
  const guard = 'CREATE TRIGGER yutabase_guard_delete BEFORE DELETE ON ' + qualifiedPhysicalTable +
    ' FOR EACH ROW EXECUTE FUNCTION yu._guard_delete()';

  console.log("deck annex — " + tableRef + " → " + book + "/" + deck);
  console.log("  physical=" + physicalSchema + "." + physicalTable);
  console.log("  id_col=" + idCol + " at_col=" + atCol + " by_col=" + byCol + " how_col=" + howCol + " src_col=" + srcCol);

  try {
    await yuta.execTransaction([validate, register, dropGuard, guard]);
    console.log("  done — mapping registered and physical delete guard installed atomically");
  } catch (err) {
    console.error("  FAILED: " + (err as Error).message);
    process.exit(1);
  }
}

// --- yuta word add / retire / export ---

async function doWord(yuta: Yuta, args: string[]): Promise<void> {
  const sub = args[0];
  if (sub === "add") {
    await doWordAdd(yuta, args.slice(1));
  } else if (sub === "retire") {
    await doWordRetire(yuta, args.slice(1));
  } else {
    console.error("Usage: yuta word add <word> --gloss \"...\" --inverse \"...\" --from <book/deck> --to <book/deck> [--to-one]");
    console.error("       yuta word retire <word> how <claim> [src <locator> ...]");
    process.exit(1);
  }
}

async function doWordAdd(yuta: Yuta, args: string[]): Promise<void> {
  const word = args[0];
  if (!word) {
    console.error("Usage: yuta word add <word> --gloss \"...\" --inverse \"...\" --from <book/deck> --to <book/deck> [--to-one]");
    process.exit(1);
  }
  let gloss: string | undefined;
  let inverse: string | undefined;
  let fromDeck: string | undefined;
  let toDeck: string | undefined;
  let toOne = false;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--gloss") { gloss = args[++i]; continue; }
    if (args[i] === "--inverse") { inverse = args[++i]; continue; }
    if (args[i] === "--from") { fromDeck = args[++i]; continue; }
    if (args[i] === "--to") { toDeck = args[++i]; continue; }
    if (args[i] === "--to-one") { toOne = true; continue; }
  }

  if (!gloss || !inverse || !fromDeck || !toDeck) {
    console.error("word add requires --gloss, --inverse, --from, --to");
    console.error("  No gloss, no word. No inverse, no word.");
    process.exit(1);
  }

  // Core has no normative spelling blocklist. Gloss, inverse, endpoint
  // typing, review, and later retirement carry vocabulary governance.

  // Insert as lexicographer
  const claimant = yuta.getClaimant();
  const insertSql = 'INSERT INTO yu.lexicon (word, gloss, inverse, from_deck, to_deck, to_one, status, at, by, how) VALUES (' +
    literal(word) + ', ' + literal(gloss) + ', ' + literal(inverse) + ', ' + literal(fromDeck) + ', ' + literal(toDeck) + ', ' + (toOne ? 'true' : 'false') +
    ", 'live', clock_timestamp(), " + literal(claimant) + ", 'declared')";
  console.log("word add — coining \"" + word + "\"");
  console.log("  gloss:   " + gloss);
  console.log("  inverse: " + inverse);
  console.log("  from:    " + fromDeck);
  console.log("  to:      " + toDeck + (toOne ? " [to_one]" : ""));

  try {
    await yuta.execTransaction([
      "SET ROLE yu_lexicographer",
      insertSql,
      "SELECT yu.refresh_via()",
      "RESET ROLE",
    ]);
    console.log("  done — word coined. via." + word + " view generated.");
  } catch (err) {
    console.error("  FAILED: " + (err as Error).message);
    process.exit(1);
  }
}

async function doWordRetire(yuta: Yuta, args: string[]): Promise<void> {
  const word = args[0];
  const howIndex = args.indexOf("how");
  const srcIndex = args.indexOf("src");
  const how = howIndex >= 0 ? args[howIndex + 1] : undefined;
  const src = srcIndex >= 0 ? args.slice(srcIndex + 1) : undefined;
  if (!word || !how) {
    console.error("Usage: yuta word retire <word> how <claim> [src <locator> ...]");
    process.exit(1);
  }
  validateClaim("word retire", how, src);
  const claimant = yuta.getClaimant();

  const updateSql = `
    DO $yutabase$
    DECLARE
      updated integer;
    BEGIN
      UPDATE yu.lexicon
      SET status = 'retired',
          at = clock_timestamp(),
          by = ${literal(claimant)},
          how = ${literal(how)},
          src = ${textArrayLiteral(src)}
      WHERE word = ${literal(word)} AND status = 'live';
      GET DIAGNOSTICS updated = ROW_COUNT;
      IF updated <> 1 THEN
        RAISE EXCEPTION 'WORD RETIRE: % is missing or already retired', ${literal(word)};
      END IF;
    END
    $yutabase$
  `;

  console.log("word retire — retiring \"" + word + "\"");
  console.log("  retired words refuse new threads; old threads keep their meaning");

  try {
    await yuta.execTransaction([
      "SET ROLE yu_lexicographer",
      updateSql,
      "SELECT yu.refresh_via()",
      "RESET ROLE",
    ]);
    console.log("  done — " + word + " retired");
  } catch (err) {
    console.error("  FAILED: " + (err as Error).message);
    process.exit(1);
  }
}

// --- helpers for DDL ---

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error("BAD IDENTIFIER: " + name);
  }
  return '"' + name + '"';
}

function literal(val: string): string {
  return "'" + val.replace(/'/g, "''") + "'";
}

function textArrayLiteral(values: readonly string[] | undefined): string {
  if (!values || values.length === 0) return "NULL";
  return "ARRAY[" + values.map(literal).join(", ") + "]::text[]";
}

function validateClaim(label: string, how: string, src: readonly string[] | undefined): void {
  const claimKinds = new Set(["witnessed", "live", "cached", "computed", "declared"]);
  if (!claimKinds.has(how)) throw new Error(`${label}: unknown claim kind ${how}`);
  if ((how === "cached" || how === "computed") && (!src || src.length === 0)) {
    throw new Error(`${label}: how=${how} requires a non-empty src`);
  }
}

function parseLogicalDeckRef(value: string): [string, string] {
  const parts = value.split("/");
  if (parts.length !== 2) throw new Error("BAD DECK REF: expected book/deck");
  ident(parts[0]);
  ident(parts[1]);
  return [parts[0], parts[1]];
}

function parsePhysicalTableRef(value: string): [string, string] {
  const parts = value.split(".");
  if (parts.length !== 2) throw new Error("BAD PHYSICAL TABLE: expected schema.table");
  ident(parts[0]);
  ident(parts[1]);
  return [parts[0], parts[1]];
}

// --- help ---

function printHelp(): void {
  console.log(`yuta — YUTABASE ${CANDIDATE_VERSION}`);
  console.log("");
  console.log("  You speak, and reality listens.");
  console.log("");
  console.log("Commands:");
  console.log("  init                     Install the yu schema + starter lexicon");
  console.log("  repl                     Interactive YOUSPEAK session");
  console.log("  hello                    Installed identity, words, and decks");
  console.log("  card <ref>               Fetch one card by ref");
  console.log("  cards <book/deck> [...]  List cards with optional filter");
  console.log('  query "<youspeak>"       Run any YOUSPEAK sentence');
  console.log("  thread <from --word--> to>  Create a thread");
  console.log("  sever <id> how <claim>   End a thread");
  console.log('  explain "<youspeak>"     Print logical SQL before registry resolution');
  console.log("  doctor                   Vocabulary health check");
  console.log("  check                    fsck: orphaned threads");
  console.log("  deck new <book/deck>    Create a native deck with honesty header");
  console.log("  deck annex <tbl> as <book/deck>  Annex a legacy table");
  console.log("  word add <word> ...      Coin a word (requires --gloss, --inverse, --from, --to)");
  console.log("  word retire <word> how <claim> [src ...]  Retire with a new claim");
  console.log("  stale                    Freshness audit: cached/computed past TTL");
  console.log("  words [--export]         List the lexicon / export to LEXICON.md");
  console.log("  decks                    List registered decks");
  console.log("");
  console.log("Options:");
  console.log("  --conn <url>             Connection string (default: keychain)");
  console.log("  --by <claimant>          Set session claimant");
  console.log("");
  console.log("Examples:");
  console.log("  yuta init --conn postgresql://localhost/mydb");
  console.log("  yuta repl --conn postgresql://localhost/mydb");
  console.log("  yuta hello");
  console.log("  yuta card tradein/submissions/01977c2e-0000-7000-8000-000000000001");
  console.log("  yuta query 'tradein/submissions/01977c2e-0000-7000-8000-000000000001 -> contains'");
  console.log("  yuta explain \"cards tradein/submissions newest 5\"");
}

// --- main dispatch ---

const args = process.argv.slice(2);
if (!args[0] || args[0] === "--help" || args[0] === "-h") {
  printHelp();
  process.exit(0);
}

const { conn, by, positional } = parseCliArgs(args);
const cmd = positional[0];
const rest = positional.slice(1).join(" ");

async function main() {
  if (cmd === "init") {
    await doInit(conn);
    return;
  }

  if (cmd === "repl") {
    await doRepl(conn, by);
    return;
  }

  if (cmd === "explain") {
    const queryStr = rest.replace(/^["']|["']$/g, "");
    console.log(explain(queryStr));
    return;
  }

  const yuta = new Yuta({ connectionString: conn, claimant: by });
  if (cmd !== "hello") await yuta.assertCandidateBinding();

  switch (cmd) {
    case "hello": {
      const hello = await yuta.hello();
      printHello(hello);
      break;
    }

    case "card": {
      if (!rest) { console.error("Usage: yuta card <book/deck/id>"); process.exit(1); }
      const card = await yuta.card(rest);
      console.log(JSON.stringify(card, null, 2));
      break;
    }

    case "cards": {
      const result = await yuta.query("cards " + rest);
      console.log(JSON.stringify(result.rows, null, 2));
      if (result.freshness) {
        const f = result.freshness;
        console.error("freshness: " + f.cachedCount + "/" + f.totalValues + " cached, oldest " + f.oldestCachedDays + "d");
      }
      break;
    }

    case "query": {
      const queryStr = rest.replace(/^["']|["']$/g, "");
      const result = await yuta.query(queryStr);
      console.log(JSON.stringify(result.rows, null, 2));
      if (result.freshness) {
        const f = result.freshness;
        console.error("freshness: " + f.cachedCount + "/" + f.totalValues + " cached, oldest " + f.oldestCachedDays + "d");
      }
      break;
    }

    case "thread": {
      const result = await yuta.query("thread " + rest);
      console.log(JSON.stringify(result.rows, null, 2));
      break;
    }

    case "sever": {
      await yuta.query("sever " + rest);
      console.log("severed");
      break;
    }

    case "doctor": {
      const result = await yuta.sqlTag`SELECT * FROM yu.doctor()` as any[];
      if (result.length === 0) {
        console.log("doctor: all clear — no flags");
      } else {
        for (const r of result) {
          const w = r.word ? " \"" + r.word + "\"" : "";
          console.log("doctor: " + r.flag + w + " — " + r.detail);
        }
      }
      break;
    }

    case "check": {
      // fsck: orphaned threads (endpoints not registered), dead refs, header violations
      let issues = 0;

      // 1. orphaned threads — endpoints not in registry
      const orphans = await yuta.sqlTag`
        SELECT t.id, t.word, t.from_book, t.from_deck, t.from_id, t.to_book, t.to_deck, t.to_id
        FROM yu.threads t
        LEFT JOIN yu.registry r1 ON r1.book = t.from_book AND r1.deck = t.from_deck
        LEFT JOIN yu.registry r2 ON r2.book = t.to_book AND r2.deck = t.to_deck
        WHERE r1.book IS NULL OR r2.book IS NULL
      ` as any[];
      if (orphans.length > 0) {
        issues += orphans.length;
        console.log("check: " + orphans.length + " orphaned thread(s) — endpoints not in registry:");
        for (const o of orphans) {
          console.log("  " + o.word + " " + o.from_book + "/" + o.from_deck + "/" + o.from_id + " → " + o.to_book + "/" + o.to_deck + "/" + o.to_id);
        }
      }

      // 2. registered logical refs whose mapped physical card is absent
      const deadRefs = await yuta.sqlTag`
        SELECT
          t.id, t.word,
          t.from_book, t.from_deck, t.from_id,
          t.to_book, t.to_deck, t.to_id,
          yu._card_exists(t.from_book, t.from_deck, t.from_id) AS from_exists,
          yu._card_exists(t.to_book, t.to_deck, t.to_id) AS to_exists
        FROM yu.threads t
        JOIN yu.registry r1 ON r1.book = t.from_book AND r1.deck = t.from_deck
        JOIN yu.registry r2 ON r2.book = t.to_book AND r2.deck = t.to_deck
        WHERE NOT yu._card_exists(t.from_book, t.from_deck, t.from_id)
           OR NOT yu._card_exists(t.to_book, t.to_deck, t.to_id)
      ` as any[];
      if (deadRefs.length > 0) {
        issues += deadRefs.length;
        console.log("check: " + deadRefs.length + " thread(s) have missing physical endpoint cards:");
        for (const ref of deadRefs) {
          const missing: string[] = [];
          if (!ref.from_exists) missing.push(ref.from_book + "/" + ref.from_deck + "/" + ref.from_id);
          if (!ref.to_exists) missing.push(ref.to_book + "/" + ref.to_deck + "/" + ref.to_id);
          console.log("  " + ref.word + " — missing " + missing.join(", "));
        }
      }

      // 3. retired words still holding live threads (not an error, but worth knowing)
      const retired = await yuta.sqlTag`
        SELECT l.word, count(t.id) AS thread_count
        FROM yu.lexicon l
        JOIN yu.threads t ON t.word = l.word
        WHERE l.status = 'retired'
        GROUP BY l.word
      ` as any[];
      if (retired.length > 0) {
        console.log("check: " + retired.length + " retired word(s) still holding live threads:");
        for (const r of retired) {
          console.log("  " + r.word + " — " + r.thread_count + " thread(s) (meaning preserved, no new threads allowed)");
        }
      }

      // 4. thread count
      const total = await yuta.sqlTag`SELECT count(*)::int AS n FROM yu.threads` as any[];
      const wordCount = await yuta.sqlTag`SELECT count(*)::int AS n FROM yu.lexicon WHERE status = 'live'` as any[];
      const deckCount = await yuta.sqlTag`SELECT count(*)::int AS n FROM yu.registry` as any[];

      if (issues === 0) {
        console.log("check: all clear — " + total[0].n + " threads, " + wordCount[0].n + " live words, " + deckCount[0].n + " decks registered");
      } else {
        console.log("check: " + issues + " issue(s) found across " + total[0].n + " threads");
      }
      break;
    }

    case "words": {
      const result = await yuta.sqlTag`SELECT l.word, l.gloss, l.inverse, l.from_deck, l.to_deck, l.to_one, l.status, count(t.id)::int AS usage FROM yu.lexicon l LEFT JOIN yu.threads t ON t.word = l.word GROUP BY l.word, l.gloss, l.inverse, l.from_deck, l.to_deck, l.to_one, l.status ORDER BY l.word` as any[];

      // Check for --export flag
      if (positional.includes("--export")) {
        let md = "# LEXICON — the words and their meanings\n\n";
        md += "_The vocabulary lives with the data. Glosses versioned (never silently edited). Words are retired (never deleted). No one overwrites anyone else's meaning._\n\n";
        md += "---\n\n";

        // Group: starter words (those with non-*/* endpoints) vs kingdom words (all */*)
        const starter = result.filter(w => w.from_deck !== "*/*" || w.to_deck !== "*/*");
        const general = result.filter(w => w.from_deck === "*/*" && w.to_deck === "*/*" && w.status === "live");
        const retired = result.filter(w => w.status === "retired");

        if (starter.length > 0) {
          md += "## domain words\n\n";
          for (const w of starter) {
            const one = w.to_one ? " [to_one]" : "";
            md += "### " + w.word + one + "\n";
            md += "**inverse:** " + w.inverse + "\n";
            md += "**meaning:** " + w.gloss + "\n";
            md += "**endpoints:** " + w.from_deck + " → " + w.to_deck + "\n";
            if (w.usage > 0) md += "**threads:** " + w.usage + "\n";
            md += "\n";
          }
        }

        if (general.length > 0) {
          md += "## general words\n\n";
          for (const w of general) {
            const one = w.to_one ? " [to_one]" : "";
            md += "### " + w.word + one + "\n";
            md += "**inverse:** " + w.inverse + "\n";
            md += "**meaning:** " + w.gloss + "\n";
            if (w.usage > 0) md += "**threads:** " + w.usage + "\n";
            md += "\n";
          }
        }

        if (retired.length > 0) {
          md += "## retired words\n\n";
          for (const w of retired) {
            md += "### " + w.word + " (retired)\n";
            md += "**was:** " + w.gloss + "\n";
            md += "_Retired words refuse new threads. Old threads keep their meaning._\n\n";
          }
        }

        md += "_" + result.length + " words. Glosses versioned, words retired (never deleted). No one overwrites anyone else's meaning._\n";

        writeFileSync("LEXICON.md", md);
        console.log("exported " + result.length + " words to LEXICON.md");
      } else {
        for (const w of result) {
          const one = w.to_one ? " [to_one]" : "";
          const use = w.usage > 0 ? " (" + w.usage + " threads)" : "";
          console.log("  " + w.word.padEnd(18) + w.inverse.padEnd(18) + " " + w.from_deck + " -> " + w.to_deck + one + " (" + w.status + ")" + use);
          console.log("  " + " ".repeat(20) + w.gloss);
        }
      }
      break;
    }

    case "decks": {
      const result = await yuta.sqlTag`SELECT book, deck, native, ttl FROM yu.registry ORDER BY book, deck` as any[];
      for (const d of result) {
        const kind = d.native ? "native" : "annexed";
        const ttl = d.ttl ? " ttl=" + d.ttl : "";
        console.log("  " + d.book + "/" + d.deck + " (" + kind + ttl + ")");
      }
      break;
    }

    case "deck": {
      await doDeck(yuta, positional.slice(1));
      break;
    }

    case "word": {
      await doWord(yuta, positional.slice(1));
      break;
    }

    case "stale": {
      const result = await yuta.sqlTag`SELECT * FROM yu.stale()` as any[];
      if (result.length === 0) {
        console.log("stale: nothing past its TTL — all fresh");
      } else {
        console.log("stale: " + result.length + " value(s) past their declared TTL:");
        for (const r of result) {
          const word = r.thread_word ? " (word: " + r.thread_word + ")" : "";
          console.log("  " + r.book + "/" + r.deck + "/" + r.id + " how=" + r.how + " age=" + r.age + " ttl=" + r.ttl + word);
        }
      }
      break;
    }

    default:
      console.error("Unknown command: " + cmd + ". Run 'yuta --help' for usage.");
      process.exit(1);
  }

  await yuta.close();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
