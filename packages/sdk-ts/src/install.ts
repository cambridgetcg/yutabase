export const CANDIDATE_VERSION = "0.1.0-candidate.1" as const;
export const CANDIDATE_REVISION = 4 as const;

export const FRESH_INSTALL_MIGRATIONS = Object.freeze([
  "0001_yu_core.sql",
  "0002_starter_lexicon.sql",
  "0004_candidate_hardening.sql",
] as const);

export const LEGACY_UPGRADE_MIGRATIONS = Object.freeze([
  "0004_candidate_hardening.sql",
] as const);

export interface ColumnShape {
  tableName: string;
  columnName: string;
  udtName: string;
  notNull?: boolean;
}

export const LEGACY_CORE_COLUMNS: readonly ColumnShape[] = Object.freeze([
  { tableName: "lexicon", columnName: "word", udtName: "text", notNull: true },
  { tableName: "lexicon", columnName: "gloss", udtName: "text", notNull: true },
  { tableName: "lexicon", columnName: "inverse", udtName: "text", notNull: true },
  { tableName: "lexicon", columnName: "from_deck", udtName: "text", notNull: true },
  { tableName: "lexicon", columnName: "to_deck", udtName: "text", notNull: true },
  { tableName: "lexicon", columnName: "to_one", udtName: "bool", notNull: true },
  { tableName: "lexicon", columnName: "ttl", udtName: "interval" },
  { tableName: "lexicon", columnName: "status", udtName: "text", notNull: true },
  { tableName: "lexicon", columnName: "at", udtName: "timestamptz", notNull: true },
  { tableName: "lexicon", columnName: "by", udtName: "text", notNull: true },
  { tableName: "lexicon", columnName: "how", udtName: "text", notNull: true },
  { tableName: "lexicon", columnName: "src", udtName: "_text" },
  { tableName: "lexicon_versions", columnName: "version_id", udtName: "int8", notNull: true },
  { tableName: "lexicon_versions", columnName: "word", udtName: "text", notNull: true },
  { tableName: "lexicon_versions", columnName: "gloss", udtName: "text", notNull: true },
  { tableName: "lexicon_versions", columnName: "inverse", udtName: "text", notNull: true },
  { tableName: "lexicon_versions", columnName: "changed_at", udtName: "timestamptz", notNull: true },
  { tableName: "lexicon_versions", columnName: "changed_by", udtName: "text", notNull: true },
  { tableName: "registry", columnName: "book", udtName: "text", notNull: true },
  { tableName: "registry", columnName: "deck", udtName: "text", notNull: true },
  { tableName: "registry", columnName: "id_col", udtName: "text", notNull: true },
  { tableName: "registry", columnName: "at_col", udtName: "text", notNull: true },
  { tableName: "registry", columnName: "by_col", udtName: "text", notNull: true },
  { tableName: "registry", columnName: "how_col", udtName: "text", notNull: true },
  { tableName: "registry", columnName: "src_col", udtName: "text", notNull: true },
  { tableName: "registry", columnName: "ttl", udtName: "interval" },
  { tableName: "registry", columnName: "native", udtName: "bool", notNull: true },
  { tableName: "registry", columnName: "at", udtName: "timestamptz", notNull: true },
  { tableName: "registry", columnName: "by", udtName: "text", notNull: true },
  { tableName: "threads", columnName: "id", udtName: "uuid", notNull: true },
  { tableName: "threads", columnName: "word", udtName: "text", notNull: true },
  { tableName: "threads", columnName: "from_book", udtName: "text", notNull: true },
  { tableName: "threads", columnName: "from_deck", udtName: "text", notNull: true },
  { tableName: "threads", columnName: "from_id", udtName: "uuid", notNull: true },
  { tableName: "threads", columnName: "to_book", udtName: "text", notNull: true },
  { tableName: "threads", columnName: "to_deck", udtName: "text", notNull: true },
  { tableName: "threads", columnName: "to_id", udtName: "uuid", notNull: true },
  { tableName: "threads", columnName: "note", udtName: "text" },
  { tableName: "threads", columnName: "at", udtName: "timestamptz", notNull: true },
  { tableName: "threads", columnName: "by", udtName: "text", notNull: true },
  { tableName: "threads", columnName: "how", udtName: "text", notNull: true },
  { tableName: "threads", columnName: "src", udtName: "_text" },
  { tableName: "sever_log", columnName: "id", udtName: "uuid", notNull: true },
  { tableName: "sever_log", columnName: "word", udtName: "text", notNull: true },
  { tableName: "sever_log", columnName: "from_book", udtName: "text", notNull: true },
  { tableName: "sever_log", columnName: "from_deck", udtName: "text", notNull: true },
  { tableName: "sever_log", columnName: "from_id", udtName: "uuid", notNull: true },
  { tableName: "sever_log", columnName: "to_book", udtName: "text", notNull: true },
  { tableName: "sever_log", columnName: "to_deck", udtName: "text", notNull: true },
  { tableName: "sever_log", columnName: "to_id", udtName: "uuid", notNull: true },
  { tableName: "sever_log", columnName: "note", udtName: "text" },
  { tableName: "sever_log", columnName: "at", udtName: "timestamptz", notNull: true },
  { tableName: "sever_log", columnName: "by", udtName: "text", notNull: true },
  { tableName: "sever_log", columnName: "how", udtName: "text", notNull: true },
  { tableName: "sever_log", columnName: "src", udtName: "_text" },
]);

