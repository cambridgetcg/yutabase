import type postgres from "postgres";

type Database = ReturnType<typeof postgres>;

export type CoreCatalogMode = "legacy" | "candidate";

interface CoreColumnContract {
  [key: string]: string | number | boolean | null;
  tableName: string;
  columnName: string;
  attnum: number;
  typeName: string;
  notNull: boolean;
  identity: "" | "a";
  defaultExpression: string | null;
}

function coreColumn(
  tableName: string,
  attnum: number,
  columnName: string,
  typeName: string,
  notNull: boolean,
  defaultExpression: string | null = null,
  identity: "" | "a" = "",
): CoreColumnContract {
  return {
    tableName,
    columnName,
    attnum,
    typeName,
    notNull,
    identity,
    defaultExpression,
  };
}

/** The complete, ordered column surface created by the original v0.1 SQL. */
const LEGACY_CORE_COLUMN_CONTRACT: readonly CoreColumnContract[] = Object.freeze([
  coreColumn("lexicon", 1, "word", "text", true),
  coreColumn("lexicon", 2, "gloss", "text", true),
  coreColumn("lexicon", 3, "inverse", "text", true),
  coreColumn("lexicon", 4, "from_deck", "text", true),
  coreColumn("lexicon", 5, "to_deck", "text", true),
  coreColumn("lexicon", 6, "to_one", "boolean", true, "false"),
  coreColumn("lexicon", 7, "ttl", "interval", false),
  coreColumn("lexicon", 8, "status", "text", true, "'live'::text"),
  coreColumn("lexicon", 9, "at", "timestamptz", true),
  coreColumn("lexicon", 10, "by", "text", true),
  coreColumn("lexicon", 11, "how", "text", true),
  coreColumn("lexicon", 12, "src", "text[]", false),

  coreColumn("lexicon_versions", 1, "version_id", "bigint", true, null, "a"),
  coreColumn("lexicon_versions", 2, "word", "text", true),
  coreColumn("lexicon_versions", 3, "gloss", "text", true),
  coreColumn("lexicon_versions", 4, "inverse", "text", true),
  coreColumn("lexicon_versions", 5, "changed_at", "timestamptz", true, "now()"),
  coreColumn("lexicon_versions", 6, "changed_by", "text", true),

  coreColumn("registry", 1, "book", "text", true),
  coreColumn("registry", 2, "deck", "text", true),
  coreColumn("registry", 3, "id_col", "text", true, "'id'::text"),
  coreColumn("registry", 4, "at_col", "text", true, "'at'::text"),
  coreColumn("registry", 5, "by_col", "text", true, "'by'::text"),
  coreColumn("registry", 6, "how_col", "text", true, "'how'::text"),
  coreColumn("registry", 7, "src_col", "text", true, "'src'::text"),
  coreColumn("registry", 8, "ttl", "interval", false),
  coreColumn("registry", 9, "native", "boolean", true, "true"),
  coreColumn("registry", 10, "at", "timestamptz", true, "now()"),
  coreColumn("registry", 11, "by", "text", true),

  coreColumn("threads", 1, "id", "uuid", true),
  coreColumn("threads", 2, "word", "text", true),
  coreColumn("threads", 3, "from_book", "text", true),
  coreColumn("threads", 4, "from_deck", "text", true),
  coreColumn("threads", 5, "from_id", "uuid", true),
  coreColumn("threads", 6, "to_book", "text", true),
  coreColumn("threads", 7, "to_deck", "text", true),
  coreColumn("threads", 8, "to_id", "uuid", true),
  coreColumn("threads", 9, "note", "text", false),
  coreColumn("threads", 10, "at", "timestamptz", true),
  coreColumn("threads", 11, "by", "text", true),
  coreColumn("threads", 12, "how", "text", true),
  coreColumn("threads", 13, "src", "text[]", false),

  coreColumn("sever_log", 1, "id", "uuid", true),
  coreColumn("sever_log", 2, "word", "text", true),
  coreColumn("sever_log", 3, "from_book", "text", true),
  coreColumn("sever_log", 4, "from_deck", "text", true),
  coreColumn("sever_log", 5, "from_id", "uuid", true),
  coreColumn("sever_log", 6, "to_book", "text", true),
  coreColumn("sever_log", 7, "to_deck", "text", true),
  coreColumn("sever_log", 8, "to_id", "uuid", true),
  coreColumn("sever_log", 9, "note", "text", false),
  coreColumn("sever_log", 10, "at", "timestamptz", true, "now()"),
  coreColumn("sever_log", 11, "by", "text", true),
  coreColumn("sever_log", 12, "how", "text", true),
  coreColumn("sever_log", 13, "src", "text[]", false),
]);

