// client.ts — yutabase: thin wrapper over postgres.js
//
// Doctrine: SPEC.md §7 — "A thin wrapper over postgres.js (~500 lines):
// ref parser, UUIDv7, the YOUSPEAK compiler, and a sql tagged-template
// escape hatch that is always legal."
//
// Features:
// - Session-default claimant: set by once; every write inherits it
// - yuta hello: self-describing entrypoint
// - Connection string from the keychain (never reads plaintext .env)
// - Freshness banner per result

import postgres from "postgres";
import { execFileSync } from "node:child_process";
import {
  CANDIDATE_REVISION,
  CANDIDATE_VERSION,
} from "./install.js";
import { compile, explain, ident, type CompiledQuery } from "./youspeak.js";
import { uuidv7 } from "./uuidv7.js";
import {
  hasCandidateDynamicSurfaces,
  hasExactCandidateConstraintSurface,
  hasExactCandidateFunctionSurface,
  hasExactCoreColumnSurface,
  hasExactCoreIndexSurface,
  hasLegacyConstraintSurface,
  type CoreCatalogMode,
} from "./catalog.js";

export interface YutaOptions {
  connectionString?: string;
  claimant?: string;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  sql: string;
  freshness?: FreshnessBanner;
}

export interface FreshnessBanner {
  totalValues: number;
  cachedCount: number;
  computedCount: number;
  oldestCachedDays: number | null;
}

export class Yuta {
  private sql: ReturnType<typeof postgres>;
  private claimant: string | undefined;
  private candidateBindingCheck: Promise<void> | undefined;

  constructor(opts: YutaOptions = {}) {
    const connStr = opts.connectionString ?? this.getConnectionFromKeychain();
    this.sql = postgres(connStr, { max: 10 });
    this.claimant = opts.claimant;
  }

  // ──────────────────────────────────────────────────────────
  // §7 — session-default claimant
  // ──────────────────────────────────────────────────────────

  /** Set the default `by` for all writes. The true claim becomes the laziest claim. */
  setClaimant(who: string): void {
    if (who.trim() === "") throw new Error("CLAIMANT: by must be non-empty");
    this.claimant = who;
  }

  getClaimant(): string {
    if (!this.claimant || this.claimant.trim() === "") {
      throw new Error("CLAIMANT REQUIRED: pass claimant in Yuta options or call setClaimant before writing");
    }
    return this.claimant;
  }

  /** Refuse semantic operations unless the database is the exact candidate binding. */
  async assertCandidateBinding(): Promise<void> {
    this.candidateBindingCheck ??= this.checkCandidateBinding();
    return this.candidateBindingCheck;
  }

  // ──────────────────────────────────────────────────────────
  // §7 — yuta hello: self-describing entrypoint
  // ──────────────────────────────────────────────────────────

  /** A fresh agent session learns the entire standard from one call. */
  async hello(): Promise<HelloResult> {
    const metadata = await this.readStandardMetadata();
    if (metadata.versionSource === "database") await this.assertCandidateShape(metadata);
    const registryQuery = metadata.versionSource === "database"
      ? this.sql`
          SELECT book, deck, native, physical_schema, physical_table,
                 id_col, at_col, by_col, how_col, src_col
          FROM yu.registry
          ORDER BY book, deck
        `
      : this.sql`
          SELECT book, deck, native, book AS physical_schema,
                 deck AS physical_table, id_col, at_col, by_col, how_col, src_col
          FROM yu.registry
          ORDER BY book, deck
        `;
    const [lexicon, registry] = await Promise.all([
      this.sql`SELECT word, gloss, inverse, from_deck, to_deck, to_one, status FROM yu.lexicon ORDER BY word`,
      registryQuery,
    ]);

    return {
      standard: metadata.standard,
      profile: metadata.profile,
      version: metadata.version,
      revision: metadata.revision,
      capabilities: metadata.capabilities,
      versionSource: metadata.versionSource,
      creed: [
        "Straightforward — every primitive is a one-word rename of something Postgres already does well",
        "Organised — one place for vocabulary, one place for connections, one shape for every record's provenance",
        "Connected by words — a relation without a word does not exist",
      ],
      primitives: ["BOOK", "DECK", "CARD", "THREAD", "LEXICON"],
      honesty: {
        columns: ["at", "by", "how", "src"],
        claims: ["witnessed", "live", "cached", "computed", "declared"],
        rule: "No SQL defaults for how and by — a write that doesn't say is refused",
      },
      lexicon: lexicon as unknown as LexiconEntry[],
      decks: registry as unknown as RegistryEntry[],
      youspeak: [
        "hello                                              — the whole standard in one call",
        'card  tradein/submissions/<uuid>                   — one card by ref',
        'cards tradein/submissions where status="pending" newest 20',
        "tradein/submissions/<uuid> -> contains            — follow a word outward",
        "tradein/items/<uuid> <- contains                  — follow it inward",
        'thread <ref> --priced_from--> <ref> note "ebay comp" how computed src <ref>',
        "sever <thread-id> how witnessed                    — threads end with a claim",
      ],
      vocabularyGuidance: "The starter words are illustrative, not universal and not a word budget",
    };
  }