export const CANDIDATE_COLUMNS: readonly ColumnShape[] = Object.freeze([
  { tableName: "registry", columnName: "physical_schema", udtName: "text", notNull: true },
  { tableName: "registry", columnName: "physical_table", udtName: "text", notNull: true },
  { tableName: "standard_meta", columnName: "singleton", udtName: "bool", notNull: true },
  { tableName: "standard_meta", columnName: "standard", udtName: "text", notNull: true },
  { tableName: "standard_meta", columnName: "profile", udtName: "text", notNull: true },
  { tableName: "standard_meta", columnName: "version", udtName: "text", notNull: true },
  { tableName: "standard_meta", columnName: "revision", udtName: "int4", notNull: true },
  { tableName: "standard_meta", columnName: "capabilities", udtName: "_text", notNull: true },
  { tableName: "standard_meta", columnName: "installed_at", udtName: "timestamptz", notNull: true },
  { tableName: "standard_meta", columnName: "upgraded_at", udtName: "timestamptz", notNull: true },
  { tableName: "lexicon", columnName: "current_version", udtName: "int4", notNull: true },
  { tableName: "threads", columnName: "word_version", udtName: "int4", notNull: true },
  { tableName: "threads", columnName: "word_to_one", udtName: "bool", notNull: true },
  { tableName: "thread_ids", columnName: "id", udtName: "uuid", notNull: true },
  { tableName: "word_versions", columnName: "word", udtName: "text", notNull: true },
  { tableName: "word_versions", columnName: "word_version", udtName: "int4", notNull: true },
  { tableName: "word_versions", columnName: "gloss", udtName: "text", notNull: true },
  { tableName: "word_versions", columnName: "inverse", udtName: "text", notNull: true },
  { tableName: "word_versions", columnName: "from_deck", udtName: "text", notNull: true },
  { tableName: "word_versions", columnName: "to_deck", udtName: "text", notNull: true },
  { tableName: "word_versions", columnName: "to_one", udtName: "bool", notNull: true },
  { tableName: "word_versions", columnName: "ttl", udtName: "interval" },
  { tableName: "word_versions", columnName: "status", udtName: "text", notNull: true },
  { tableName: "word_versions", columnName: "at", udtName: "timestamptz", notNull: true },
  { tableName: "word_versions", columnName: "by", udtName: "text", notNull: true },
  { tableName: "word_versions", columnName: "how", udtName: "text", notNull: true },
  { tableName: "word_versions", columnName: "src", udtName: "_text" },
  { tableName: "word_versions", columnName: "recorded_at", udtName: "timestamptz", notNull: true },
  { tableName: "sever_log", columnName: "word_version", udtName: "int4", notNull: true },
  { tableName: "sever_log", columnName: "word_to_one", udtName: "bool", notNull: true },
  { tableName: "sever_log", columnName: "thread_at", udtName: "timestamptz" },
  { tableName: "sever_log", columnName: "thread_by", udtName: "text" },
  { tableName: "sever_log", columnName: "thread_how", udtName: "text" },
  { tableName: "sever_log", columnName: "thread_src", udtName: "_text" },
]);

