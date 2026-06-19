#!/usr/bin/env bun
// cli.ts — the yuta CLI
//
// Doctrine: SPEC.md §7-8
// Commands: init, repl, hello, card, cards, query, thread, sever,
//           explain, doctor, check, words, decks

import { Yuta } from "./index.js";
import { explain } from "./youspeak.js";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

// --- helpers ---

function findSqlDir(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(thisDir, "..", "..", "sql"),
    join(thisDir, "..", "sql"),
    join(process.cwd(), "sql"),
    join(process.cwd(), "..", "sql"),
    join(process.cwd(), "packages", "sdk-ts", "..", "..", "sql"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "0001_yu_core.sql"))) return c;
  }
  throw new Error("CANNOT FIND SQL MIGRATIONS");
}

function getKeychainUrl(): string {
  const { execSync } = require("node:child_process") as typeof import("node:child_process");
  try {
    const url = execSync("security find-generic-password -s yutabase-url -w", { encoding: "utf-8" }).trim();
    if (!url) throw new Error("empty");
    return url;
  } catch {
    console.error("No --conn provided and no yutabase-url in keychain.");
    console.error("Set it: security add-generic-password -s yutabase-url -w 'postgresql://...'");
    process.exit(1);
  }
}

function maskUrl(url: string): string {
  const atIdx = url.indexOf("@");
  const colonIdx = url.indexOf("://");
  if (atIdx > colonIdx) {
    const proto = url.slice(0, colonIdx + 3);
    const rest = url.slice(atIdx);
    return proto + "***" + rest;
  }
  return url;
}

function parseFlags(raw: string[]): { conn: string | undefined; by: string | undefined; positional: string[] } {
  let conn: string | undefined;
  let by: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "--conn") { conn = raw[++i]; continue; }
    if (raw[i] === "--by") { by = raw[++i]; continue; }
    positional.push(raw[i]);
  }
  return { conn, by, positional };
}

// --- yuta init ---

async function doInit(conn: string | undefined): Promise<void> {
  const url = conn ?? getKeychainUrl();
  const sql = postgres(url, { max: 1 });
  const dir = findSqlDir();
  const migrations = ["0001_yu_core.sql", "0002_starter_lexicon.sql"];

  console.log("yuta init — installing YUTABASE into your database");
  console.log("  target: " + maskUrl(url));
  console.log("");

  for (const f of migrations) {
    const path = join(dir, f);
    if (!existsSync(path)) {
      console.error("  MISSING: " + f + " not found at " + path);
      process.exit(1);
    }
    const content = readFileSync(path, "utf-8");
    console.log("  applying " + f + "...");
    try {
      await sql.unsafe(content);
      console.log("  done");
    } catch (err) {
      console.error("  FAILED: " + (err as Error).message);
      await sql.end();
      process.exit(1);
    }
  }

  console.log("");
  console.log("  YUTABASE installed. The vocabulary lives with the data.");
  console.log("  Seven words coined. Five spare in the budget. That's the point.");
  console.log("  Rollback: DROP SCHEMA yu CASCADE; DROP SCHEMA via CASCADE;");
  console.log("");
  console.log("  Next:");
  console.log("    yuta hello   — see the whole standard");
  console.log("    yuta repl    — start speaking");
  console.log("");

  await sql.end();
}

// --- yuta repl ---