  // ──────────────────────────────────────────────────────────
  // query — run a YOUSPEAK string
  // ──────────────────────────────────────────────────────────

  async query(youspeak: string): Promise<QueryResult> {
    if (youspeak.trim() === "hello") {
      const hello = await this.hello();
      return { rows: [hello as unknown as Record<string, unknown>], sql: "-- yuta hello" };
    }

    await this.assertCandidateBinding();

    const compiled = compile(youspeak);
    const resolved = await this.resolveDeckQuery(compiled);
    const adjusted = this.injectClaimant(resolved.query);
    const rows = await (this.sql.unsafe as (sql: string, params: never[]) => Promise<unknown>)(adjusted.sql, adjusted.params as never[]);

    let rowsArray = rows as unknown as Record<string, unknown>[];
    if (resolved.mapping) rowsArray = normalizeMappedRows(rowsArray, resolved.mapping);

    // Enrich traversal results with card names
    if (rowsArray.length > 0 && rowsArray[0].book && rowsArray[0].deck && rowsArray[0].id) {
      rowsArray = await this.enrichCards(rowsArray);
    }

    const freshness = this.computeFreshness(rowsArray);

    return { rows: rowsArray, sql: adjusted.sql, freshness };
  }

  // ──────────────────────────────────────────────────────────
  // §8 — explain logical compiler SQL (registry resolution is connected)
  // ──────────────────────────────────────────────────────────

  explain(youspeak: string): string {
    return explain(youspeak);
  }

  // ──────────────────────────────────────────────────────────
  // §7 — sql tagged-template escape hatch (always legal)
  // ──────────────────────────────────────────────────────────

  async sqlTag(strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]> {
    const fn = this.sql as unknown as (s: TemplateStringsArray, ...v: never[]) => Promise<unknown>;
    const result = await fn(strings, ...values as never[]);
    return result as unknown as Record<string, unknown>[];
  }

  /** Run raw SQL (for dynamic DDL that can't use tagged templates). */
  async exec(sqlText: string): Promise<Record<string, unknown>[]> {
    const fn = this.sql.unsafe as unknown as (s: string) => Promise<unknown>;
    const result = await fn(sqlText);
    return result as unknown as Record<string, unknown>[];
  }

  /** Execute trusted operator DDL as one PostgreSQL transaction. */
  async execTransaction(statements: readonly string[]): Promise<void> {
    if (statements.length === 0) return;
    await this.sql.begin(async (tx) => {
      for (const statement of statements) await tx.unsafe(statement);
    });
  }

  // ──────────────────────────────────────────────────────────
  // convenience methods
  // ──────────────────────────────────────────────────────────

  async card(ref: string): Promise<Record<string, unknown> | null> {
    const result = await this.query(`card ${ref}`);
    return result.rows[0] ?? null;
  }

  async traverse(ref: string, direction: "->" | "<-", word: string): Promise<Record<string, unknown>[]> {
    const result = await this.query(`${ref} ${direction} ${word}`);
    return result.rows;
  }

  async thread(
    from: string,
    word: string,
    to: string,
    how: string,
    opts: { note?: string; src?: string[] } = {}
  ): Promise<Record<string, unknown>> {
    let q = `thread ${from} --${word}--> ${to}`;
    if (opts.note) q += ` note "${opts.note}"`;
    q += ` how ${how}`;
    if (opts.src) q += ` src ${opts.src.join(" ")}`;
    const result = await this.query(q);
    return result.rows[0];
  }

  async sever(threadId: string, how: string, src?: string[]): Promise<void> {
    let q = `sever ${threadId} how ${how}`;
    if (src) q += ` src ${src.join(" ")}`;
    await this.query(q);
  }

  // ──────────────────────────────────────────────────────────
  // UUIDv7 generation
  // ──────────────────────────────────────────────────────────

  uuid(): string {
    return uuidv7();
  }

  // ──────────────────────────────────────────────────────────
  // enrich — join card refs to their card tables for names
  // ──────────────────────────────────────────────────────────

