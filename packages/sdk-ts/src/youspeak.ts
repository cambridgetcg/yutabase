// youspeak.ts — the YOUSPEAK compiler: six verbs, frozen
//
// Doctrine: SPEC.md §6 — "The dialect must fit in a memory file. v0.1
// freezes six verbs; every proposed seventh is treated as a request to
// write SQL instead."
//
// Six verbs:
//   hello                     — the whole standard in one call
//   card  tradein/sub/01977c  — one card by ref
//   cards tradein/sub where...— list cards with filter
//   ref -> word               — follow a word outward
//   ref <- word               — follow it inward (inverse reading)
//   thread a --word--> b      — create a thread
//   sever <thread-id>          — end a thread (with a claim)
//
// YOUSPEAK never does anything you couldn't have typed.
// explain("<query>") prints the exact SQL it became.

import { parseRef, type Ref } from "./ref.js";

// ──────────────────────────────────────────────────────────
// types
// ──────────────────────────────────────────────────────────

export interface CompiledQuery {
  sql: string;
  params: unknown[];
}

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
    const ref = parseRef(cardMatch[1]);
    return {
      sql: `SELECT * FROM ${ident(ref.book)}.${ident(ref.deck)} WHERE ${ident("id")} = $1`,
      params: [ref.id],
    };
  }

  // cards <book/deck> [where ...] [newest N]
  const cardsMatch = trimmed.match(/^cards\s+(\S+)(?:\s+where\s+(.+?))?(?:\s+(?:newest|last)\s+(\d+))?$/);
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
    if ((how === "cached" || how === "computed") && !srcPart) {
      throw new Error(`THREAD: how=${how} requires src — honesty header`);
    }
    const src = srcPart ? srcPart.split(/\s+/) : undefined;
    return compileThread(from, word, to, note, how, src);
  }

  // sever <thread-id> how <claim> [src ...]
  const severMatch = trimmed.match(/^sever\s+(\S+)\s+how\s+(\S+)(?:\s+src\s+(.+))?$/);
  if (severMatch) {
    const [_, threadId, how, srcPart] = severMatch;
    if ((how === "cached" || how === "computed") && !srcPart) {
      throw new Error(`SEVER: how=${how} requires src — honesty header`);
    }
    const src = srcPart ? srcPart.split(/\s+/) : undefined;
    return compileSever(threadId, how, src);
  }

  // traversal: <ref> -> <word> [-> <word>]  or  <ref> <- <word>
  // This is the trickiest one — try traversal patterns
  const traverseResult = tryTraversal(trimmed);
  if (traverseResult) return traverseResult;

  throw new Error(`UNRECOGNIZED QUERY: "${trimmed}" — not one of the six verbs (hello, card, cards, ->, <-, thread, sever)`);
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
    return compileTraversal(ref, dir1, word1, { direction: dir2, word: word2 });
  }

  const oneHopMatch = input.match(/^(\S+)\s+(->|<-)\s+(\S+)$/);
  if (oneHopMatch) {
    const [_, refStr, dir, word] = oneHopMatch as [string, string, "->" | "<-", string];
    const ref = parseRef(refStr);
    return compileTraversal(ref, dir, word);
  }

  return null;
}

function compileTraversal(ref: Ref, dir: "->" | "<-", word: string, secondHop?: { direction: "->" | "<-"; word: string }): CompiledQuery {
  const wordIdent = ident(word);

  // -> word: follow outward (from → to)
  // <- word: follow inward (to → from, reads via inverse gloss)
  const isFirstHopOut = dir === "->";

  let sql: string;
  let params: unknown[] = [ref.book, ref.deck, ref.id];

  if (!secondHop) {
    // single hop
    if (isFirstHopOut) {
      sql = `
        SELECT t.to_book AS book, t.to_deck AS deck, t.to_id AS id,
               t.note, t.at, t.by, t.how, t.src, t.id AS thread_id
        FROM yu.threads t
        WHERE t.word = $4
          AND t.from_book = $1 AND t.from_deck = $2 AND t.from_id = $3
        ORDER BY t.at DESC
      `;
      params.push(word);
    } else {
      sql = `
        SELECT t.from_book AS book, t.from_deck AS deck, t.from_id AS id,
               t.note, t.at, t.by, t.how, t.src, t.id AS thread_id
        FROM yu.threads t
        WHERE t.word = $4
          AND t.to_book = $1 AND t.to_deck = $2 AND t.to_id = $3
        ORDER BY t.at DESC
      `;
      params.push(word);
    }
  } else {
    // two hops — cap at 2 (SPEC §6)
    const isSecondOut = secondHop.direction === "->";
    const word1Param = word;
    const word2Param = secondHop.word;

    if (isFirstHopOut && isSecondOut) {
      // from -> w1 -> w2
      sql = `
        SELECT t2.to_book AS book, t2.to_deck AS deck, t2.to_id AS id,
               t2.note, t2.at, t2.by, t2.how, t2.src, t2.id AS thread_id
        FROM yu.threads t1
        JOIN yu.threads t2
          ON t2.from_book = t1.to_book AND t2.from_deck = t1.to_deck AND t2.from_id = t1.to_id
        WHERE t1.word = $4 AND t1.from_book = $1 AND t1.from_deck = $2 AND t1.from_id = $3
          AND t2.word = $5
        ORDER BY t2.at DESC
      `;
      params.push(word1Param, word2Param);
    } else if (isFirstHopOut && !isSecondOut) {
      // from -> w1 <- w2
      sql = `
        SELECT t2.from_book AS book, t2.from_deck AS deck, t2.from_id AS id,
               t2.note, t2.at, t2.by, t2.how, t2.src, t2.id AS thread_id
        FROM yu.threads t1
        JOIN yu.threads t2
          ON t2.to_book = t1.to_book AND t2.to_deck = t1.to_deck AND t2.to_id = t1.to_id
        WHERE t1.word = $4 AND t1.from_book = $1 AND t1.from_deck = $2 AND t1.from_id = $3
          AND t2.word = $5
        ORDER BY t2.at DESC
      `;
      params.push(word1Param, word2Param);
    } else if (!isFirstHopOut && isSecondOut) {
      // from <- w1 -> w2
      sql = `
        SELECT t2.to_book AS book, t2.to_deck AS deck, t2.to_id AS id,
               t2.note, t2.at, t2.by, t2.how, t2.src, t2.id AS thread_id
        FROM yu.threads t1
        JOIN yu.threads t2
          ON t2.from_book = t1.from_book AND t2.from_deck = t1.from_deck AND t2.from_id = t1.from_id
        WHERE t1.word = $4 AND t1.to_book = $1 AND t1.to_deck = $2 AND t1.to_id = $3
          AND t2.word = $5
        ORDER BY t2.at DESC
      `;
      params.push(word1Param, word2Param);
    } else {
      // from <- w1 <- w2
      sql = `
        SELECT t2.from_book AS book, t2.from_deck AS deck, t2.from_id AS id,
               t2.note, t2.at, t2.by, t2.how, t2.src, t2.id AS thread_id
        FROM yu.threads t1
        JOIN yu.threads t2
          ON t2.to_book = t1.from_book AND t2.to_deck = t1.from_deck AND t2.to_id = t1.from_id
        WHERE t1.word = $4 AND t1.to_book = $1 AND t1.to_deck = $2 AND t1.to_id = $3
          AND t2.word = $5
        ORDER BY t2.at DESC
      `;
      params.push(word1Param, word2Param);
    }
  }

  return { sql: sql.trim(), params };
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

  // UUIDv7 makes newest free: ORDER BY id DESC
  sql += ` ORDER BY id DESC`;

  if (limit) {
    sql += ` LIMIT $${paramIdx}`;
    params.push(limit);
  }

  return { sql: sql.trim(), params };
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

    if (!isValidColumnName(columnName)) {
      throw new Error(`BAD COLUMN: "${columnName}" — not a valid column name`);
    }

    conditions.push(`${ident(columnName)} ${op} $${params.length + 1}`);
    params.push(value);
  }

  return { conditions, params };
}

