import type { Ref } from "./ref.js";
import type { CompiledQuery } from "./youspeak.js";
import { ident } from "./identifier.js";
import { uuidv7 } from "./uuidv7.js";

export const CLAIM_KINDS = Object.freeze([
  "witnessed",
  "live",
  "cached",
  "computed",
  "declared",
] as const);

export type ClaimKind = (typeof CLAIM_KINDS)[number];
export type TraversalDirection = "->" | "<-";

export interface TraversalHop {
  direction: TraversalDirection;
  word: string;
}

export interface ThreadQueryInput {
  from: Ref;
  word: string;
  to: Ref;
  /** Runtime-validated so JavaScript and broadly typed callers fail closed. */
  how: string;
  note?: string;
  src?: readonly string[];
}

export interface SeverQueryInput {
  threadId: string;
  /** Runtime-validated so JavaScript and broadly typed callers fail closed. */
  how: string;
  src?: readonly string[];
}

export function parseClaimKind(value: string, operation: "THREAD" | "SEVER"): ClaimKind {
  if ((CLAIM_KINDS as readonly string[]).includes(value)) return value as ClaimKind;
  throw new Error(`${operation}: unknown claim kind "${value}"`);
}

function requireClaimSources(
  operation: "THREAD" | "SEVER",
  how: ClaimKind,
  src: readonly string[] | undefined,
): void {
  if ((how === "cached" || how === "computed") && (!src || src.length === 0)) {
    throw new Error(`${operation}: how=${how} requires src — honesty header`);
  }
}

export function compileCardQuery(ref: Ref): CompiledQuery {
  return {
    sql: `SELECT * FROM ${ident(ref.book)}.${ident(ref.deck)} WHERE ${ident("id")} = $1`,
    params: [ref.id],
    deckTarget: { kind: "card", book: ref.book, deck: ref.deck },
  };
}

export function compileTraversalQuery(
  ref: Ref,
  direction: TraversalDirection,
  word: string,
  secondHop?: TraversalHop,
): CompiledQuery {
  assertTraversalDirection(direction, "TRAVERSE direction");
  if (secondHop) {
    assertTraversalDirection(secondHop.direction, "TRAVERSE second-hop direction");
  }
  const firstOut = direction === "->";
  const params: unknown[] = [ref.book, ref.deck, ref.id];
  const firstStart = firstOut ? "from" : "to";
  const firstEnd = firstOut ? "to" : "from";

  if (!secondHop) {
    params.push(word);
    return {
      sql: `
        SELECT t.${firstEnd}_book AS book, t.${firstEnd}_deck AS deck, t.${firstEnd}_id AS id,
               t.note, t.at, t.by, t.how, t.src, t.id AS thread_id,
               t.word, t.word_version, v.gloss, v.inverse,
               ${direction === "->" ? "v.gloss" : "v.inverse"} AS reading,
               jsonb_build_array(${edgeJsonSql("t", "v", direction)}) AS path
        FROM yu.threads t
        JOIN yu.word_versions v
          ON v.word = t.word AND v.word_version = t.word_version
        WHERE t.word = $4
          AND t.${firstStart}_book = $1 AND t.${firstStart}_deck = $2 AND t.${firstStart}_id = $3
        ORDER BY t.at DESC, t.id DESC
      `.trim(),
      params,
    };
  }

  const secondOut = secondHop.direction === "->";
  const secondStart = secondOut ? "from" : "to";
  const secondEnd = secondOut ? "to" : "from";
  params.push(word, secondHop.word);
  return {
    sql: `
      SELECT t2.${secondEnd}_book AS book, t2.${secondEnd}_deck AS deck, t2.${secondEnd}_id AS id,
             t2.note, t2.at, t2.by, t2.how, t2.src, t2.id AS thread_id,
             t2.word, t2.word_version, v2.gloss, v2.inverse,
             ${secondHop.direction === "->" ? "v2.gloss" : "v2.inverse"} AS reading,
             jsonb_build_array(
               ${edgeJsonSql("t1", "v1", direction)},
               ${edgeJsonSql("t2", "v2", secondHop.direction)}
             ) AS path
      FROM yu.threads t1
      JOIN yu.threads t2
        ON t2.${secondStart}_book = t1.${firstEnd}_book
       AND t2.${secondStart}_deck = t1.${firstEnd}_deck
       AND t2.${secondStart}_id = t1.${firstEnd}_id
      JOIN yu.word_versions v1
        ON v1.word = t1.word AND v1.word_version = t1.word_version
      JOIN yu.word_versions v2
        ON v2.word = t2.word AND v2.word_version = t2.word_version
      WHERE t1.word = $4
        AND t1.${firstStart}_book = $1 AND t1.${firstStart}_deck = $2 AND t1.${firstStart}_id = $3
        AND t2.word = $5
      ORDER BY t2.at DESC, t2.id DESC
    `.trim(),
    params,
  };
}