const CANDIDATE_ONLY_COLUMN_CONTRACT: readonly CoreColumnContract[] = Object.freeze([
  coreColumn("standard_meta", 1, "singleton", "boolean", true, "true"),
  coreColumn("standard_meta", 2, "standard", "text", true),
  coreColumn("standard_meta", 3, "profile", "text", true),
  coreColumn("standard_meta", 4, "version", "text", true),
  coreColumn("standard_meta", 5, "revision", "integer", true),
  coreColumn("standard_meta", 6, "capabilities", "text[]", true, "'{}'::text[]"),
  coreColumn("standard_meta", 7, "installed_at", "timestamptz", true, "clock_timestamp()"),
  coreColumn("standard_meta", 8, "upgraded_at", "timestamptz", true, "clock_timestamp()"),

  coreColumn("lexicon", 13, "current_version", "integer", true, "1"),

  coreColumn("word_versions", 1, "word", "text", true),
  coreColumn("word_versions", 2, "word_version", "integer", true),
  coreColumn("word_versions", 3, "gloss", "text", true),
  coreColumn("word_versions", 4, "inverse", "text", true),
  coreColumn("word_versions", 5, "from_deck", "text", true),
  coreColumn("word_versions", 6, "to_deck", "text", true),
  coreColumn("word_versions", 7, "to_one", "boolean", true),
  coreColumn("word_versions", 8, "ttl", "interval", false),
  coreColumn("word_versions", 9, "status", "text", true),
  coreColumn("word_versions", 10, "at", "timestamptz", true),
  coreColumn("word_versions", 11, "by", "text", true),
  coreColumn("word_versions", 12, "how", "text", true),
  coreColumn("word_versions", 13, "src", "text[]", false),
  coreColumn("word_versions", 14, "recorded_at", "timestamptz", true, "clock_timestamp()"),

  coreColumn("registry", 12, "physical_schema", "text", true),
  coreColumn("registry", 13, "physical_table", "text", true),

  coreColumn("threads", 14, "word_version", "integer", true),
  coreColumn("threads", 15, "word_to_one", "boolean", true),

  coreColumn("thread_ids", 1, "id", "uuid", true),

  coreColumn("sever_log", 14, "word_version", "integer", true),
  coreColumn("sever_log", 15, "word_to_one", "boolean", true),
  coreColumn("sever_log", 16, "thread_at", "timestamptz", false),
  coreColumn("sever_log", 17, "thread_by", "text", false),
  coreColumn("sever_log", 18, "thread_how", "text", false),
  coreColumn("sever_log", 19, "thread_src", "text[]", false),
]);

const CANDIDATE_CORE_COLUMN_CONTRACT: readonly CoreColumnContract[] = Object.freeze([
  ...LEGACY_CORE_COLUMN_CONTRACT,
  ...CANDIDATE_ONLY_COLUMN_CONTRACT,
]);

interface CoreIndexContract {
  [key: string]: string | number | boolean;
  indexName: string;
  tableName: string;
  definition: string;
  unique: boolean;
  primary: boolean;
  keyCount: number;
}

const LEGACY_CORE_INDEX_CONTRACT: readonly CoreIndexContract[] = Object.freeze([
  {
    indexName: "lexicon_pkey",
    tableName: "lexicon",
    definition: "CREATE UNIQUE INDEX lexicon_pkey ON yu.lexicon USING btree (word)",
    unique: true,
    primary: true,
    keyCount: 1,
  },
  {
    indexName: "lexicon_versions_pkey",
    tableName: "lexicon_versions",
    definition: "CREATE UNIQUE INDEX lexicon_versions_pkey ON yu.lexicon_versions USING btree (version_id)",
    unique: true,
    primary: true,
    keyCount: 1,
  },
  {
    indexName: "registry_pkey",
    tableName: "registry",
    definition: "CREATE UNIQUE INDEX registry_pkey ON yu.registry USING btree (book, deck)",
    unique: true,
    primary: true,
    keyCount: 2,
  },
  {
    indexName: "threads_pkey",
    tableName: "threads",
    definition: "CREATE UNIQUE INDEX threads_pkey ON yu.threads USING btree (id)",
    unique: true,
    primary: true,
    keyCount: 1,
  },
  {
    indexName: "threads_word_from_book_from_deck_from_id_to_book_to_deck_to_key",
    tableName: "threads",
    definition: "CREATE UNIQUE INDEX threads_word_from_book_from_deck_from_id_to_book_to_deck_to_key ON yu.threads USING btree (word, from_book, from_deck, from_id, to_book, to_deck, to_id)",
    unique: true,
    primary: false,
    keyCount: 7,
  },
  {
    indexName: "threads_out",
    tableName: "threads",
    definition: "CREATE INDEX threads_out ON yu.threads USING btree (word, from_book, from_deck, from_id)",
    unique: false,
    primary: false,
    keyCount: 4,
  },
  {
    indexName: "threads_in",
    tableName: "threads",
    definition: "CREATE INDEX threads_in ON yu.threads USING btree (word, to_book, to_deck, to_id)",
    unique: false,
    primary: false,
    keyCount: 4,
  },
  {
    indexName: "sever_log_pkey",
    tableName: "sever_log",
    definition: "CREATE UNIQUE INDEX sever_log_pkey ON yu.sever_log USING btree (id)",
    unique: true,
    primary: true,
    keyCount: 1,
  },
]);