async function doRepl(conn: string | undefined, by: string | undefined): Promise<void> {
  const yuta = new Yuta({ connectionString: conn, claimant: by });

  console.log("");
  console.log("  YOUSPEAK — you speak, and reality listens.");
  console.log("  Type sentences. They compile to SQL. You can read it back with explain.");
  console.log("");
  console.log("  hello                  — learn the whole standard");
  console.log("  card tradein/sub/...   — fetch one card");
  console.log("  ref -> word            — follow a word outward");
  console.log("  ref <- word            — follow it inward");
  console.log("  thread a --w--> b ...  — create a thread");
  console.log("  sever <id> how ...     — end a thread");
  console.log('  explain "sentence"     — see the SQL');
  console.log("  exit / quit            — leave");
  console.log("");

  const readline = require("node:readline") as typeof import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "youspeak> ",
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }
    if (input === "exit" || input === "quit" || input === ":q") {
      console.log("  goodbye");
      rl.close();
      return;
    }

    try {
      if (input.startsWith("explain ")) {
        const q = input.slice(8).replace(/^["']|["']$/g, "");
        const sqlStr = explain(q);
        console.log("  " + sqlStr.replace(/\n/g, "\n  "));
        rl.prompt();
        return;
      }

      const result = await yuta.query(input);
      if (input.trim() === "hello") {
        printHello(result.rows[0] as any);
      } else {
        if (result.rows.length === 0) {
          console.log("  (no results)");
        } else {
          console.log(JSON.stringify(result.rows, null, 2));
        }
        if (result.freshness && result.freshness.totalValues > 0) {
          const f = result.freshness;
          console.log("  freshness: " + f.cachedCount + "/" + f.totalValues + " cached, " + f.computedCount + " computed, oldest " + f.oldestCachedDays + "d");
        }
      }
    } catch (err) {
      console.error("  " + (err as Error).message);
    }

    rl.prompt();
  });

  rl.on("close", async () => {
    await yuta.close();
    process.exit(0);
  });
}

// --- hello pretty-printer ---

function printHello(hello: any): void {
  console.log("");
  console.log("  +------------------------------------------------------+");
  console.log("  |       YUTABASE v" + (hello.version || "0.1") + " — you speak, reality listens        |");
  console.log("  +------------------------------------------------------+");
  console.log("");

  console.log("  creed:");
  for (const c of hello.creed || []) {
    console.log("    " + c);
  }
  console.log("");

  console.log("  primitives: " + (hello.primitives || []).join(" . "));
  console.log("");

  console.log("  honesty header:");
  console.log("    columns: " + (hello.honesty.columns || []).join(", "));
  console.log("    claims:  " + (hello.honesty.claims || []).join(" . "));
  console.log("    rule:    " + hello.honesty.rule);
  console.log("");

  console.log("  lexicon (" + (hello.lexicon || []).length + " words):");
  for (const w of hello.lexicon || []) {
    const one = w.to_one ? " [to_one]" : "";
    const status = w.status !== "live" ? " (" + w.status + ")" : "";
    console.log("    " + w.word.padEnd(18) + w.inverse.padEnd(18) + " " + w.from_deck + " -> " + w.to_deck + one + status);
    console.log("    " + " ".repeat(18) + "  " + w.gloss);
  }
  console.log("");

  console.log("  decks (" + (hello.decks || []).length + "):");
  for (const d of hello.decks || []) {
    const kind = d.native ? "native" : "annexed";
    console.log("    " + d.book + "/" + d.deck + " (" + kind + ")");
  }
  console.log("");

  console.log("  YOUSPEAK:");
  for (const q of hello.yutaql || []) {
    console.log("    " + q);
  }
  console.log("");

  console.log("  banned words: " + (hello.bannedWords || []).join(", "));
  console.log("  " + hello.twelveWordBudget);
  console.log("");
}


// --- yuta deck new / deck annex ---

async function doDeck(yuta: Yuta, args: string[]): Promise<void> {
  const sub = args[0];
  if (sub === "new") {
    await doDeckNew(yuta, args.slice(1));
  } else if (sub === "annex") {
    await doDeckAnnex(yuta, args.slice(1));
  } else if (sub === "list") {
    const result = await yuta.sqlTag`SELECT book, deck, native, ttl FROM yu.registry ORDER BY book, deck` as any[];
    for (const d of result) {
      const kind = d.native ? "native" : "annexed";
      const ttl = d.ttl ? " ttl=" + d.ttl : "";
      console.log("  " + d.book + "/" + d.deck + " (" + kind + ttl + ")");
    }
  } else {
    console.error("Usage: yuta deck new <book/deck> [column:type ...] [--ttl <interval>]");
    console.error("       yuta deck annex <schema.table> as <book/deck> --id <col> --at <col> --by <col> --how <col>");
    console.error("       yuta deck list");
    process.exit(1);
  }
}

