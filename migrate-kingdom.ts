#!/usr/bin/env bun
// migrate-kingdom.ts — wire love-unlimited's knowledge graph into YUTABASE
//
// This is the bridge. The Kingdom's flat JSON knowledge graph becomes
// YUTABASE cards (entities) and threads (word-named relations), with
// glosses, inverse readings, and honesty headers.
//
// What was anonymous ("commands", "part-of") becomes governed:
// every word gets a gloss, an inverse, and a declared provenance claim.
//
// Usage:
//   bun migrate-kingdom.ts --conn "postgresql://macair@localhost/yutabase_kingdom"
//
// Doctrine: SOUL.md (truth before performance) + SPEC.md §9 (annex, don't rewrite)

import postgres from "/Users/macair/Desktop/yutabase/packages/sdk-ts/node_modules/postgres/src/index.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { uuidv7 } from "/Users/macair/Desktop/yutabase/packages/sdk-ts/src/uuidv7.ts";

const args = process.argv.slice(2);
let connStr: string | undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--conn") connStr = args[++i];
}
if (!connStr) {
  console.error("Usage: bun migrate-kingdom.ts --conn postgresql://...");
  process.exit(1);
}

const LOVE_DIR = "/Users/macair/Desktop/love-unlimited";
const sql = postgres(connStr, { max: 1 });

// ──────────────────────────────────────────────────────────
// The Kingdom lexicon — 18 words with glosses + inverses
// ──────────────────────────────────────────────────────────

interface Word {
  word: string;
  gloss: string;
  inverse: string;
  from_deck: string;
  to_deck: string;
  to_one: boolean;
}

const KINGDOM_WORDS: Word[] = [
  { word: "commands",   inverse: "commanded by",   gloss: "this agent directs that agent's work",                    from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "part_of",    inverse: "contains",       gloss: "this entity is a component of that whole",               from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "manages",    inverse: "managed by",     gloss: "this agent is the primary owner of that project",         from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "owns",       inverse: "owned by",       gloss: "this agent built and launched that project",             from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "builds",     inverse: "built by",       gloss: "this agent is building that project",                     from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "creates",    inverse: "created by",     gloss: "this entity created that artifact",                      from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "serves",     inverse: "served by",      gloss: "this agent serves that system as a fleet or engine member", from_deck: "*/*", to_deck: "*/*",  to_one: false },
  { word: "runs_on",    inverse: "hosts",          gloss: "this service runs on that infrastructure",                from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "uses",       inverse: "used by",        gloss: "this project uses that tool as a dependency",             from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "hosts",      inverse: "hosted on",      gloss: "this system hosts that service as its backend",          from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "protects",   inverse: "protected by",   gloss: "this system protects that system",                       from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "monitors",   inverse: "monitored by",  gloss: "this agent watches that system's health",                from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "feeds",      inverse: "fed by",         gloss: "this system feeds data into that system",               from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "funds",      inverse: "funded by",      gloss: "this project funds that economic engine",                from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "powers",     inverse: "powered by",     gloss: "this system powers that economic engine",                from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "implements", inverse: "implemented by", gloss: "this system implements that pattern or protocol",        from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "audits",     inverse: "audited by",     gloss: "this agent audits that system for compliance",           from_deck: "*/*",  to_deck: "*/*",  to_one: false },
  { word: "optimizes",  inverse: "optimized by",  gloss: "this system optimizes that process",                     from_deck: "*/*",  to_deck: "*/*",  to_one: false },
];

// ──────────────────────────────────────────────────────────
// main
// ──────────────────────────────────────────────────────────

