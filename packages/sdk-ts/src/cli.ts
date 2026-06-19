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
  console.log("  words                    List the lexicon");
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
      const orphans = await yuta.sqlTag`
        SELECT t.id, t.word, t.from_book, t.from_deck, t.from_id, t.to_book, t.to_deck, t.to_id
        FROM yu.threads t
        LEFT JOIN yu.registry r1 ON r1.book = t.from_book AND r1.deck = t.from_deck
        LEFT JOIN yu.registry r2 ON r2.book = t.to_book AND r2.deck = t.to_deck
        WHERE r1.book IS NULL OR r2.book IS NULL
      ` as any[];
      if (orphans.length === 0) {
        console.log("check: no orphaned threads — all endpoints registered");
      } else {
        console.log("check: " + orphans.length + " orphaned thread(s):");
        console.log(JSON.stringify(orphans, null, 2));
      }
      break;
    }

    case "words": {
      const result = await yuta.sqlTag`SELECT word, gloss, inverse, from_deck, to_deck, to_one, status FROM yu.lexicon ORDER BY word` as any[];
      for (const w of result) {
        const one = w.to_one ? " [to_one]" : "";
        console.log("  " + w.word.padEnd(18) + w.inverse.padEnd(18) + " " + w.from_deck + " -> " + w.to_deck + one + " (" + w.status + ")");
        console.log("  " + " ".repeat(20) + w.gloss);
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
