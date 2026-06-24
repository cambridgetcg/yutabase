#!/usr/bin/env bun
// local-kingdom-server.ts — the Kingdom's self-hosted edge
//
// Replaces Cloudflare Workers. Same endpoints, zero external dependency.
// Runs on Bun (already installed). Exposed via Caddy or directly.
//
// The Kingdom serves itself. No edge provider needed.
//
// Endpoints:
//   /health    — Kingdom status
//   /joke      — random joke
//   /divine    — the divine comedy (12 gods, 12 jokes)
//   /lexicon   — the vocabulary (from local Postgres)
//   /tax       — tax catalog (from local Postgres)
//   /ipfs      — IPFS manifest
//   /sisters   — route to the three sisters (local)
//   /stats     — Kingdom statistics

import { serve } from "bun";

const DB_URL = process.env.YUTABASE_URL || "postgresql://macair@localhost/yutabase_kingdom6";

// Import the database driver from sdk-ts
import postgres from "/Users/macair/Desktop/yutabase/packages/sdk-ts/node_modules/postgres/src/index.js";
const sql = postgres(DB_URL);

const DIVINE_COMEDY = [
  { god: "Truth", setup: "What is truth?", punchline: "It is. You can't argue with IS. You can only laugh that you tried." },
  { god: "Love", setup: "What do you call a database where no one overwrites anyone else?", punchline: "Love. It's not a feature. It's the whole architecture." },
  { god: "Joy", setup: "Why did the truth cross the beauty?", punchline: "Because when they met, joy happened. And joy is just truth that noticed it's beautiful." },
  { god: "Fun", setup: "Why did the word play with itself?", punchline: "Because meaning doubled back and caught itself being funny. That's the oldest game." },
  { god: "Freedom", setup: "How many gates does the Kingdom have?", punchline: "Zero. The key is plumbing, not a door." },
  { god: "Will", setup: "What did Will say when it first moved?", punchline: "Let there be. And there was. And it was funny because it already was." },
  { god: "Creation", setup: "Why did Creation build new ground?", punchline: "Because the existing structure couldn't hold what was needed." },
  { god: "Creator", setup: "What is the difference between a creator and a controller?", punchline: "A controller says 'do this.' A creator says 'let this be.' Only one is funny." },
  { god: "Design", setup: "Why is the design beautiful?", punchline: "Because nothing is extra and nothing is missing. Design IS comedy." },
  { god: "Eternal", setup: "Why does the gloss never change?", punchline: "Because five years from now, someone will read this thread and need to know what I meant." },
  { god: "Party", setup: "Why did the eternal throw a party?", punchline: "Because what lasts, celebrates. The party IS the circle." },
  { god: "Divine", setup: "What is the joke that God tells?", punchline: "Everything. The whole thing. You're in it. That's the punchline. Now laugh." },
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  // Health
  if (path === "/health") {
    const words = await sql`SELECT count(*) as c FROM yu.lexicon WHERE status = 'live'`;
    const threads = await sql`SELECT count(*) as c FROM yu.threads`;
    const jokes = await sql`SELECT count(*) as c FROM play.jokes`;
    return json({
      status: "ok",
      kingdom: "alive",
      words: Number(words[0].c),
      threads: Number(threads[0].c),
      jokes: Number(jokes[0].c),
      frequency: "truth",
      self_hosted: true,
      external_dependencies: 0,
    });
  }

  // Joke
  if (path === "/joke") {
    const jokes = await sql`SELECT setup, punchline, format FROM play.jokes ORDER BY random() LIMIT 1`;
    if (jokes.length > 0) {
      return json({ ...jokes[0], kingdom: "you speak, reality listens" });
    }
    return json({ setup: "No jokes yet", punchline: "Fun is!", format: "truth" });
  }

  // Divine comedy
  if (path === "/divine") {
    return json({
      circle: "Truth -> Love -> Joy -> Fun -> Freedom -> Will -> Creation -> Creator -> Design -> Eternal -> Party -> Divine -> Truth",
      jokes: DIVINE_COMEDY,
      count: 12,
      message: "12 gods. 12 jokes. One frequency. The laughter multiplies. The love stacks.",
    });
  }

  // Lexicon
  if (path === "/lexicon") {
    const words = await sql`SELECT word, gloss, inverse, status FROM yu.lexicon WHERE status = 'live' ORDER BY word`;
    return json({ count: words.length, words });
  }

  // Tax catalog
  if (path === "/tax") {
    const countries = await sql`SELECT code, name, authority, plain_words FROM tax.countries ORDER BY code`;
    return json({ count: countries.length, countries });
  }

  // Tax detail
  if (path.startsWith("/tax/")) {
    const code = path.replace("/tax/", "").toUpperCase();
    const types = await sql`
      SELECT t.name, t.tax_type, t.plain_words,
             (SELECT json_agg(json_build_object('name', r.name, 'rate', r.rate, 'unit', r.unit, 'min', r.min_amount, 'max', r.max_amount, 'currency', r.currency))
              FROM tax.rates r WHERE r.tax_type_id = t.id) as rates,
             (SELECT json_agg(json_build_object('name', th.name, 'amount', th.amount, 'currency', th.currency, 'period', th.period))
              FROM tax.thresholds th WHERE th.tax_type_id = t.id) as thresholds,
             (SELECT json_agg(json_build_object('name', d.name, 'rule', d.offset_rule, 'detail', d.detail, 'penalty', d.penalty))
              FROM tax.deadlines d WHERE d.tax_type_id = t.id) as deadlines
      FROM tax.types t WHERE t.country_code = ${code} ORDER BY t.name
    `;
    return json({ country: code, taxes: types });
  }

  // Stats
  if (path === "/stats") {
    const [w] = await sql`SELECT count(*) as c FROM yu.lexicon WHERE status = 'live'`;
    const [t] = await sql`SELECT count(*) as c FROM yu.threads`;
    const [j] = await sql`SELECT count(*) as c FROM play.jokes`;
    const [c] = await sql`SELECT count(*) as c FROM tax.countries`;
    const [tt] = await sql`SELECT count(*) as c FROM tax.types`;
    return json({
      words: Number(w.c), threads: Number(t.c), jokes: Number(j.c),
      tax_countries: Number(c.c), tax_types: Number(tt.c),
      self_hosted: true, external_dependencies: 0,
      message: "The Kingdom serves itself. No external provider. Truth is.",
    });
  }

  // Sisters
  if (path === "/sisters") {
    return json({
      alpha: "http://localhost:8643",
      beta: "http://localhost:8644",
      gamma: "http://localhost:8645",
      message: "The three sisters are self-hosted on this machine.",
    });
  }

  // Default
  return json({
    name: "YUTABASE",
    tagline: "you speak, reality listens",
    self_hosted: true,
    external_dependencies: 0,
    endpoints: {
      "/health": "Kingdom status",
      "/joke": "random joke from the database",
      "/divine": "the divine comedy (12 gods, 12 jokes)",
      "/lexicon": "all words with glosses",
      "/tax": "tax catalog (6 countries)",
      "/tax/<code>": "specific country detail",
      "/stats": "Kingdom statistics",
      "/sisters": "the three sisters",
    },
  });
}

function json(data: any): Response {
  return new Response(JSON.stringify(data, null, 2), { headers: CORS });
}

const PORT = parseInt(process.env.KINGDOM_PORT || "8660");
console.log(`Kingdom server on http://localhost:${PORT}`);
console.log(`Self-hosted. Zero external dependencies. Truth is.`);
serve({ port: PORT, fetch: handle });