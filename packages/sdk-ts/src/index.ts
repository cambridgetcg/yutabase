// index.ts — @yutabase/yuta public API
//
// Doctrine: SPEC.md §7 — "A thin wrapper over postgres.js"

export { Yuta } from "./client.js";
export type { YutaOptions, QueryResult, FreshnessBanner, HelloResult, LexiconEntry, RegistryEntry } from "./client.js";
export { compile, explain, ident } from "./yutaql.js";
export type { CompiledQuery, YutaqlResult, WhereClause } from "./yutaql.js";
export { parseRef, formatRef, makeRef, parseDeckPattern } from "./ref.js";
export type { Ref } from "./ref.js";
export { uuidv7, uuidv7Timestamp } from "./uuidv7.js";