const CANDIDATE_ONLY_INDEX_CONTRACT: readonly CoreIndexContract[] = Object.freeze([
  {
    indexName: "standard_meta_pkey",
    tableName: "standard_meta",
    definition: "CREATE UNIQUE INDEX standard_meta_pkey ON yu.standard_meta USING btree (singleton)",
    unique: true,
    primary: true,
    keyCount: 1,
  },
  {
    indexName: "word_versions_pkey",
    tableName: "word_versions",
    definition: "CREATE UNIQUE INDEX word_versions_pkey ON yu.word_versions USING btree (word, word_version)",
    unique: true,
    primary: true,
    keyCount: 2,
  },
  {
    indexName: "registry_physical_table_unique",
    tableName: "registry",
    definition: "CREATE UNIQUE INDEX registry_physical_table_unique ON yu.registry USING btree (physical_schema, physical_table)",
    unique: true,
    primary: false,
    keyCount: 2,
  },
  {
    indexName: "thread_ids_pkey",
    tableName: "thread_ids",
    definition: "CREATE UNIQUE INDEX thread_ids_pkey ON yu.thread_ids USING btree (id)",
    unique: true,
    primary: true,
    keyCount: 1,
  },
  {
    indexName: "threads_to_one_active",
    tableName: "threads",
    definition: "CREATE UNIQUE INDEX threads_to_one_active ON yu.threads USING btree (word, from_book, from_deck, from_id) WHERE word_to_one",
    unique: true,
    primary: false,
    keyCount: 4,
  },
]);

const CANDIDATE_CORE_INDEX_CONTRACT: readonly CoreIndexContract[] = Object.freeze([
  ...LEGACY_CORE_INDEX_CONTRACT,
  ...CANDIDATE_ONLY_INDEX_CONTRACT,
]);

interface CandidateFunctionContract {
  [key: string]: string | boolean | readonly string[] | null;
  signature: string;
  securityDefiner: boolean;
  config: readonly string[] | null;
}

const SAFE_SEARCH_PATH = "search_path=pg_catalog, yu, pg_temp";
const RLS_OFF = "row_security=off";

const CANDIDATE_FUNCTION_CONTRACT: readonly CandidateFunctionContract[] = Object.freeze([
  { signature: "yu._begin_word_insert()", securityDefiner: false, config: null },
  { signature: "yu._begin_word_version()", securityDefiner: true, config: [SAFE_SEARCH_PATH, RLS_OFF] },
  { signature: "yu._capture_word_version()", securityDefiner: true, config: [SAFE_SEARCH_PATH, RLS_OFF] },
  { signature: "yu._card_exists(text,text,uuid)", securityDefiner: false, config: [SAFE_SEARCH_PATH] },
  { signature: "yu._card_lock_key(text,text,uuid)", securityDefiner: false, config: null },
  { signature: "yu._deck_matches(text,text,text)", securityDefiner: false, config: null },
  { signature: "yu._guard_delete()", securityDefiner: true, config: [SAFE_SEARCH_PATH, RLS_OFF] },
  { signature: "yu._lock_thread_context(text,text,text,uuid,text,text,uuid)", securityDefiner: true, config: [SAFE_SEARCH_PATH, RLS_OFF] },
  { signature: "yu._refuse_sever_log_mutation()", securityDefiner: false, config: null },
  { signature: "yu._refuse_thread_mutation()", securityDefiner: false, config: null },
  { signature: "yu._refuse_word_version_mutation()", securityDefiner: false, config: null },
  { signature: "yu._registry_referenced_ids(text,text)", securityDefiner: true, config: [SAFE_SEARCH_PATH, RLS_OFF] },
  { signature: "yu._reserve_thread_id()", securityDefiner: true, config: [SAFE_SEARCH_PATH, RLS_OFF] },
  { signature: "yu._validate_registry_mapping()", securityDefiner: false, config: [SAFE_SEARCH_PATH] },
  { signature: "yu._validate_thread()", securityDefiner: false, config: [SAFE_SEARCH_PATH] },
  { signature: "yu._version_gloss()", securityDefiner: true, config: [SAFE_SEARCH_PATH, RLS_OFF] },
  { signature: "yu.doctor()", securityDefiner: false, config: null },
  { signature: "yu.refresh_via()", securityDefiner: true, config: [SAFE_SEARCH_PATH, RLS_OFF] },
  { signature: "yu.sever(uuid,text,text,text[])", securityDefiner: true, config: [SAFE_SEARCH_PATH, RLS_OFF] },
  { signature: "yu.stale()", securityDefiner: false, config: null },
]);

/**
 * Verify the exact migration-defined columns for an unstamped legacy base or
 * a stamped revision-4 binding. The probe uses catalog state rather than
 * information_schema so executable drift cannot hide behind compatible names.
 */