async function doDeckNew(yuta: Yuta, args: string[]): Promise<void> {
  // yuta deck new tradein/submissions status:text --ttl "7 days"
  const deckRef = args[0];
  if (!deckRef || !deckRef.includes("/")) {
    console.error("Usage: yuta deck new <book/deck> [column:type ...] [--ttl <interval>]");
    process.exit(1);
  }
  const [book, deck] = deckRef.split("/");
  const columns: { name: string; type: string }[] = [];
  let ttl: string | undefined;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--ttl") { ttl = args[++i]; continue; }
    const [name, type] = args[i].split(":");
    if (!name || !type) {
      console.error("Bad column spec: " + args[i] + " — expected name:type (e.g. status:text)");
      process.exit(1);
    }
    columns.push({ name, type });
  }

  // Build the CREATE TABLE DDL with the honesty header
  const colDefs = [
    '  id uuid PRIMARY KEY',
    ...columns.map(c => '  ' + ident(c.name) + " " + c.type),
    '  at timestamptz NOT NULL',
    '  by text NOT NULL',
    "  how text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared'))",
    '  src text[]',
  ].join(",\n");

  const createSchema = 'CREATE SCHEMA IF NOT EXISTS ' + ident(book);
  const createTable = 'CREATE TABLE ' + ident(book) + '.' + ident(deck) + ' (\n' + colDefs + '\n)';
  const register = 'INSERT INTO yu.registry (book, deck, native, ttl, by) VALUES (' + literal(book) + ', ' + literal(deck) + ', true, ' + (ttl ? literal(ttl) + '::interval' : 'NULL') + ', ' + literal(yuta.getClaimant()) + ')';
  const guard = 'CREATE TRIGGER ' + ident(deck + '_guard') + ' BEFORE DELETE ON ' + ident(book) + '.' + ident(deck) + ' FOR EACH ROW EXECUTE FUNCTION yu._guard_delete()';

  console.log("deck new — creating " + book + "/" + deck);
  console.log("  columns: id, " + columns.map(c => c.name + ":" + c.type).join(", ") + ", at, by, how, src");

  try {
    await yuta.exec(createSchema);
    await yuta.exec(createTable);
    await yuta.exec(register);
    await yuta.exec(guard);
    console.log("  done — " + book + "/" + deck + " registered (native)");
  } catch (err) {
    console.error("  FAILED: " + (err as Error).message);
    process.exit(1);
  }
}

async function doDeckAnnex(yuta: Yuta, args: string[]): Promise<void> {
  // yuta deck annex public.tradein_submissions as tradein/submissions --id id --at created_at --by created_by --how declared
  const tableRef = args[0];
  if (!tableRef || args[1] !== "as") {
    console.error("Usage: yuta deck annex <schema.table> as <book/deck> --id <col> --at <col> --by <col> --how <col>");
    process.exit(1);
  }
  const deckRef = args[2];
  const [book, deck] = deckRef.split("/");
  let idCol = "id", atCol = "at", byCol = "by", howCol = "how";
  for (let i = 3; i < args.length; i++) {
    if (args[i] === "--id") { idCol = args[++i]; continue; }
    if (args[i] === "--at") { atCol = args[++i]; continue; }
    if (args[i] === "--by") { byCol = args[++i]; continue; }
    if (args[i] === "--how") { howCol = args[++i]; continue; }
  }

  const register = 'INSERT INTO yu.registry (book, deck, id_col, at_col, by_col, how_col, src_col, native, by) VALUES (' +
    literal(book) + ', ' + literal(deck) + ', ' + literal(idCol) + ', ' + literal(atCol) + ', ' + literal(byCol) + ', ' + literal(howCol) + ", 'src', false, " + literal(yuta.getClaimant()) + ') ON CONFLICT (book, deck) DO NOTHING';

  console.log("deck annex — " + tableRef + " → " + book + "/" + deck);
  console.log("  id_col=" + idCol + " at_col=" + atCol + " by_col=" + byCol + " how_col=" + howCol);

  try {
    await yuta.exec(register);
    console.log("  done — " + book + "/" + deck + " registered (annexed, no column changes)");
  } catch (err) {
    console.error("  FAILED: " + (err as Error).message);
    process.exit(1);
  }
}

