// youspeak.ts — the frozen YOUSPEAK core compiler
//
// Doctrine: SPEC.md §8 — the optional dialect keeps one deliberately small
// set of forms; anything outside it is treated as a request to write SQL.
//
// Core forms:
//   hello                     — installed identity, words, and decks
//   card  <book/deck/uuid>     — one card by ref
//   cards tradein/sub where...— list cards with filter
//   ref -> word               — follow a word outward
//   ref <- word               — follow it inward (inverse reading)
//   thread a --word--> b      — create a thread
//   sever <thread-id>          — end a thread (with a claim)
//
// YOUSPEAK never does anything you couldn't have typed.
// explain("<query>") renders logical compiler SQL. The connected client then
// resolves logical decks through the database-owned registry before execution.

import { parseRef, type Ref } from "./ref.js";
import { ident, isIdentifier } from "./identifier.js";
import {
  compileCardQuery,
  compileSeverQuery,
  compileThreadQuery,
  compileTraversalQuery,
  parseClaimKind,
} from "./query-builders.js";

// ──────────────────────────────────────────────────────────
// types
// ──────────────────────────────────────────────────────────

export interface CompiledQuery {
  sql: string;
  params: unknown[];
  /** Zero-based parameter slot filled from the connected client's claimant. */
  claimantParamIndex?: number;
  deckTarget?: {
    kind: "card" | "cards";
    book: string;
    deck: string;
  };
}

/** The only forms accepted by the frozen YOUSPEAK core v0.1 compiler. */
export const CORE_YOUSPEAK_FORMS = Object.freeze([
  "hello",
  "card",
  "cards",
  "traverse",
  "thread",
  "sever",
  "explain",
] as const);

export type YutaqlResult =
  | { kind: "hello" }
  | { kind: "card"; ref: Ref }
  | { kind: "cards"; book: string; deck: string; where?: WhereClause; limit?: number }
  | { kind: "traverse"; ref: Ref; direction: "->" | "<-"; word: string; secondHop?: { direction: "->" | "<-"; word: string } }
  | { kind: "thread"; from: Ref; word: string; to: Ref; note?: string; how: string; src?: string[] }
  | { kind: "sever"; threadId: string; how: string; src?: string[] }
  | { kind: "explain"; query: CompiledQuery };

export interface WhereClause {
  conditions: string[];
  params: unknown[];
}

// ──────────────────────────────────────────────────────────
// the compiler
// ──────────────────────────────────────────────────────────

/**
 * Compile a YOUSPEAK string into a SQL query + params.
 *
 * @throws on malformed YOUSPEAK
 */
export function compile(input: string): CompiledQuery {
  const trimmed = input.trim();
  if (trimmed === "") throw new Error("EMPTY QUERY");

  // hello
  if (trimmed === "hello") {
    return { sql: "SELECT 1", params: [] };
  }

  // explain "<query>"
  const explainMatch = trimmed.match(/^explain\s+"(.+)"$/);
  if (explainMatch) {
    const inner = compile(explainMatch[1]);
    // explain returns the SQL itself as a result
    return {
      sql: "SELECT $1::text AS sql",
      params: [inner.sql],
    };
  }

  // card <ref>
  const cardMatch = trimmed.match(/^card\s+(\S+)$/);
  if (cardMatch) {
    return compileCardQuery(parseRef(cardMatch[1]));
  }

  // cards <book/deck> [where ...] [newest N]
  const cardsMatch = trimmed.match(/^cards\s+(\S+)(?:\s+where\s+(.+?))?(?:\s+newest\s+(\d+))?$/);
  if (cardsMatch) {
    const [_, deckRef, wherePart, limitStr] = cardsMatch;
    const dp = parseDeckRef(deckRef);
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const where = wherePart ? parseWhere(wherePart) : undefined;
    return compileCards(dp.book, dp.deck, where, limit);
  }

  // thread <from-ref> --<word>--> <to-ref> [note "..."] how <claim> [src ...]
  const threadMatch = trimmed.match(
    /^thread\s+(\S+)\s+--(\S+?)-->\s+(\S+)(?:\s+note\s+"([^"]*)")?(?:\s+how\s+(\S+))?(?:\s+src\s+(.+))?$/
  );
  if (threadMatch) {
    const [_, fromRef, word, toRef, note, how, srcPart] = threadMatch;
    const from = parseRef(fromRef);
    const to = parseRef(toRef);
    if (!how) throw new Error("THREAD REQUIRES how — no default (honesty header)");
    const src = srcPart ? srcPart.split(/\s+/) : undefined;
    return compileThreadQuery({
      from,
      word,
      to,
      note,
      how: parseClaimKind(how, "THREAD"),
      src,
    });
  }

  // sever <thread-id> how <claim> [src ...]
  const severMatch = trimmed.match(/^sever\s+(\S+)\s+how\s+(\S+)(?:\s+src\s+(.+))?$/);
  if (severMatch) {
    const [_, threadId, how, srcPart] = severMatch;
    const src = srcPart ? srcPart.split(/\s+/) : undefined;
    return compileSeverQuery({
      threadId,
      how: parseClaimKind(how, "SEVER"),
      src,
    });
  }

  // traversal: <ref> -> <word> [-> <word>]  or  <ref> <- <word>
  // This is the trickiest one — try traversal patterns
  const traverseResult = tryTraversal(trimmed);
  if (traverseResult) return traverseResult;

  throw new Error(
    `UNRECOGNIZED QUERY: "${trimmed}" — outside frozen YOUSPEAK core v0.1 ` +
    "(hello, card, cards, traversal, thread, sever)",
  );
}