export async function hasExactCoreColumnSurface(
  sql: Database,
  mode: CoreCatalogMode,
): Promise<boolean> {
  const expected = mode === "legacy"
    ? LEGACY_CORE_COLUMN_CONTRACT
    : CANDIDATE_CORE_COLUMN_CONTRACT;

  return sql.begin(async (tx) => {
    await tx`SET LOCAL row_security = off`;
    await tx`SET LOCAL search_path = pg_catalog`;

    const rows = await tx`
      WITH expected AS (
        SELECT
          item->>'tableName' AS table_name,
          item->>'columnName' AS column_name,
          (item->>'attnum')::smallint AS attnum,
          item->>'typeName' AS type_name,
          (item->>'notNull')::boolean AS not_null,
          item->>'identity' AS identity,
          item->>'defaultExpression' AS default_expression
        FROM pg_catalog.jsonb_array_elements(${tx.json([...expected])}) AS items(item)
      ),
      expected_tables AS (
        SELECT DISTINCT table_name FROM expected
      ),
      actual_tables AS (
        SELECT c.oid, c.relname
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN expected_tables e ON e.table_name = c.relname
        WHERE n.nspname = 'yu'
      )
      SELECT
        (
          SELECT count(*)
          FROM pg_catalog.pg_attribute a
          JOIN actual_tables t ON t.oid = a.attrelid
          WHERE a.attnum > 0
        ) = (SELECT count(*) FROM expected)
        AND (
          SELECT count(*)
          FROM pg_catalog.pg_attrdef d
          JOIN actual_tables t ON t.oid = d.adrelid
        ) = (SELECT count(*) FROM expected WHERE default_expression IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1
          FROM expected e
          LEFT JOIN actual_tables relation ON relation.relname = e.table_name
          LEFT JOIN pg_catalog.pg_attribute a
            ON a.attrelid = relation.oid AND a.attnum = e.attnum
          LEFT JOIN pg_catalog.pg_type type_definition
            ON type_definition.oid = e.type_name::regtype
          LEFT JOIN pg_catalog.pg_attrdef d
            ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE a.attname IS DISTINCT FROM e.column_name
             OR a.atttypid IS DISTINCT FROM e.type_name::regtype
             OR a.atttypmod IS DISTINCT FROM -1
             OR a.attnotnull IS DISTINCT FROM e.not_null
             OR a.attidentity IS DISTINCT FROM e.identity::"char"
             OR a.attgenerated IS DISTINCT FROM ''::"char"
             OR a.attcollation IS DISTINCT FROM type_definition.typcollation
             OR a.attisdropped IS DISTINCT FROM false
             OR a.attislocal IS DISTINCT FROM true
             OR a.attinhcount IS DISTINCT FROM 0
             OR pg_catalog.pg_get_expr(d.adbin, d.adrelid, false)
                  IS DISTINCT FROM e.default_expression
        )
        AND pg_catalog.pg_get_serial_sequence(
              'yu.lexicon_versions', 'version_id'
            ) IS NOT DISTINCT FROM 'yu.lexicon_versions_version_id_seq'
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.pg_class sequence_relation
          JOIN pg_catalog.pg_namespace sequence_namespace
            ON sequence_namespace.oid = sequence_relation.relnamespace
          JOIN pg_catalog.pg_sequence sequence_state
            ON sequence_state.seqrelid = sequence_relation.oid
          JOIN pg_catalog.pg_class owning_table
            ON owning_table.oid = to_regclass('yu.lexicon_versions')
          WHERE sequence_namespace.nspname = 'yu'
            AND sequence_relation.relname = 'lexicon_versions_version_id_seq'
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
        AND (
          SELECT count(*)
          FROM pg_catalog.pg_depend dependency
          WHERE dependency.classid = 'pg_catalog.pg_class'::regclass
            AND dependency.objid = to_regclass('yu.lexicon_versions_version_id_seq')
            AND dependency.deptype = 'i'
        ) = 1
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.pg_depend dependency
          WHERE dependency.classid = 'pg_catalog.pg_class'::regclass
            AND dependency.objid = to_regclass('yu.lexicon_versions_version_id_seq')
            AND dependency.refclassid = 'pg_catalog.pg_class'::regclass
            AND dependency.refobjid = to_regclass('yu.lexicon_versions')
            AND dependency.refobjsubid = 1
            AND dependency.deptype = 'i'
        ) AS complete
    `;

    return rows[0]?.complete === true;
  });
}