// --- yuta word add / retire / export ---

async function doWord(yuta: Yuta, args: string[]): Promise<void> {
  const sub = args[0];
  if (sub === "add") {
    await doWordAdd(yuta, args.slice(1));
  } else if (sub === "retire") {
    await doWordRetire(yuta, args.slice(1));
  } else {
    console.error("Usage: yuta word add <word> --gloss \"...\" --inverse \"...\" --from <book/deck> --to <book/deck> [--to-one]");
    console.error("       yuta word retire <word>");
    process.exit(1);
  }
}

async function doWordAdd(yuta: Yuta, args: string[]): Promise<void> {
  const word = args[0];
  if (!word) {
    console.error("Usage: yuta word add <word> --gloss \"...\" --inverse \"...\" --from <book/deck> --to <book/deck> [--to-one]");
    process.exit(1);
  }
  let gloss: string | undefined;
  let inverse: string | undefined;
  let fromDeck: string | undefined;
  let toDeck: string | undefined;
  let toOne = false;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--gloss") { gloss = args[++i]; continue; }
    if (args[i] === "--inverse") { inverse = args[++i]; continue; }
    if (args[i] === "--from") { fromDeck = args[++i]; continue; }
    if (args[i] === "--to") { toDeck = args[++i]; continue; }
    if (args[i] === "--to-one") { toOne = true; continue; }
  }

  if (!gloss || !inverse || !fromDeck || !toDeck) {
    console.error("word add requires --gloss, --inverse, --from, --to");
    console.error("  No gloss, no word. No inverse, no word.");
    process.exit(1);
  }

  // No banned-words table — meaning is the filter, not a blocklist.
  // A weasel word like "related_to" fails because its gloss says nothing
  // and its inverse reads badly. The doctor surfaces zero-use words.

  // Insert as lexicographer
  const claimant = yuta.getClaimant();
  const insertSql = 'SET ROLE yu_lexicographer; INSERT INTO yu.lexicon (word, gloss, inverse, from_deck, to_deck, to_one, status, at, by, how) VALUES (' +
    literal(word) + ', ' + literal(gloss) + ', ' + literal(inverse) + ', ' + literal(fromDeck) + ', ' + literal(toDeck) + ', ' + (toOne ? 'true' : 'false') +
    ", 'live', now(), " + literal(claimant) + ", 'declared'); RESET ROLE; SELECT yu.refresh_via()";
  console.log("word add — coining \"" + word + "\"");
  console.log("  gloss:   " + gloss);
  console.log("  inverse: " + inverse);
  console.log("  from:    " + fromDeck);
  console.log("  to:      " + toDeck + (toOne ? " [to_one]" : ""));

  try {
    await yuta.exec(insertSql);
    console.log("  done — word coined. via." + word + " view generated.");
  } catch (err) {
    console.error("  FAILED: " + (err as Error).message);
    process.exit(1);
  }
}

async function doWordRetire(yuta: Yuta, args: string[]): Promise<void> {
  const word = args[0];
  if (!word) {
    console.error("Usage: yuta word retire <word>");
    process.exit(1);
  }

  const updateSql = "SET ROLE yu_lexicographer; UPDATE yu.lexicon SET status = 'retired' WHERE word = " + literal(word) + "; RESET ROLE";

  console.log("word retire — retiring \"" + word + "\"");
  console.log("  retired words refuse new threads; old threads keep their meaning");

  try {
    await yuta.exec(updateSql);
    console.log("  done — " + word + " retired");
  } catch (err) {
    console.error("  FAILED: " + (err as Error).message);
    process.exit(1);
  }
}

