// client.ts — @yutabase/yuta: thin wrapper over postgres.js
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
import { compile, explain, type CompiledQuery } from "./youspeak.js";
import { uuidv7 } from "./uuidv7.js";
import { parseRef, type Ref } from "./ref.js";

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
  private claimant: string;

  constructor(opts: YutaOptions = {}) {
    const connStr = opts.connectionString ?? this.getConnectionFromKeychain();
    this.sql = postgres(connStr, { max: 10 });
    this.claimant = opts.claimant ?? "human:yu";
  }

  // ──────────────────────────────────────────────────────────
  // §7 — session-default claimant
  // ──────────────────────────────────────────────────────────

  /** Set the default `by` for all writes. The true claim becomes the laziest claim. */
  setClaimant(who: string): void {
    this.claimant = who;
  }

  getClaimant(): string {
    return this.claimant;
  }

  // ──────────────────────────────────────────────────────────
  // §7 — yuta hello: self-describing entrypoint
  // ──────────────────────────────────────────────────────────

  /** A fresh agent session learns the entire standard from one call. */
  async hello(): Promise<HelloResult> {
    const [lexicon, registry] = await Promise.all([
      this.sql`SELECT word, gloss, inverse, from_deck, to_deck, to_one, status FROM yu.lexicon ORDER BY word`,
      this.sql`SELECT book, deck, native FROM yu.registry ORDER BY book, deck`,
    ]);

    return {
      standard: "YUTABASE",
      version: "0.1",
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
        'card  tradein/submissions/01977c2e                — one card by ref',
        'cards tradein/submissions where status="pending" newest 20',
        "tradein/submissions/01977c2e -> contains          — follow a word outward",
        "tradein/items/0197a1f4 <- contains                — follow it inward",
        'thread a --priced_from--> b note "ebay comp" how computed src a',
        "sever <thread-id> how witnessed                    — threads end with a claim",
      ],
      bannedWords: ["related_to", "linked", "refs", "misc"],
      twelveWordBudget: "A book should hold under ~12 words; word #13 means you need a new deck",
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

    const compiled = compile(youspeak);
    const adjusted = this.injectClaimant(compiled);
    const rows = await (this.sql.unsafe as (sql: string, params: never[]) => Promise<unknown>)(adjusted.sql, adjusted.params as never[]);

    const rowsArray = rows as unknown as Record<string, unknown>[];
    const freshness = this.computeFreshness(rowsArray);

    return { rows: rowsArray, sql: adjusted.sql, freshness };
  }

  // ──────────────────────────────────────────────────────────
  // §6 — explain: print the exact SQL
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
  // close
  // ──────────────────────────────────────────────────────────

  async close(): Promise<void> {
    await this.sql.end();
  }

  // ──────────────────────────────────────────────────────────
  // internal
  // ──────────────────────────────────────────────────────────

  private injectClaimant(compiled: CompiledQuery): CompiledQuery {
    const params = compiled.params.map((p) => (p === "__CLAIMANT__" ? this.claimant : p));
    return { sql: compiled.sql, params };
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
      if (row.at) {
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
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    try {
      const url = execSync("security find-generic-password -s yutabase-url -w", { encoding: "utf-8" }).trim();
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
  version: string;
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
  bannedWords: string[];
  twelveWordBudget: string;
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
}