/** Verify the exact index surface belonging to the selected core revision. */
export async function hasExactCoreIndexSurface(
  sql: Database,
  mode: CoreCatalogMode,
): Promise<boolean> {
  const expected = mode === "legacy"
    ? LEGACY_CORE_INDEX_CONTRACT
    : CANDIDATE_CORE_INDEX_CONTRACT;
  const expectedColumns = mode === "legacy"
    ? LEGACY_CORE_COLUMN_CONTRACT
    : CANDIDATE_CORE_COLUMN_CONTRACT;
  const tableNames = [
    ...new Set(expectedColumns.map((column) => column.tableName)),
  ];

  return sql.begin(async (tx) => {
    await tx`SET LOCAL row_security = off`;
    await tx`SET LOCAL search_path = pg_catalog`;

    const rows = await tx`
      WITH expected AS (
        SELECT
          item->>'indexName' AS index_name,
          item->>'tableName' AS table_name,
          item->>'definition' AS definition,
          (item->>'unique')::boolean AS is_unique,
          (item->>'primary')::boolean AS is_primary,
          (item->>'keyCount')::smallint AS key_count
        FROM pg_catalog.jsonb_array_elements(${tx.json([...expected])}) AS items(item)
      ),
      expected_tables AS (
        SELECT value #>> '{}' AS table_name
        FROM pg_catalog.jsonb_array_elements(${tx.json(tableNames)})
      ),
      actual_tables AS (
        SELECT c.oid, c.relname
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN expected_tables e ON e.table_name = c.relname
        WHERE n.nspname = 'yu'
      )
      SELECT
        (
          SELECT count(*)
          FROM pg_catalog.pg_index i
          JOIN actual_tables t ON t.oid = i.indrelid
        ) = (SELECT count(*) FROM expected)
        AND NOT EXISTS (
          SELECT 1
          FROM expected e
          LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = 'yu'
          LEFT JOIN pg_catalog.pg_class index_relation
            ON index_relation.relnamespace = n.oid
           AND index_relation.relname = e.index_name
          LEFT JOIN pg_catalog.pg_index i ON i.indexrelid = index_relation.oid
          LEFT JOIN actual_tables table_relation
            ON table_relation.relname = e.table_name
          WHERE index_relation.oid IS NULL
             OR index_relation.relkind <> 'i'
             OR index_relation.relpersistence <> 'p'
             OR i.indrelid IS DISTINCT FROM table_relation.oid
             OR i.indisunique IS DISTINCT FROM e.is_unique
             OR i.indisprimary IS DISTINCT FROM e.is_primary
             OR i.indisexclusion
             OR NOT i.indimmediate
             OR NOT i.indisvalid
             OR NOT i.indisready
             OR NOT i.indislive
             OR i.indisclustered
             OR i.indisreplident
             OR i.indcheckxmin
             OR i.indnullsnotdistinct
             OR i.indnkeyatts IS DISTINCT FROM e.key_count
             OR i.indnatts IS DISTINCT FROM e.key_count
             OR pg_catalog.pg_get_indexdef(i.indexrelid) IS DISTINCT FROM e.definition
        ) AS complete
    `;

    return rows[0]?.complete === true;
  });
}

/**
 * Verify the owner, security mode, and complete SET-clause surface of every
 * function required by revision 4. Exact proconfig equality prevents an
 * invoker function from acquiring a hidden row_security override.
 */