// ──────────────────────────────────────────────────────────
// traversal compiler
// ──────────────────────────────────────────────────────────

function tryTraversal(input: string): CompiledQuery | null {
  // Match: ref -> word  (outward)
  // Match: ref <- word  (inward, reads via inverse gloss)
  // Match: ref -> word -> word  (2 hops, capped)

  const twoHopMatch = input.match(/^(\S+)\s+(->|<-)\s+(\S+)\s+(->|<-)\s+(\S+)$/);
  if (twoHopMatch) {
    const [_, refStr, dir1, word1, dir2, word2] = twoHopMatch as [string, string, "->" | "<-", string, "->" | "<-", string];
    const ref = parseRef(refStr);
    return compileTraversalQuery(ref, dir1, word1, { direction: dir2, word: word2 });
  }

  const oneHopMatch = input.match(/^(\S+)\s+(->|<-)\s+(\S+)$/);
  if (oneHopMatch) {
    const [_, refStr, dir, word] = oneHopMatch as [string, string, "->" | "<-", string];
    const ref = parseRef(refStr);
    return compileTraversalQuery(ref, dir, word);
  }

  return null;
}

// ──────────────────────────────────────────────────────────
// cards compiler
// ──────────────────────────────────────────────────────────

function compileCards(book: string, deck: string, where?: WhereClause, limit?: number): CompiledQuery {
  let sql = `SELECT * FROM ${ident(book)}.${ident(deck)}`;
  const params: unknown[] = [];
  let paramIdx = 1;

  if (where && where.conditions.length > 0) {
    // Replace $1, $2 in where conditions with actual param indices
    const adjusted = where.conditions.map((c) => c.replace(/\$(\d+)/g, (_, n) => `$${paramIdx + parseInt(n, 10) - 1}`));
    where.params.forEach((p) => params.push(p));
    paramIdx += where.params.length;
    sql += ` WHERE ` + adjusted.join(" AND ");
  }

  // `at` is the explicit row-level time claim. UUID remains an identity and
  // only breaks ties; registered cards may validly use non-v7 UUIDs.
  sql += ` ORDER BY ${ident("at")} DESC NULLS LAST, ${ident("id")} DESC`;

  if (limit !== undefined) {
    sql += ` LIMIT $${paramIdx}`;
    params.push(limit);
  }

  return { sql: sql.trim(), params, deckTarget: { kind: "cards", book, deck } };
}

// ──────────────────────────────────────────────────────────
// where clause parser
// ──────────────────────────────────────────────────────────

/**
 * Parse a where clause. Supports:
 *   column="value"        → WHERE column = $1
 *   .how = "witnessed"    → WHERE how = $1 (honesty header)
 *   .at > "2026-01-01"    → WHERE at > $1
 *   status="pending" and .how="witnessed"
 */
function parseWhere(input: string): WhereClause {
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Split on " and " (case-insensitive)
  const parts = input.split(/\s+and\s+/i);

  for (const part of parts) {
    // Match: <column| .column> <op> "value"  or  <column> <op> value
    const m = part.match(/^(\.?[\w]+)\s*(=|!=|>=|<=|>|<)\s*(?:"([^"]*)"|(\S+))$/);
    if (!m) {
      throw new Error(`BAD WHERE: "${part}" — expected column op value (e.g. status="pending" or .how="witnessed")`);
    }
    const [_, col, op, quotedVal, bareVal] = m;
    const value = quotedVal ?? bareVal;
    const columnName = col.startsWith(".") ? col.slice(1) : col;

    if (!isIdentifier(columnName)) {
      throw new Error(`BAD COLUMN: "${columnName}" — not a valid column name`);
    }

    conditions.push(`${ident(columnName)} ${op} $${params.length + 1}`);
    params.push(value);
  }

  return { conditions, params };
}

// ──────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────
// logical deck parsing and identifier export
// ──────────────────────────────────────────────────────────

function parseDeckRef(s: string): { book: string; deck: string } {
  const parts = s.split("/");
  if (parts.length !== 2) throw new Error(`BAD DECK REF: "${s}" — expected book/deck`);
  return { book: parts[0], deck: parts[1] };
}

export { ident };

// ──────────────────────────────────────────────────────────
// explain — the anti-magic verb
// ──────────────────────────────────────────────────────────

/**
 * Explain a YOUSPEAK query using logical deck names, before registry mapping.
 * YOUSPEAK never does anything you couldn't have typed.
 */
export function explain(query: string): string {
  const compiled = compile(query);
  // Replace complete placeholders in one pass. Iterative `$1` replacement
  // corrupts `$10`, and unescaped apostrophes make the displayed SQL untrue.
  return compiled.sql.replace(/\$(\d+)/g, (placeholder, rawIndex: string) => {
    const index = Number.parseInt(rawIndex, 10) - 1;
    if (index < 0 || index >= compiled.params.length) return placeholder;
    return sqlLiteral(compiled.params[index]);
  });
}

function sqlLiteral(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("EXPLAIN: non-finite numeric parameter");
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Array.isArray(value)) return `ARRAY[${value.map(sqlLiteral).join(", ")}]`;
  throw new Error(`EXPLAIN: unsupported parameter type ${typeof value}`);
}