  private async enrichCards(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    // Collect logical book/deck pairs and only the IDs present in this result.
    const pairs = new Map<string, { book: string; deck: string; ids: Set<string> }>();
    for (const r of rows) {
      if (typeof r.book !== "string" || typeof r.deck !== "string" || typeof r.id !== "string") continue;
      const key = JSON.stringify([r.book, r.deck]);
      const pair = pairs.get(key) ?? { book: r.book, deck: r.deck, ids: new Set<string>() };
      pair.ids.add(r.id);
      pairs.set(key, pair);
    }

    // Resolve logical refs through the registry. Never interpolate names read
    // from rows until the core identifier grammar has accepted them.
    const nameMap = new Map<string, string>();
    for (const pair of pairs.values()) {
      const mappings = await this.sql`
        SELECT physical_schema, physical_table, id_col
        FROM yu.registry
        WHERE book = ${pair.book} AND deck = ${pair.deck}
      `;
      const mapping = mappings[0] as Record<string, unknown> | undefined;
      if (!mapping) continue;

      const physicalSchema = requireIdentifier(mapping.physical_schema, "registry physical_schema");
      const physicalTable = requireIdentifier(mapping.physical_table, "registry physical_table");
      const idColumn = requireIdentifier(mapping.id_col, "registry id_col");

      const nameColumns = await this.sql`
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = ${physicalSchema}
          AND table_name = ${physicalTable}
          AND column_name = 'name'
        LIMIT 1
      `;
      if (nameColumns.length === 0) continue;

      const query = `
        SELECT ${ident(idColumn)}::text AS id, ${ident("name")}::text AS name
        FROM ${ident(physicalSchema)}.${ident(physicalTable)}
        WHERE ${ident(idColumn)}::text = ANY($1::text[])
      `;
      const cards = await this.sql.unsafe(query, [[...pair.ids]]);
      for (const card of cards) {
        if (typeof card.id === "string" && typeof card.name === "string") {
          nameMap.set(cardKey(pair.book, pair.deck, card.id), card.name);
        }
      }
    }

    // Enrich rows with names
    return rows.map((r) => ({
      ...r,
      name: typeof r.book === "string" && typeof r.deck === "string" && typeof r.id === "string"
        ? (nameMap.get(cardKey(r.book, r.deck, r.id)) ?? null)
        : null,
      ref: r.book && r.deck && r.id ? `${r.book}/${r.deck}/${r.id}` : null,
    }));
  }

  // ──────────────────────────────────────────────────────────
  // close
  // ──────────────────────────────────────────────────────────

  async close(): Promise<void> {
    await this.sql.end();
  }

  // ──────────────────────────────────────────────────────────
  // internal
  // ──────────────────────────────────────────────────────────

  private injectClaimant(compiled: CompiledQuery): CompiledQuery {
    const params = compiled.params.map((p) => (p === "__CLAIMANT__" ? this.getClaimant() : p));
    return { ...compiled, params };
  }

  private async resolveDeckQuery(compiled: CompiledQuery): Promise<ResolvedDeckQuery> {
    if (!compiled.deckTarget) return { query: compiled };

    const { book, deck } = compiled.deckTarget;
    const mappings = await this.sql`
      SELECT physical_schema, physical_table, id_col, at_col, by_col, how_col, src_col
      FROM yu.registry
      WHERE book = ${book} AND deck = ${deck}
    `;
    if (mappings.length !== 1) throw new Error(`UNREGISTERED DECK: ${book}/${deck}`);

    const row = mappings[0] as Record<string, unknown>;
    const mapping: DeckMapping = {
      physicalSchema: requireIdentifier(row.physical_schema, "registry physical_schema"),
      physicalTable: requireIdentifier(row.physical_table, "registry physical_table"),
      idColumn: requireIdentifier(row.id_col, "registry id_col"),
      atColumn: requireIdentifier(row.at_col, "registry at_col"),
      byColumn: requireIdentifier(row.by_col, "registry by_col"),
      howColumn: requireIdentifier(row.how_col, "registry how_col"),
      srcColumn: requireIdentifier(row.src_col, "registry src_col"),
    };

    const logicalTable = `${ident(book)}.${ident(deck)}`;
    if (!compiled.sql.includes(logicalTable)) {
      throw new Error(`COMPILER CONTRACT: missing logical table ${book}/${deck}`);
    }

    // Hide the table token while remapping canonical column identifiers. A
    // physical schema named `id`, for example, must not be mistaken for the
    // logical card identifier column.
    const tableToken = "__YUTABASE_RESOLVED_TABLE__";
    let sql = compiled.sql.replace(logicalTable, tableToken);
    const columnTokens = mappedColumns(mapping).map(([logical, physical], index) => ({
      logical,
      physical,
      token: `__YUTABASE_RESOLVED_COLUMN_${index}__`,
    }));
    for (const column of columnTokens) {
      sql = sql.replaceAll(ident(column.logical), column.token);
    }
    for (const column of columnTokens) {
      sql = sql.replaceAll(column.token, ident(column.physical));
    }
    sql = sql.replace(tableToken, `${ident(mapping.physicalSchema)}.${ident(mapping.physicalTable)}`);

    return { query: { ...compiled, sql }, mapping };
  }

