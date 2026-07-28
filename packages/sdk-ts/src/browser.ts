/**
 * Pure, connection-free YUTABASE helpers for browsers and other ESM runtimes.
 *
 * `compile()` returns a registry-aware intermediate plan. Card plans include a
 * fixed relation sentinel plus `deckTarget`; execute them through a connected
 * adapter, not directly. `explain()` renders a logical preview only.
 */
export {
  CORE_YOUSPEAK_FORMS,
  compile,
  explain,
  ident,
} from "./youspeak.js";
export type { CompiledQuery, WhereClause } from "./youspeak.js";
export {
  formatRef,
  makeRef,
  parseDeckPattern,
  parseRef,
} from "./ref.js";
export type { Ref } from "./ref.js";
export { CLAIM_KINDS } from "./query-builders.js";
export type {
  ClaimKind,
  TraversalDirection,
} from "./query-builders.js";
export { uuidv7, uuidv7Timestamp } from "./uuidv7.js";