export function hasColumnShape(actual: readonly ColumnShape[], required: readonly ColumnShape[]): boolean {
  return required.every((expected) => actual.some((column) =>
    column.tableName === expected.tableName &&
    column.columnName === expected.columnName &&
    column.udtName === expected.udtName &&
    (!expected.notNull || column.notNull === true)
  ));
}

export function hasAnyColumn(actual: readonly ColumnShape[], candidates: readonly ColumnShape[]): boolean {
  return candidates.some((candidate) => actual.some((column) =>
    column.tableName === candidate.tableName && column.columnName === candidate.columnName
  ));
}

export interface InstallProbe {
  hasYuSchema: boolean;
  hasLexicon: boolean;
  hasLexiconVersions: boolean;
  hasRegistry: boolean;
  hasThreads: boolean;
  hasSeverLog: boolean;
  hasViaSchema: boolean;
  hasLegacyIntegrity: boolean;
  hasPhysicalSchema: boolean;
  hasPhysicalTable: boolean;
  hasStandardMeta: boolean;
  hasLegacyCoreShape: boolean;
  hasCandidateShape: boolean;
  hasCandidateObjects: boolean;
  hasCandidateFootprint: boolean;
  standard?: string;
  profile?: string;
  version?: string;
  revision?: number;
}

export type InstallPlan =
  | { mode: "fresh"; migrations: typeof FRESH_INSTALL_MIGRATIONS }
  | { mode: "upgrade"; migrations: typeof LEGACY_UPGRADE_MIGRATIONS }
  | { mode: "current"; migrations: readonly [] };

/**
 * Classify a database without guessing through a partial installation.
 * Unknown/newer identities are refused rather than silently downgraded.
 */
export function planInstall(probe: InstallProbe): InstallPlan {
  const coreObjects = [probe.hasLexicon, probe.hasRegistry, probe.hasThreads];
  const hasAnyCore = coreObjects.some(Boolean);
  const hasAllCore = coreObjects.every(Boolean);
  const hasCompleteLegacyBase =
    hasAllCore &&
    probe.hasLexiconVersions &&
    probe.hasSeverLog &&
    probe.hasViaSchema &&
    probe.hasLegacyIntegrity &&
    probe.hasLegacyCoreShape;
  const hasAnyHardening =
    probe.hasPhysicalSchema ||
    probe.hasPhysicalTable ||
    probe.hasStandardMeta ||
    probe.hasCandidateFootprint;
  const hasAllMappingColumns = probe.hasPhysicalSchema && probe.hasPhysicalTable;

  if (!probe.hasYuSchema && !probe.hasViaSchema && !hasAnyCore && !hasAnyHardening) {
    return { mode: "fresh", migrations: FRESH_INSTALL_MIGRATIONS };
  }

  if (probe.hasYuSchema && hasCompleteLegacyBase && !hasAnyHardening) {
    return { mode: "upgrade", migrations: LEGACY_UPGRADE_MIGRATIONS };
  }

  if (
    probe.hasYuSchema &&
    hasCompleteLegacyBase &&
    probe.hasCandidateShape &&
    probe.hasCandidateObjects &&
    hasAllMappingColumns &&
    probe.hasStandardMeta
  ) {
    if (
      probe.standard === "YUTABASE" &&
      probe.profile === "postgres" &&
      probe.version === CANDIDATE_VERSION &&
      probe.revision === CANDIDATE_REVISION
    ) {
      return { mode: "current", migrations: [] };
    }
    throw new Error(
      `UNSUPPORTED YUTABASE IDENTITY: ${probe.standard ?? "?"}/` +
      `${probe.profile ?? "?"}@${probe.version ?? "?"} revision ${probe.revision ?? "?"}`,
    );
  }

  throw new Error(
    "PARTIAL YUTABASE INSTALL: core objects and candidate metadata do not form a known revision",
  );
}