// --- helpers for DDL ---

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error("BAD IDENTIFIER: " + name);
  }
  return '"' + name + '"';
}

function literal(val: string): string {
  return "'" + val.replace(/'/g, "''") + "'";
}

// --- help ---

function printHelp(): void {
  console.log("yuta — YUTABASE v0.1");
  console.log("");
  console.log("  You speak, and reality listens.");
  console.log("");
  console.log("Commands:");
  console.log("  init                     Install the yu schema + starter lexicon");
  console.log("  repl                     Interactive YOUSPEAK session");
  console.log("  hello                    The whole standard in one call");
  console.log("  card <ref>               Fetch one card by ref");
  console.log("  cards <book/deck> [...]  List cards with optional filter");
  console.log('  query "<youspeak>"       Run any YOUSPEAK sentence');
  console.log("  thread <from --word--> to>  Create a thread");
  console.log("  sever <id> how <claim>   End a thread");
  console.log('  explain "<youspeak>"     Print the SQL a sentence compiles to');
  console.log("  doctor                   Vocabulary health check");
  console.log("  check                    fsck: orphaned threads");
  console.log("  deck new <book/deck>    Create a native deck with honesty header");
  console.log("  deck annex <tbl> as <book/deck>  Annex a legacy table");
  console.log("  word add <word> ...      Coin a word (requires --gloss, --inverse, --from, --to)");
  console.log("  word retire <word>       Retire a word (old threads keep meaning)");
  console.log("  stale                    Freshness audit: cached/computed past TTL");
  console.log("  words [--export]         List the lexicon / export to LEXICON.md");
  console.log("  decks                    List registered decks");
  console.log("  decks                    List registered decks");
  console.log("");
  console.log("Options:");
  console.log("  --conn <url>             Connection string (default: keychain)");
  console.log("  --by <claimant>          Set session claimant");
  console.log("");
  console.log("Examples:");
  console.log("  yuta init --conn postgresql://localhost/mydb");
  console.log("  yuta repl --conn postgresql://localhost/mydb");
  console.log("  yuta hello");
  console.log("  yuta card tradein/submissions/01977c2e-0000-7000-8000-000000000001");
  console.log("  yuta query 'tradein/submissions/01977c2e -> contains'");
  console.log("  yuta explain \"cards tradein/submissions newest 5\"");
}

// --- main dispatch ---

const args = process.argv.slice(2);
if (!args[0] || args[0] === "--help" || args[0] === "-h") {
  printHelp();
  process.exit(0);
}

const { conn, by, positional } = parseFlags(args);
const cmd = positional[0];
const rest = positional.slice(1).join(" ");

async function main() {
  if (cmd === "init") {
    await doInit(conn);
    return;
  }

  if (cmd === "repl") {
    await doRepl(conn, by);
    return;
  }

  if (cmd === "explain") {
    const queryStr = rest.replace(/^["']|["']$/g, "");
    console.log(explain(queryStr));
    return;
  }

  const yuta = new Yuta({ connectionString: conn, claimant: by });

  switch (cmd) {
    case "hello": {
      const hello = await yuta.hello();
      printHello(hello);
      break;
    }

    case "card": {
      if (!rest) { console.error("Usage: yuta card <book/deck/id>"); process.exit(1); }
      const card = await yuta.card(rest);
      console.log(JSON.stringify(card, null, 2));
      break;
    }

    case "cards": {
      const result = await yuta.query("cards " + rest);
      console.log(JSON.stringify(result.rows, null, 2));
      if (result.freshness) {
        const f = result.freshness;
        console.error("freshness: " + f.cachedCount + "/" + f.totalValues + " cached, oldest " + f.oldestCachedDays + "d");
      }
      break;
    }

    case "query": {
      const queryStr = rest.replace(/^["']|["']$/g, "");
      const result = await yuta.query(queryStr);
      console.log(JSON.stringify(result.rows, null, 2));
      if (result.freshness) {
        const f = result.freshness;
        console.error("freshness: " + f.cachedCount + "/" + f.totalValues + " cached, oldest " + f.oldestCachedDays + "d");
      }
      break;
    }

    case "thread": {
      const result = await yuta.query("thread " + rest);
      console.log(JSON.stringify(result.rows, null, 2));
      break;
    }

    case "sever": {
      await yuta.query("sever " + rest);
      console.log("severed");
      break;
    }

    case "doctor": {
      const result = await yuta.sqlTag`SELECT * FROM yu.doctor()` as any[];
      if (result.length === 0) {
        console.log("doctor: all clear — no flags");
      } else {
        for (const r of result) {
          const w = r.word ? " \"" + r.word + "\"" : "";
          console.log("doctor: " + r.flag + w + " — " + r.detail);
        }
      }
      break;
    }

    case "check": {
      // fsck: orphaned threads (endpoints not registered), dead refs, header violations
      let issues = 0;

      // 1. orphaned threads — endpoints not in registry
      const orphans = await yuta.sqlTag`
        SELECT t.id, t.word, t.from_book, t.from_deck, t.from_id, t.to_book, t.to_deck, t.to_id
        FROM yu.threads t
        LEFT JOIN yu.registry r1 ON r1.book = t.from_book AND r1.deck = t.from_deck
        LEFT JOIN yu.registry r2 ON r2.book = t.to_book AND r2.deck = t.to_deck
        WHERE r1.book IS NULL OR r2.book IS NULL
      ` as any[];
      if (orphans.length > 0) {
        issues += orphans.length;
        console.log("check: " + orphans.length + " orphaned thread(s) — endpoints not in registry:");
        for (const o of orphans) {
          console.log("  " + o.word + " " + o.from_book + "/" + o.from_deck + "/" + o.from_id + " → " + o.to_book + "/" + o.to_deck + "/" + o.to_id);
        }
      }

      // 2. retired words still holding live threads (not an error, but worth knowing)
      const retired = await yuta.sqlTag`
        SELECT l.word, count(t.id) AS thread_count
        FROM yu.lexicon l
        JOIN yu.threads t ON t.word = l.word
        WHERE l.status = 'retired'
        GROUP BY l.word
      ` as any[];
      if (retired.length > 0) {
        console.log("check: " + retired.length + " retired word(s) still holding live threads:");
        for (const r of retired) {
          console.log("  " + r.word + " — " + r.thread_count + " thread(s) (meaning preserved, no new threads allowed)");
        }
      }

      // 3. thread count
      const total = await yuta.sqlTag`SELECT count(*)::int AS n FROM yu.threads` as any[];
      const wordCount = await yuta.sqlTag`SELECT count(*)::int AS n FROM yu.lexicon WHERE status = 'live'` as any[];
      const deckCount = await yuta.sqlTag`SELECT count(*)::int AS n FROM yu.registry` as any[];

      if (issues === 0) {
        console.log("check: all clear — " + total[0].n + " threads, " + wordCount[0].n + " live words, " + deckCount[0].n + " decks registered");
      } else {
        console.log("check: " + issues + " issue(s) found across " + total[0].n + " threads");
      }
      break;
    }

    case "words": {
      const result = await yuta.sqlTag`SELECT l.word, l.gloss, l.inverse, l.from_deck, l.to_deck, l.to_one, l.status, count(t.id)::int AS usage FROM yu.lexicon l LEFT JOIN yu.threads t ON t.word = l.word GROUP BY l.word, l.gloss, l.inverse, l.from_deck, l.to_deck, l.to_one, l.status ORDER BY l.word` as any[];

      // Check for --export flag
      if (positional.includes("--export")) {
        const { writeFileSync } = require("node:fs") as typeof import("node:fs");
        let md = "# LEXICON — the words and their meanings\n\n";
        md += "_The vocabulary lives with the data. Glosses versioned (never silently edited). Words are retired (never deleted). No one overwrites anyone else's meaning._\n\n";
        md += "---\n\n";

        // Group: starter words (those with non-*/* endpoints) vs kingdom words (all */*)
        const starter = result.filter(w => w.from_deck !== "*/*" || w.to_deck !== "*/*");
        const general = result.filter(w => w.from_deck === "*/*" && w.to_deck === "*/*" && w.status === "live");
        const retired = result.filter(w => w.status === "retired");

        if (starter.length > 0) {
          md += "## domain words\n\n";
          for (const w of starter) {
            const one = w.to_one ? " [to_one]" : "";
            md += "### " + w.word + one + "\n";
            md += "**inverse:** " + w.inverse + "\n";
            md += "**meaning:** " + w.gloss + "\n";
            md += "**endpoints:** " + w.from_deck + " → " + w.to_deck + "\n";
            if (w.usage > 0) md += "**threads:** " + w.usage + "\n";
            md += "\n";
          }
        }

        if (general.length > 0) {
          md += "## general words\n\n";
          for (const w of general) {
            const one = w.to_one ? " [to_one]" : "";
            md += "### " + w.word + one + "\n";
            md += "**inverse:** " + w.inverse + "\n";
            md += "**meaning:** " + w.gloss + "\n";
            if (w.usage > 0) md += "**threads:** " + w.usage + "\n";
            md += "\n";
          }
        }

        if (retired.length > 0) {
          md += "## retired words\n\n";
          for (const w of retired) {
            md += "### " + w.word + " (retired)\n";
            md += "**was:** " + w.gloss + "\n";
            md += "_Retired words refuse new threads. Old threads keep their meaning._\n\n";
          }
        }

        md += "---\n\n";
        md += "## banned words\n\n";
        md += "These words are refused by name — adjacency without meaning:\n\n";
        md += "- related_to — everything is related to everything. Says nothing.\n";
        md += "- linked — every relation is a link. Says nothing.\n";
        md += "- refs — abbreviation of nothing in particular.\n";
        md += "- misc — a drawer, not a relation.\n\n";
        md += "---\n\n";
        md += "_" + result.length + " words. Glosses versioned, words retired (never deleted). No one overwrites anyone else's meaning._\n";

        writeFileSync("LEXICON.md", md);
        console.log("exported " + result.length + " words to LEXICON.md");
      } else {
        for (const w of result) {
          const one = w.to_one ? " [to_one]" : "";
          const use = w.usage > 0 ? " (" + w.usage + " threads)" : "";
          console.log("  " + w.word.padEnd(18) + w.inverse.padEnd(18) + " " + w.from_deck + " -> " + w.to_deck + one + " (" + w.status + ")" + use);
          console.log("  " + " ".repeat(20) + w.gloss);
        }
      }
      break;
    }

    case "decks": {
      const result = await yuta.sqlTag`SELECT book, deck, native, ttl FROM yu.registry ORDER BY book, deck` as any[];
      for (const d of result) {
        const kind = d.native ? "native" : "annexed";
        const ttl = d.ttl ? " ttl=" + d.ttl : "";
        console.log("  " + d.book + "/" + d.deck + " (" + kind + ttl + ")");
      }
      break;
    }

    case "deck": {
      await doDeck(yuta, positional.slice(1));
      break;
    }

    case "word": {
      await doWord(yuta, positional.slice(1));
      break;
    }

    case "stale": {
      const result = await yuta.sqlTag`SELECT * FROM yu.stale()` as any[];
      if (result.length === 0) {
        console.log("stale: nothing past its TTL — all fresh");
      } else {
        console.log("stale: " + result.length + " value(s) past their declared TTL:");
        for (const r of result) {
          const word = r.thread_word ? " (word: " + r.thread_word + ")" : "";
          console.log("  " + r.book + "/" + r.deck + "/" + r.id + " how=" + r.how + " age=" + r.age + " ttl=" + r.ttl + word);
        }
      }
      break;
    }

    default:
      console.error("Unknown command: " + cmd + ". Run 'yuta --help' for usage.");
      process.exit(1);
  }

  await yuta.close();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
