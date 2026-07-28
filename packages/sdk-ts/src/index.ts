// index.ts — yutabase public API
//
// Doctrine: SPEC.md §7 — "A thin wrapper over postgres.js"

export { Yuta } from "./client.js";
export type {
  YutaOptions,
  QueryResult,
  ThreadOptions,
  ClaimFields,
  ThreadRecord,
  TraversalEdge,
  TraversalRow,
  HelloResult,
  LexiconEntry,
  RegistryEntry,
} from "./client.js";
export type { FreshnessBanner } from "./freshness.js";
export { CORE_YOUSPEAK_FORMS, compile, explain, ident } from "./youspeak.js";
export type { CompiledQuery, WhereClause } from "./youspeak.js";
export { CLAIM_KINDS } from "./query-builders.js";
export type { ClaimKind, TraversalDirection } from "./query-builders.js";
export { parseRef, formatRef, makeRef, parseDeckPattern } from "./ref.js";
export type { Ref } from "./ref.js";
export { uuidv7, uuidv7Timestamp } from "./uuidv7.js";
export {
  CANDIDATE_CAPABILITIES,
  CANDIDATE_REVISION,
  CANDIDATE_VERSION,
  FRESH_INSTALL_MIGRATIONS,
  LEGACY_UPGRADE_MIGRATIONS,
  REVISION_FOUR_CAPABILITIES,
  REVISION_FOUR_UPGRADE_MIGRATIONS,
  planInstall,
} from "./install.js";
export type { InstallPlan, InstallProbe } from "./install.js";