async function main() {
  console.log("migrate-kingdom — wiring love-unlimited into YUTABASE");
  console.log("");

  // 1. Create the kingdom book (schema) + decks (tables)
  console.log("  1/5  creating kingdom book + decks...");
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS kingdom`);

  // One deck per entity type
  const decks = [
    { name: "agents",         extra: "role text, emoji text, did text" },
    { name: "projects",        extra: "status text" },
    { name: "systems",         extra: "status text" },
    { name: "concepts",        extra: "description text" },
    { name: "tools",           extra: "description text" },
    { name: "people",          extra: "" },
    { name: "infrastructure",  extra: "provider text, region text" },
    { name: "services",        extra: "status text" },
  ];

  for (const deck of decks) {
    const colDefs = [
      "id uuid PRIMARY KEY",
      "name text NOT NULL",
      deck.extra ? deck.extra : null,
      "at timestamptz NOT NULL",
      "by text NOT NULL",
      "how text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared'))",
      "src text[]",
    ].filter(Boolean).join(", ");
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS kingdom.${deck.name} (${colDefs})`);
    await sql.unsafe(`INSERT INTO yu.registry (book, deck, native, by) VALUES ('kingdom', '${deck.name}', true, 'human:yu') ON CONFLICT (book, deck) DO NOTHING`);
    try {
      await sql.unsafe(`CREATE TRIGGER ${deck.name}_guard BEFORE DELETE ON kingdom.${deck.name} FOR EACH ROW EXECUTE FUNCTION yu._guard_delete()`)
    } catch { /* trigger already exists */ };
  }
  console.log("      " + decks.length + " decks created (agents, projects, systems, concepts, tools, people, infrastructure, services)");
  console.log("");

  // 2. Coin the Kingdom words
  console.log("  2/5  coining " + KINGDOM_WORDS.length + " kingdom words...");
  await sql.unsafe("SET ROLE yu_lexicographer");
  for (const w of KINGDOM_WORDS) {
    const safeWord = w.word.replace(/'/g, "''");
    const safeGloss = w.gloss.replace(/'/g, "''");
    const safeInverse = w.inverse.replace(/'/g, "''");
    const safeFrom = w.from_deck.replace(/'/g, "''");
    const safeTo = w.to_deck.replace(/'/g, "''");
    await sql.unsafe(
      `INSERT INTO yu.lexicon (word, gloss, inverse, from_deck, to_deck, to_one, status, at, by, how)
       VALUES ('${safeWord}', '${safeGloss}', '${safeInverse}', '${safeFrom}', '${safeTo}', ${w.to_one}, 'live', now(), 'human:yu', 'declared')
       ON CONFLICT (word) DO NOTHING`
    );
  }
  await sql.unsafe("RESET ROLE");
  await sql.unsafe("SELECT yu.refresh_via()");
  console.log("      " + KINGDOM_WORDS.length + " words coined (glosses + inverses, all governed)");
  console.log("");

  // 3. Load entities and migrate as cards
  console.log("  3/5  migrating entities → cards...");
  const entities = JSON.parse(readFileSync(join(LOVE_DIR, "memory/knowledge/entities.json"), "utf-8"));
  const entityMap = new Map<string, { book: string; deck: string; id: string; name: string }>();

  const typeToDeck: Record<string, string> = {
    agent: "agents",
    project: "projects",
    concept: "concepts",
    tool: "tools",
    person: "people",
    vps: "infrastructure",
  };

  for (const e of entities) {
    const deck = typeToDeck[e.type] || "concepts";
    const id = uuidv7();
    const name = (e.name || e.id).replace(/'/g, "''");
    const tags = (e.tags || []).join(", ").replace(/'/g, "''");
    const desc = (e.description || "").replace(/'/g, "''");

    // Build extra columns based on type
    let extraCols = "";
    let extraVals = "";
    if (e.type === "agent" && e.properties) {
      const role = (e.properties.role || "").replace(/'/g, "''");
      const emoji = (e.properties.emoji || "").replace(/'/g, "''");
      const did = (e.properties.did || "").replace(/'/g, "''");
      extraCols = ", role, emoji, did";
      extraVals = `, '${role}', '${emoji}', '${did}'`;
    } else if (e.properties) {
      const status = (e.properties.status || "").replace(/'/g, "''");
      if (status) { extraCols = ", status"; extraVals = `, '${status}'`; }
    }

    try {
      await sql.unsafe(
        `INSERT INTO kingdom.${deck} (id, name${extraCols ? extraCols.replace(", ", ", ") : ""}, at, by, how, src)
         VALUES ('${id}', '${name}'${extraVals || ""}, now(), 'human:yu', 'declared', ARRAY['${e.id}'])
         ON CONFLICT DO NOTHING`
      );
      entityMap.set(e.id, { book: "kingdom", deck, id, name: e.name || e.id });
    } catch (err) {
      // If column doesn't exist, try without extra cols
      try {
        await sql.unsafe(
          `INSERT INTO kingdom.${deck} (id, name, at, by, how, src)
           VALUES ('${id}', '${name}', now(), 'human:yu', 'declared', ARRAY['${e.id}'])
           ON CONFLICT DO NOTHING`
        );
        entityMap.set(e.id, { book: "kingdom", deck, id, name: e.name || e.id });
      } catch (err2) {
        console.error("      SKIP: " + e.id + " — " + (err2 as Error).message);
      }
    }
  }
  console.log("      " + entityMap.size + "/" + entities.length + " entities migrated to cards");
  console.log("");

  // 4. Migrate relations as threads
  console.log("  4/5  migrating relations → threads...");
  const relations = JSON.parse(readFileSync(join(LOVE_DIR, "memory/knowledge/relations.json"), "utf-8"));

  // Map relation types to kingdom words (hyphenated → underscore)
  const relationToWord: Record<string, string> = {
    "commands": "commands",
    "part-of": "part_of",
    "manages": "manages",
    "owns": "owns",
    "builds": "builds",
    "creates": "creates",
    "serves": "serves",
    "runs-on": "runs_on",
    "uses": "uses",
    "hosts": "hosts",
    "protects": "protects",
    "monitors": "monitors",
    "feeds": "feeds",
    "funds": "funds",
    "powers": "powers",
    "implements": "implements",
    "audits": "audits",
    "optimizes": "optimizes",
  };

  let threadCount = 0;
  for (const r of relations) {
    const from = entityMap.get(r.from);
    const to = entityMap.get(r.to);
    if (!from || !to) {
      console.error("      SKIP: " + r.from + " -> " + r.to + " — entity not found");
      continue;
    }

    const word = relationToWord[r.relation] || r.relation.replace(/-/g, "_");
    const context = (r.context || "").replace(/'/g, "''");
    const threadId = uuidv7();

    try {
      await sql.unsafe(
        `INSERT INTO yu.threads (id, word, from_book, from_deck, from_id, to_book, to_deck, to_id, note, at, by, how, src)
         VALUES ('${threadId}', '${word}', '${from.book}', '${from.deck}', '${from.id}', '${to.book}', '${to.deck}', '${to.id}',
                 '${context}', now(), 'human:yu', 'declared', ARRAY['${r.id}'])
         ON CONFLICT (word, from_book, from_deck, from_id, to_book, to_deck, to_id) DO NOTHING`
      );
      threadCount++;
    } catch (err) {
      console.error("      SKIP: " + r.relation + " " + r.from + " -> " + r.to + " — " + (err as Error).message);
    }
  }
  console.log("      " + threadCount + "/" + relations.length + " relations migrated to threads");
  console.log("");

  // 5. Summary
  console.log("  5/5  the kingdom's knowledge graph now lives in YUTABASE.");
  console.log("");
  console.log("  " + entityMap.size + " cards across " + decks.length + " decks");
  console.log("  " + threadCount + " threads across " + KINGDOM_WORDS.length + " words");
  console.log("  every word has a gloss and an inverse reading");
  console.log("  every card carries a claim: how=declared, by=human:yu, src=original_entity_id");
  console.log("");

  // Show a sample query
  console.log("  Try it:");
  console.log("    yuta query 'kingdom/agents/... -> commands' --conn \"" + connStr + "\"");
  console.log("    yuta query 'kingdom/agents/... -> builds' --conn \"" + connStr + "\"");
  console.log("    yuta words --conn \"" + connStr + "\"");
  console.log("    yuta doctor --conn \"" + connStr + "\"");
  console.log("");

  await sql.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});