  private async checkCandidateBinding(): Promise<void> {
    const metadata = await this.readStandardMetadata();
    if (metadata.versionSource === "legacy_fallback") {
      throw new Error(
        `UNSUPPORTED YUTABASE IDENTITY: ${metadata.version}; run yuta init to apply the candidate upgrade`,
      );
    }
    await this.assertCandidateShape(metadata);
  }

  private async assertCandidateShape(metadata: StandardMetadata): Promise<void> {
    assertCandidateMetadata(metadata);
    const [
      hasExactColumns,
      hasLegacyIntegrity,
      hasExactCandidateConstraints,
      hasCandidateObjects,
      hasDynamicSurfaces,
    ] = await Promise.all([
      hasExactCoreColumnSurface(this.sql, "candidate"),
      this.hasLegacyIntegrity("candidate"),
      hasExactCandidateConstraintSurface(this.sql),
      this.hasCandidateObjects(),
      hasCandidateDynamicSurfaces(this.sql),
    ]);
    if (
      !hasExactColumns ||
      !hasLegacyIntegrity ||
      !hasExactCandidateConstraints ||
      !hasDynamicSurfaces
    ) {
      throw new Error("PARTIAL YUTABASE INSTALL: candidate base integrity does not match revision 4");
    }
    if (!hasCandidateObjects) {
      throw new Error("PARTIAL YUTABASE INSTALL: candidate functions, triggers, or roles are incomplete");
    }
  }

  private async hasLegacyIntegrity(mode: CoreCatalogMode): Promise<boolean> {
    const [rows, hasExactConstraints, hasExactIndexes] = await Promise.all([
      this.sql`
      SELECT
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
        ) AS complete
      `,
      hasLegacyConstraintSurface(this.sql),
      hasExactCoreIndexSurface(this.sql, mode),
    ]);
    return rows[0]?.complete === true && hasExactConstraints && hasExactIndexes;
  }

  private async hasCandidateObjects(): Promise<boolean> {
    const [rows, hasExactFunctions] = await Promise.all([
      this.sql`
      SELECT
        to_regnamespace('via') IS NOT NULL
        AND to_regclass('yu.thread_ids') IS NOT NULL
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
        ) AS complete
      `,
      hasExactCandidateFunctionSurface(this.sql),
    ]);
    return rows[0]?.complete === true && hasExactFunctions;
  }

  private async readStandardMetadata(): Promise<StandardMetadata> {
    const presence = await this.sql`
      SELECT
        to_regclass('yu.standard_meta') IS NOT NULL AS present,
        to_regnamespace('via') IS NOT NULL AS has_via_schema,
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
        ) AS has_candidate_footprint_objects
    `;
    if (presence[0]?.present !== true) {
      const [hasExactColumns, hasLegacyIntegrity] = await Promise.all([
        hasExactCoreColumnSurface(this.sql, "legacy"),
        this.hasLegacyIntegrity("legacy"),
      ]);
      if (
        !hasExactColumns ||
        presence[0]?.has_via_schema !== true ||
        !hasLegacyIntegrity ||
        presence[0]?.has_candidate_footprint_objects === true
      ) {
        throw new Error("PARTIAL YUTABASE INSTALL: metadata is absent but the shape is not the exact legacy core");
      }
      return {
        standard: "YUTABASE",
        profile: "postgres",
        version: "0.1.0-legacy",
        // Original v0.1 had no database revision stamp. Zero is the explicit
        // sentinel for an unstamped legacy binding, never an inferred revision.
        revision: 0,
        capabilities: [],
        versionSource: "legacy_fallback",
      };
    }

    const rows = await this.sql`
      SELECT standard, profile, version, revision, capabilities
      FROM yu.standard_meta
      WHERE singleton = true
    `;
    if (rows.length !== 1) {
      throw new Error("CORRUPT STANDARD META: expected exactly one singleton row");
    }
    const row = rows[0] as Record<string, unknown>;
    if (
      row.standard !== "YUTABASE" ||
      typeof row.profile !== "string" ||
      typeof row.version !== "string" ||
      typeof row.revision !== "number" ||
      !Array.isArray(row.capabilities) ||
      !row.capabilities.every((value) => typeof value === "string")
    ) {
      throw new Error("CORRUPT STANDARD META: singleton row has an invalid identity");
    }
    return {
      standard: row.standard,
      profile: row.profile,
      version: row.version,
      revision: row.revision,
      capabilities: row.capabilities as string[],
      versionSource: "database",
    };
  }