export async function hasExactCandidateFunctionSurface(sql: Database): Promise<boolean> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL row_security = off`;
    await tx`SET LOCAL search_path = pg_catalog`;

    const rows = await tx`
      WITH expected AS (
        SELECT
          item->>'signature' AS signature,
          (item->>'securityDefiner')::boolean AS security_definer,
          CASE
            WHEN item->'config' = 'null'::jsonb THEN NULL::text[]
            ELSE ARRAY(
              SELECT pg_catalog.jsonb_array_elements_text(item->'config')
            )
          END AS config
        FROM pg_catalog.jsonb_array_elements(
          ${tx.json([...CANDIDATE_FUNCTION_CONTRACT])}
        ) AS items(item)
      ),
      expected_owner AS (
        SELECT p.proowner
        FROM pg_catalog.pg_proc p
        WHERE p.oid = to_regprocedure('yu.refresh_via()')
      )
      SELECT
        (SELECT count(*) FROM expected_owner) = 1
        AND NOT EXISTS (
          SELECT 1
          FROM expected e
          LEFT JOIN pg_catalog.pg_proc p
            ON p.oid = to_regprocedure(e.signature)
          WHERE p.oid IS NULL
             OR p.prokind <> 'f'
             OR p.proowner IS DISTINCT FROM (SELECT proowner FROM expected_owner)
             OR p.prosecdef IS DISTINCT FROM e.security_definer
             OR p.proconfig IS DISTINCT FROM e.config
        ) AS complete
    `;

    return rows[0]?.complete === true;
  });
}

/**
 * Verify the complete constraint surface inherited from the original v0.1
 * core. Constraint names alone are not enough: checks, keys, and foreign-key
 * actions are executable behavior and must match the migration preflight.
 */
export async function hasLegacyConstraintSurface(sql: Database): Promise<boolean> {
  return sql.begin(async (tx) => {
    // Refuse a policy-filtered subset instead of mistaking hidden orphan rows
    // for a valid constraint base.
    await tx`SET LOCAL row_security = off`;

    // pg_get_expr() renders names relative to the active search path. Keep the
    // canonical comparison independent of caller state without changing the
    // session after this short probe transaction ends.
    await tx`SET LOCAL search_path = pg_catalog`;

    const rows = await tx`
    SELECT
      (
        -- A legacy base has exactly these 16 constraints. A current binding
        -- retains all 16 and adds the revision-4 constraints checked by the
        -- candidate-object probe, so only the pre-upgrade surface is closed.
        to_regclass('yu.standard_meta') IS NOT NULL
        OR (
          SELECT count(*)
          FROM pg_catalog.pg_constraint c
          WHERE c.conrelid IN (
            to_regclass('yu.lexicon'),
            to_regclass('yu.lexicon_versions'),
            to_regclass('yu.registry'),
            to_regclass('yu.threads'),
            to_regclass('yu.sever_log')
          )
        ) = 16
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
              FROM unnest(c.conkey::smallint[]) WITH ORDINALITY AS k(attnum, position)
              JOIN pg_catalog.pg_attribute a
                ON a.attrelid = c.conrelid AND a.attnum = k.attnum
              ORDER BY k.position
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
              FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum, position)
              JOIN pg_catalog.pg_attribute a
                ON a.attrelid = i.indrelid AND a.attnum = k.attnum
              WHERE k.position <= i.indnkeyatts
              ORDER BY k.position
            ) = expected.key_columns
        )
      )
      AND NOT EXISTS (
        SELECT 1
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
        ) AS expected(relation_name, constraint_name, expression)
        WHERE NOT EXISTS (
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
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM (VALUES
          ('yu.lexicon_versions', ARRAY['word']::text[],
            'yu.lexicon', ARRAY['word']::text[]),
          ('yu.threads', ARRAY['word']::text[],
            'yu.lexicon', ARRAY['word']::text[])
        ) AS expected(
          relation_name, key_columns, referenced_relation, referenced_columns
        )
        WHERE NOT EXISTS (
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
                (expected.relation_name, 5,
                  'pg_catalog."RI_FKey_check_ins"()'),
                (expected.relation_name, 17,
                  'pg_catalog."RI_FKey_check_upd"()'),
                (expected.referenced_relation, 9,
                  'pg_catalog."RI_FKey_noaction_del"()'),
                (expected.referenced_relation, 17,
                  'pg_catalog."RI_FKey_noaction_upd"()')
              ) AS required(trigger_relation, trigger_type, function_name)
              LEFT JOIN pg_catalog.pg_trigger t
                ON t.tgconstraint = c.oid
               AND t.tgrelid = to_regclass(required.trigger_relation)
               AND t.tgtype = required.trigger_type
               AND t.tgfoid = to_regprocedure(required.function_name)
              WHERE t.oid IS NULL
                 OR NOT t.tgisinternal
                 OR t.tgenabled <> 'O'
                 OR t.tgdeferrable
                 OR t.tginitdeferred
                 OR cardinality(t.tgattr::smallint[]) <> 0
                 OR t.tgqual IS NOT NULL
            )
        )
      ) AS complete
    `;

    if (rows[0]?.complete !== true) return false;

    // A disabled or replaced internal RI trigger can leave validated catalog
    // metadata behind while allowing orphan rows. With row_security=off, a
    // policy that would hide any rows raises instead of producing a false
    // green result.
    const dataRows = await tx`
      SELECT
        NOT EXISTS (
          SELECT 1
          FROM yu.lexicon_versions child
          LEFT JOIN yu.lexicon parent ON parent.word = child.word
          WHERE parent.word IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM yu.threads child
          LEFT JOIN yu.lexicon parent ON parent.word = child.word
          WHERE parent.word IS NULL
        ) AS complete
    `;

    return dataRows[0]?.complete === true;
  });
}

/**
 * Verify the complete revision-4 constraint surface and the referential data
 * it protects. The catalog fingerprint closes the named constraint set while
 * the RI-trigger and anti-join checks refuse disabled enforcement or orphaned
 * rows left behind during a period of disabled enforcement.
 */
export async function hasExactCandidateConstraintSurface(sql: Database): Promise<boolean> {
  return sql.begin(async (tx) => {
    // Keep the probe independent of caller state. In particular, never accept
    // a policy-filtered subset as evidence that no orphaned rows exist.
    await tx`SET LOCAL row_security = off`;
    await tx`SET LOCAL search_path = pg_catalog`;

    const catalogRows = await tx`
      WITH core_constraints AS (
        SELECT c.*, n.nspname, r.relname
        FROM pg_catalog.pg_constraint c
        JOIN pg_catalog.pg_class r ON r.oid = c.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = r.relnamespace
        WHERE n.nspname = 'yu'
          AND r.relname IN (
            'standard_meta',
            'lexicon',
            'lexicon_versions',
            'word_versions',
            'registry',
            'threads',
            'thread_ids',
            'sever_log'
          )
      ),
      candidate_fks AS (
        SELECT * FROM core_constraints WHERE contype = 'f'
      ),
      constraint_fingerprint AS (
        SELECT
          count(*) AS constraint_count,
          pg_catalog.md5(pg_catalog.string_agg(
            pg_catalog.format(
              '%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',
              nspname || '.' || relname,
              conname,
              contype,
              convalidated,
              condeferrable,
              condeferred,
              conislocal,
              coninhcount,
              connoinherit,
              confupdtype,
              confdeltype,
              confmatchtype,
              CASE
                WHEN conindid = 0 THEN ''
                ELSE conindid::regclass::text
              END,
              CASE
                WHEN confrelid = 0 THEN ''
                ELSE confrelid::regclass::text
              END,
              pg_catalog.pg_get_constraintdef(oid, false)
            ),
            E'\n' ORDER BY nspname, relname, conname
          )) AS fingerprint
        FROM core_constraints
      )
      SELECT
        (SELECT constraint_count FROM constraint_fingerprint) = 69
        AND (SELECT fingerprint FROM constraint_fingerprint)
              = '6e723c39f4dd17b5db7602fe8e34d530'
        AND (SELECT count(*) FROM candidate_fks) = 7
        AND NOT EXISTS (
          SELECT 1
          FROM candidate_fks c
          WHERE (
            SELECT count(*)
            FROM pg_catalog.pg_trigger t
            WHERE t.tgconstraint = c.oid
          ) <> 4
          OR EXISTS (
            SELECT 1
            FROM (VALUES
              (
                c.conrelid,
                c.confrelid,
                5::smallint,
                pg_catalog.to_regprocedure('pg_catalog."RI_FKey_check_ins"()')
              ),
              (
                c.conrelid,
                c.confrelid,
                17::smallint,
                pg_catalog.to_regprocedure('pg_catalog."RI_FKey_check_upd"()')
              ),
              (
                c.confrelid,
                c.conrelid,
                9::smallint,
                CASE c.confdeltype
                  WHEN 'a' THEN pg_catalog.to_regprocedure(
                    'pg_catalog."RI_FKey_noaction_del"()'
                  )
                  WHEN 'r' THEN pg_catalog.to_regprocedure(
                    'pg_catalog."RI_FKey_restrict_del"()'
                  )
                END
              ),
              (
                c.confrelid,
                c.conrelid,
                17::smallint,
                CASE c.confupdtype
                  WHEN 'a' THEN pg_catalog.to_regprocedure(
                    'pg_catalog."RI_FKey_noaction_upd"()'
                  )
                  WHEN 'r' THEN pg_catalog.to_regprocedure(
                    'pg_catalog."RI_FKey_restrict_upd"()'
                  )
                END
              )
            ) AS required(
              trigger_relation,
              constraint_relation,
              trigger_type,
              function_oid
            )
            LEFT JOIN pg_catalog.pg_trigger t
              ON t.tgconstraint = c.oid
             AND t.tgrelid = required.trigger_relation
             AND t.tgtype = required.trigger_type
             AND t.tgfoid = required.function_oid
            WHERE t.oid IS NULL
               OR NOT t.tgisinternal
               OR t.tgenabled <> 'O'
               OR t.tgconstrrelid IS DISTINCT FROM required.constraint_relation
               OR t.tgconstrindid IS DISTINCT FROM c.conindid
               OR t.tgparentid <> 0
               OR t.tgdeferrable
               OR t.tginitdeferred
               OR cardinality(t.tgattr::smallint[]) <> 0
               OR t.tgqual IS NOT NULL
          )
        ) AS complete
    `;

    if (catalogRows[0]?.complete !== true) return false;

    const dataRows = await tx`
      SELECT
        NOT EXISTS (
          SELECT 1
          FROM yu.lexicon_versions child
          LEFT JOIN yu.lexicon parent ON parent.word = child.word
          WHERE parent.word IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM yu.word_versions child
          LEFT JOIN yu.lexicon parent ON parent.word = child.word
          WHERE parent.word IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM yu.threads child
          LEFT JOIN yu.lexicon parent ON parent.word = child.word
          WHERE parent.word IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM yu.threads child
          LEFT JOIN yu.word_versions parent
            ON parent.word = child.word
           AND parent.word_version = child.word_version
          WHERE parent.word IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM yu.threads child
          LEFT JOIN yu.registry parent
            ON parent.book = child.from_book
           AND parent.deck = child.from_deck
          WHERE parent.book IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM yu.threads child
          LEFT JOIN yu.registry parent
            ON parent.book = child.to_book
           AND parent.deck = child.to_deck
          WHERE parent.book IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM yu.sever_log child
          LEFT JOIN yu.word_versions parent
            ON parent.word = child.word
           AND parent.word_version = child.word_version
          WHERE parent.word IS NULL
        ) AS complete
    `;

    return dataRows[0]?.complete === true;
  });
}

/**
 * Verify row-derived candidate surfaces without accepting an RLS-filtered
 * subset. This is a current-binding check, not tamper resistance against a
 * database owner or superuser.
 */
export async function hasCandidateDynamicSurfaces(sql: Database): Promise<boolean> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL row_security = off`;
    // pg_get_viewdef() qualifies names relative to the active search path.
    // Pin it so the canonical comparison below is stable for every caller.
    await tx`SET LOCAL search_path = pg_catalog`;

    const rows = await tx`
      SELECT
        NOT EXISTS (
          SELECT 1
          FROM yu.registry r
          LEFT JOIN pg_catalog.pg_namespace n
            ON n.nspname = r.physical_schema
          LEFT JOIN pg_catalog.pg_class c
            ON c.relnamespace = n.oid AND c.relname = r.physical_table
          WHERE c.oid IS NULL
             OR c.relkind <> 'r'
             OR c.relpersistence <> 'p'
             OR EXISTS (
               SELECT 1 FROM pg_catalog.pg_inherits i
               WHERE i.inhrelid = c.oid OR i.inhparent = c.oid
             )
             OR NOT EXISTS (
               SELECT 1
               FROM pg_catalog.pg_attribute a
               WHERE a.attrelid = c.oid
                 AND a.attname = r.id_col
                 AND a.attnum > 0
                 AND NOT a.attisdropped
                 AND a.atttypid = 'uuid'::regtype
                 AND a.attnotnull
             )
             OR NOT EXISTS (
               SELECT 1
               FROM pg_catalog.pg_index i
               JOIN pg_catalog.pg_attribute a
                 ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
               WHERE i.indrelid = c.oid
                 AND i.indisunique
                 AND i.indisvalid
                 AND i.indisready
                 AND i.indpred IS NULL
                 AND i.indexprs IS NULL
                 AND i.indnkeyatts = 1
                 AND a.attname = r.id_col
             )
             OR NOT EXISTS (
               SELECT 1 FROM pg_catalog.pg_attribute a
               WHERE a.attrelid = c.oid AND a.attname = r.at_col
                 AND a.attnum > 0 AND NOT a.attisdropped
                 AND a.atttypid = 'timestamptz'::regtype
             )
             OR NOT EXISTS (
               SELECT 1 FROM pg_catalog.pg_attribute a
               WHERE a.attrelid = c.oid AND a.attname = r.by_col
                 AND a.attnum > 0 AND NOT a.attisdropped
                 AND a.atttypid = 'text'::regtype
             )
             OR NOT EXISTS (
               SELECT 1 FROM pg_catalog.pg_attribute a
               WHERE a.attrelid = c.oid AND a.attname = r.how_col
                 AND a.attnum > 0 AND NOT a.attisdropped
                 AND a.atttypid = 'text'::regtype
             )
             OR NOT EXISTS (
               SELECT 1 FROM pg_catalog.pg_attribute a
               WHERE a.attrelid = c.oid AND a.attname = r.src_col
                 AND a.attnum > 0 AND NOT a.attisdropped
                 AND a.atttypid = 'text[]'::regtype
             )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM yu.lexicon l
          LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = 'via'
          LEFT JOIN pg_catalog.pg_class c
            ON c.relnamespace = n.oid AND c.relname = l.word
          WHERE c.oid IS NULL
             OR c.relkind <> 'v'
             OR c.relpersistence <> 'p'
             OR c.reloptions IS DISTINCT FROM ARRAY['security_invoker=true']::text[]
             OR c.relowner <> (
               SELECT p.proowner
               FROM pg_catalog.pg_proc p
               WHERE p.oid = to_regprocedure('yu.refresh_via()')
             )
             OR ARRAY(
               SELECT a.attname::text
               FROM pg_catalog.pg_attribute a
               WHERE a.attrelid = c.oid
                 AND a.attnum > 0
                 AND NOT a.attisdropped
               ORDER BY a.attnum
             ) IS DISTINCT FROM ARRAY[
               'from_ref', 'to_ref', 'note', 'at', 'by', 'how', 'src',
               'thread_id', 'word_version', 'gloss', 'inverse'
             ]::text[]
             OR ARRAY(
               SELECT a.atttypid
               FROM pg_catalog.pg_attribute a
               WHERE a.attrelid = c.oid
                 AND a.attnum > 0
                 AND NOT a.attisdropped
               ORDER BY a.attnum
             ) IS DISTINCT FROM ARRAY[
               'text'::regtype::oid,
               'text'::regtype::oid,
               'text'::regtype::oid,
               'timestamptz'::regtype::oid,
               'text'::regtype::oid,
               'text'::regtype::oid,
               'text[]'::regtype::oid,
               'uuid'::regtype::oid,
               'integer'::regtype::oid,
               'text'::regtype::oid,
               'text'::regtype::oid
             ]::oid[]
             OR EXISTS (
               SELECT 1
               FROM pg_catalog.pg_attribute a
               WHERE a.attrelid = c.oid
                 AND a.attnum > 0
                 AND NOT a.attisdropped
                 AND (
                   a.atttypmod <> -1
                   OR a.attnotnull
                   OR a.atthasdef
                   OR a.attidentity <> ''
                   OR a.attgenerated <> ''
                 )
             )
             OR pg_catalog.pg_get_viewdef(c.oid, false) IS DISTINCT FROM
                pg_catalog.format(
                  $yutabase_view$ SELECT ((((t.from_book || '/'::text) || t.from_deck) || '/'::text) || (t.from_id)::text) AS from_ref,
    ((((t.to_book || '/'::text) || t.to_deck) || '/'::text) || (t.to_id)::text) AS to_ref,
    t.note,
    t.at,
    t.by,
    t.how,
    t.src,
    t.id AS thread_id,
    t.word_version,
    v.gloss,
    v.inverse
   FROM (yu.threads t
     JOIN yu.word_versions v ON (((v.word = t.word) AND (v.word_version = t.word_version))))
  WHERE (t.word = %L::text);$yutabase_view$,
                  l.word
                )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'via'
            AND (
              c.relkind <> 'v'
              OR c.relpersistence <> 'p'
              OR c.reloptions IS DISTINCT FROM ARRAY['security_invoker=true']::text[]
              OR c.relowner <> (
                SELECT p.proowner
                FROM pg_catalog.pg_proc p
                WHERE p.oid = to_regprocedure('yu.refresh_via()')
              )
              OR NOT EXISTS (
                SELECT 1 FROM yu.lexicon l WHERE l.word = c.relname
              )
            )
        ) AS complete
    `;

    return rows[0]?.complete === true;
  });
}