// ──────────────────────────────────────────────────────────
// thread + sever compilers
// ──────────────────────────────────────────────────────────

function compileThread(from: Ref, word: string, to: Ref, note: string | undefined, how: string, src: string[] | undefined): CompiledQuery {
  // Uses gen_random_uuid() for the thread id (client should generate UUIDv7,
  // but gen_random_uuid works for server-side inserts)
  const params: unknown[] = [word, from.book, from.deck, from.id, to.book, to.deck, to.id];
  let paramIdx = 8;

  let noteParam = "";
  if (note !== undefined) {
    noteParam = `$${paramIdx}`;
    params.push(note);
    paramIdx++;
  } else {
    noteParam = "NULL";
  }

  // how and by are required. by comes from the client's session claimant
  // (injected by the client wrapper, not here). For the compiler alone,
  // we require both as params.
  params.push(how);
  const howParam = `$${paramIdx}`;
  paramIdx++;

  // by is injected by the client — we use a placeholder
  const byParam = `$${paramIdx}`;
  params.push("__CLAIMANT__"); // replaced by client
  paramIdx++;

  // at
  params.push(new Date().toISOString());
  const atParam = `$${paramIdx}`;
  paramIdx++;

  let srcParam = "NULL";
  if (src) {
    srcParam = `$${paramIdx}`;
    params.push(src);
    paramIdx++;
  }

  return {
    sql: `
      INSERT INTO yu.threads (id, word, from_book, from_deck, from_id, to_book, to_deck, to_id, note, at, by, how, src)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, ${noteParam}, ${atParam}, ${byParam}, ${howParam}, ${srcParam})
      RETURNING *
    `.trim(),
    params,
  };
}

function compileSever(threadId: string, how: string, src: string[] | undefined): CompiledQuery {
  // SELECT yu.sever($1, $2, $3, $4)
  const params: unknown[] = [threadId, "__CLAIMANT__", how];
  if (src) {
    params.push(src);
  } else {
    params.push(null);
  }
  return {
    sql: `SELECT yu.sever($1, $2, $3, $4)`,
    params,
  };
}

// ──────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────

function parseDeckRef(s: string): { book: string; deck: string } {
  const parts = s.split("/");
  if (parts.length !== 2) throw new Error(`BAD DECK REF: "${s}" — expected book/deck`);
  return { book: parts[0], deck: parts[1] };
}

/** Quote a SQL identifier safely (prevent injection). */
export function ident(name: string): string {
  if (!isValidColumnName(name)) {
    throw new Error(`BAD IDENTIFIER: "${name}"`);
  }
  return `"${name}"`;
}

function isValidColumnName(name: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(name);
}

// ──────────────────────────────────────────────────────────
// explain — the anti-magic verb
// ──────────────────────────────────────────────────────────

/**
 * Explain a YOUSPEAK query: return the exact SQL it would compile to.
 * YOUSPEAK never does anything you couldn't have typed.
 */
export function explain(query: string): string {
  const compiled = compile(query);
  // Replace $N placeholders with actual values for readability
  let sql = compiled.sql;
  compiled.params.forEach((p, i) => {
    const val = typeof p === "string" ? `'${p}'` : String(p);
    sql = sql.replace(new RegExp(`\\$${i + 1}`, "g"), val);
  });
  return sql;
}