  private computeFreshness(rows: Record<string, unknown>[]): FreshnessBanner | undefined {
    let totalValues = 0;
    let cachedCount = 0;
    let computedCount = 0;
    let oldestAt: Date | null = null;

    for (const row of rows) {
      if (typeof row.how === "string") {
        totalValues++;
        if (row.how === "cached") cachedCount++;
        if (row.how === "computed") computedCount++;
      }
      if (row.how === "cached" && row.at) {
        const at = new Date(row.at as string);
        if (!oldestAt || at < oldestAt) oldestAt = at;
      }
    }

    if (totalValues === 0) return undefined;

    const oldestCachedDays = oldestAt
      ? Math.floor((Date.now() - oldestAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      totalValues,
      cachedCount,
      computedCount,
      oldestCachedDays,
    };
  }

  private getConnectionFromKeychain(): string {
    // SPEC §7: "the client shells out to security find-generic-password
    // -s yutabase-url; it never reads a plaintext .env"
    try {
      const url = execFileSync(
        "security",
        ["find-generic-password", "-s", "yutabase-url", "-w"],
        { encoding: "utf-8" },
      ).trim();
      if (!url) throw new Error("empty keychain entry");
      return url;
    } catch {
      throw new Error(
        "CONNECTION: no yutabase-url found in keychain. Set it with:\n" +
        "  security add-generic-password -s yutabase-url -w 'postgresql://...'\n" +
        "Or pass connectionString in options."
      );
    }
  }
}

// ──────────────────────────────────────────────────────────
// types
// ──────────────────────────────────────────────────────────

export interface HelloResult {
  standard: string;
  profile: string;
  version: string;
  revision: number;
  capabilities: string[];
  versionSource: "database" | "legacy_fallback";
  creed: string[];
  primitives: string[];
  honesty: {
    columns: string[];
    claims: string[];
    rule: string;
  };
  lexicon: LexiconEntry[];
  decks: RegistryEntry[];
  youspeak: string[];
  vocabularyGuidance: string;
}

export interface LexiconEntry {
  word: string;
  gloss: string;
  inverse: string;
  from_deck: string;
  to_deck: string;
  to_one: boolean;
  status: string;
}

export interface RegistryEntry {
  book: string;
  deck: string;
  native: boolean;
  physical_schema: string;
  physical_table: string;
  id_col: string;
  at_col: string;
  by_col: string;
  how_col: string;
  src_col: string;
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`CORRUPT ${label}: expected a non-empty identifier`);
  }
  ident(value);
  return value;
}

function cardKey(book: string, deck: string, id: string): string {
  return JSON.stringify([book, deck, id]);
}

interface DeckMapping {
  physicalSchema: string;
  physicalTable: string;
  idColumn: string;
  atColumn: string;
  byColumn: string;
  howColumn: string;
  srcColumn: string;
}

interface ResolvedDeckQuery {
  query: CompiledQuery;
  mapping?: DeckMapping;
}

function mappedColumns(mapping: DeckMapping): Array<[string, string]> {
  return [
    ["id", mapping.idColumn],
    ["at", mapping.atColumn],
    ["by", mapping.byColumn],
    ["how", mapping.howColumn],
    ["src", mapping.srcColumn],
  ];
}

function normalizeMappedRows(
  rows: Record<string, unknown>[],
  mapping: DeckMapping,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const normalized = { ...row };
    for (const [logical, physical] of mappedColumns(mapping)) {
      if (Object.prototype.hasOwnProperty.call(row, physical)) normalized[logical] = row[physical];
    }
    return normalized;
  });
}

interface StandardMetadata {
  standard: "YUTABASE";
  profile: string;
  version: string;
  revision: number;
  capabilities: string[];
  versionSource: "database" | "legacy_fallback";
}

function assertCandidateMetadata(metadata: StandardMetadata): void {
  if (
    metadata.profile !== "postgres" ||
    metadata.version !== CANDIDATE_VERSION ||
    metadata.revision !== CANDIDATE_REVISION
  ) {
    throw new Error(
      `UNSUPPORTED YUTABASE IDENTITY: ${metadata.standard}/${metadata.profile}` +
      `@${metadata.version} revision ${metadata.revision}`,
    );
  }
}
