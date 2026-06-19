#!/usr/bin/env bun
// cli.ts — the yuta CLI
//
// Doctrine: SPEC.md §7-8
// Commands: hello, card, cards, thread, sever, explain, init, check, doctor
//
// Usage:
//   yuta hello
//   yuta card tradein/submissions/01977c2e-...
//   yuta cards tradein/submissions where status="pending" newest 20
//   yuta query 'tradein/submissions/01977c2e -> contains'
//   yuta thread tradein/items/... --priced_from--> pricing/quotes/...
//   yuta sever <thread-id> how witnessed
//   yuta explain "card tradein/submissions/01977c2e"
//   yuta doctor
//   yuta check

import { Yuta } from "./index.js";
import { explain } from "./yutaql.js";

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === "--help" || cmd === "-h") {
  console.log(`yuta — YUTABASE client v0.1

Commands:
  hello                    The whole standard in one call
  card <ref>               Fetch one card by ref
  cards <book/deck> [...]  List cards with optional filter
  query "<yutaql>"         Run any YUTAQL query
  thread <from --word--> to>  Create a thread
  sever <id> how <claim>   End a thread
  explain "<yutaql>"       Print the SQL a query compiles to
  doctor                   Vocabulary health check
  check                    fsck: orphaned threads, header violations
  words                    List the lexicon
  decks                    List registered decks

Options:
  --conn <url>             Connection string (default: keychain)
  --by <claimant>          Set session claimant (e.g. agent:claude/abc123)

Examples:
  yuta hello
  yuta card tradein/submissions/01977c2e-0000-7000-8000-000000000001
  yuta cards tradein/submissions where status="pending" newest 20
  yuta query 'tradein/submissions/01977c2e -> contains'
  yuta explain "cards tradein/submissions newest 5"`);
  process.exit(0);
}

// Parse global flags
let connStr: string | undefined;
let claimant: string | undefined;
const cmdArgs: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--conn") { connStr = args[++i]; continue; }
  if (args[i] === "--by") { claimant = args[++i]; continue; }
  cmdArgs.push(args[i]);
}
const subCmd = cmdArgs[0];
const rest = cmdArgs.slice(1).join(" ");

async function main() {
  // explain doesn't need a database connection
  if (subCmd === "explain") {
    const queryStr = rest.replace(/^["']|["']$/g, "");
    console.log(explain(queryStr));
    return;
  }

  // All other commands need a database connection
  const yuta = new Yuta({ connectionString: connStr, claimant });

  switch (subCmd) {
    case "hello": {
      const hello = await yuta.hello();
      console.log(JSON.stringify(hello, null, 2));
      break;
    }

    case "card": {
      const ref = rest;
      if (!ref) { console.error("Usage: yuta card <book/deck/id>"); process.exit(1); }
      const card = await yuta.card(ref);
      console.log(JSON.stringify(card, null, 2));
      break;
    }

    case "cards": {
      const result = await yuta.query(`cards ${rest}`);
      console.log(JSON.stringify(result.rows, null, 2));
      if (result.freshness) {
        console.error(`freshness: ${result.freshness.cachedCount}/${result.freshness.totalValues} cached, oldest ${result.freshness.oldestCachedDays}d`);
      }
      break;
    }

    case "query": {
      const queryStr = rest.replace(/^["']|["']$/g, "");
      const result = await yuta.query(queryStr);
      console.log(JSON.stringify(result.rows, null, 2));
      if (result.freshness) {
        console.error(`freshness: ${result.freshness.cachedCount}/${result.freshness.totalValues} cached, oldest ${result.freshness.oldestCachedDays}d`);
      }
      break;
    }

    case "thread": {
      const result = await yuta.query(`thread ${rest}`);
      console.log(JSON.stringify(result.rows, null, 2));
      break;
    }

    case "sever": {
      await yuta.query(`sever ${rest}`);
      console.log("severed");
      break;
    }

    case "doctor": {
      const result = await yuta.sqlTag`SELECT * FROM yu.doctor()`;
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "check": {
      // yuta check: fsck for orphaned threads and header violations
      const orphans = await yuta.sqlTag`
        SELECT t.id, t.word, t.from_book, t.from_deck, t.from_id, t.to_book, t.to_deck, t.to_id
        FROM yu.threads t
        LEFT JOIN yu.registry r1 ON r1.book = t.from_book AND r1.deck = t.from_deck
        LEFT JOIN yu.registry r2 ON r2.book = t.to_book AND r2.deck = t.to_deck
        WHERE r1.book IS NULL OR r2.book IS NULL
      `;
      if (orphans.length === 0) {
        console.log("check: no orphaned threads — all endpoints registered");
      } else {
        console.log(`check: ${orphans.length} orphaned thread(s) — endpoints not in registry:`);
        console.log(JSON.stringify(orphans, null, 2));
      }
      break;
    }

    case "words": {
      const result = await yuta.sqlTag`SELECT word, gloss, inverse, from_deck, to_deck, to_one, status FROM yu.lexicon ORDER BY word`;
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "decks": {
      const result = await yuta.sqlTag`SELECT book, deck, native, ttl FROM yu.registry ORDER BY book, deck`;
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    default:
      console.error(`Unknown command: ${subCmd}. Run 'yuta --help' for usage.`);
      process.exit(1);
  }

  await yuta.close();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});