function assertTraversalDirection(
  value: string,
  field: string,
): asserts value is TraversalDirection {
  if (value !== "->" && value !== "<-") {
    throw new Error(`${field}: expected \"->\" or \"<-\"`);
  }
}

function edgeJsonSql(
  threadAlias: "t" | "t1" | "t2",
  versionAlias: "v" | "v1" | "v2",
  direction: TraversalDirection,
): string {
  return `jsonb_build_object(
    'thread_id', ${threadAlias}.id,
    'word', ${threadAlias}.word,
    'word_version', ${threadAlias}.word_version,
    'gloss', ${versionAlias}.gloss,
    'inverse', ${versionAlias}.inverse,
    'direction', '${direction}',
    'reading', ${direction === "->" ? `${versionAlias}.gloss` : `${versionAlias}.inverse`},
    'from_ref', ${threadAlias}.from_book || '/' || ${threadAlias}.from_deck || '/' || ${threadAlias}.from_id::text,
    'to_ref', ${threadAlias}.to_book || '/' || ${threadAlias}.to_deck || '/' || ${threadAlias}.to_id::text,
    'note', ${threadAlias}.note,
    'at', ${threadAlias}.at,
    'by', ${threadAlias}.by,
    'how', ${threadAlias}.how,
    'src', ${threadAlias}.src
  )`;
}

export function compileThreadQuery(input: ThreadQueryInput): CompiledQuery {
  const how = parseClaimKind(input.how, "THREAD");
  requireClaimSources("THREAD", how, input.src);

  const params: unknown[] = [
    uuidv7(),
    input.word,
    input.from.book,
    input.from.deck,
    input.from.id,
    input.to.book,
    input.to.deck,
    input.to.id,
  ];
  let nextParam = 9;

  let noteParam = "NULL";
  if (input.note !== undefined) {
    noteParam = `$${nextParam++}`;
    params.push(input.note);
  }

  const howParam = `$${nextParam++}`;
  params.push(how);

  const claimantParamIndex = params.length;
  const byParam = `$${nextParam++}`;
  params.push("__CLAIMANT__");

  const atParam = `$${nextParam++}`;
  params.push(new Date().toISOString());

  let srcParam = "NULL";
  if (input.src !== undefined) {
    srcParam = `$${nextParam}`;
    params.push([...input.src]);
  }

  return {
    sql: `
      INSERT INTO yu.threads (id, word, from_book, from_deck, from_id, to_book, to_deck, to_id, note, at, by, how, src)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${noteParam}, ${atParam}, ${byParam}, ${howParam}, ${srcParam})
      RETURNING *
    `.trim(),
    params,
    claimantParamIndex,
  };
}

export function compileSeverQuery(input: SeverQueryInput): CompiledQuery {
  const how = parseClaimKind(input.how, "SEVER");
  requireClaimSources("SEVER", how, input.src);
  return {
    sql: "SELECT yu.sever($1, $2, $3, $4)",
    params: [input.threadId, "__CLAIMANT__", how, input.src ? [...input.src] : null],
    claimantParamIndex: 1,
  };
}

export function bindClaimant(compiled: CompiledQuery, claimant: string): CompiledQuery {
  if (compiled.claimantParamIndex === undefined) return compiled;
  if (compiled.claimantParamIndex < 0 || compiled.claimantParamIndex >= compiled.params.length) {
    throw new Error("COMPILER CONTRACT: claimant parameter index is out of range");
  }
  const params = [...compiled.params];
  params[compiled.claimantParamIndex] = claimant;
  return { ...compiled, params };
}
