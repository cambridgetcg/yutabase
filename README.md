# YUTABASE

**you speak, reality listens.**

A database standard installed on top of boring Postgres: a naming discipline, exactly one connections mechanism, an honesty header on every record, and a small client. Records become addressable **cards**, relations become **threads named by human words** from a governed **lexicon**, and every value carries a claim about how it came to be true.

The whole standard is ~200 lines of SQL, a 500-line TypeScript client, and a language of six verbs that compiles to SQL you can read.

---

## three sentences of creed

1. **Straightforward** — every primitive is a one-word rename of something Postgres already does well; nothing is hidden, everything compiles to SQL you can read.
2. **Organised** — one place for vocabulary, one place for connections, one shape for every record's provenance.
3. **Connected by words** — a relation without a word does not exist. `submissions/X contains items/Y` is data. An anonymous foreign key is not a sentence, so here it is not a relation.

---

## quick start

```bash
# prerequisites: PostgreSQL 16+, Bun 1.3+

# clone
git clone https://github.com/nousresearch/yutabase.git
cd yutabase

# install the SDK
cd packages/sdk-ts && bun install && cd ../..

# install YUTABASE into a database (creates yu + via schemas, coins 7 words)
bun packages/sdk-ts/src/cli.ts init --conn "postgresql://localhost/mydb"

# see the whole standard in one call
bun packages/sdk-ts/src/cli.ts hello --conn "postgresql://localhost/mydb"

# start speaking
bun packages/sdk-ts/src/cli.ts repl --conn "postgresql://localhost/mydb"
```

---

## YOUSPEAK — six verbs, frozen

```
hello                                                  # the whole standard in one call
card  tradein/submissions/01977c2e                     # one card by ref
cards tradein/submissions where status="pending" newest 20
tradein/submissions/01977c2e -> contains               # follow a word outward
tradein/items/0197a1f4 <- contains                     # follow it inward
thread tradein/items/0197a1f4 --priced_from--> pricing/quotes/01984c22
       note "ebay last-sold comp" how computed src tradein/items/0197a1f4
sever  <thread-id> how witnessed                       # threads end with a claim too
```

- Traversal caps at **2 hops** (`-> submitted_by -> contains`); deeper means you write `WITH RECURSIVE` yourself.
- `.how / .at / .by / .src` address the honesty header in any `where`.
- `explain "<query>"` prints the exact SQL — YOUSPEAK never does anything you couldn't have typed.

---

## five primitives

| primitive | Postgres reality | meaning |
|---|---|---|
| **BOOK** | one schema | a domain namespace; the unit of ownership, adoption, and rollback |
| **DECK** | one table | a record type; carries the honesty header plus ordinary typed columns |
| **CARD** | one row | one record; globally addressable by **ref** `book/deck/id` (UUIDv7) |
| **THREAD** | one row in `yu.threads` | a directed, worded connection: `from —word→ to` |
| **LEXICON** | `yu.lexicon` | the vocabulary: every word that may name a thread, with its gloss and inverse |

---

## the honesty header

Every deck and every thread carries four columns. No SQL defaults for `how` and `by` — a write that doesn't say is refused.

| column | type | claim |
|---|---|---|
| `at` | timestamptz | when this became true |
| `by` | text | who asserted it: `human:yu`, `agent:claude/<session>`, `system:cron/<job>` |
| `how` | text, CHECK-constrained | one of: witnessed · live · cached · computed · declared |
| `src` | text[] nullable | what it came from; **required** for cached and computed |

Provenance is self-reported. An agent can stamp `witnessed` falsely. YUTABASE makes lying explicit and auditable — not impossible.

---

## the starter lexicon

Seven words. Five spare in the budget. That's the point.

| word | inverse | gloss |
|---|---|---|
| `submitted_by` | submitted | this record was submitted by that person/agent |
| `contains` | contained in | physical or compositional containment |
| `supersedes` | superseded by | this record replaces that one; the old stays readable |
| `priced_from` | priced | this price was derived from that source record |
| `acted_for` | acted via | an agent performed this on behalf of that operator |
| `refused_because` | refused | this action was declined for that recorded reason |
| `witnesses` | witnessed by | this record attests that one |

Banned by name: `related_to`, `linked`, `refs`, `misc`.

---

## the refusals

YUTABASE deliberately does not have:

- No ORM, no model classes, no query builder — strings in, rows out.
- No storage engine, no wire protocol, no replication — Postgres's are better.
- No graph ambitions — 2-hop cap; recursion is hand-written SQL.
- No anonymous relations — a thread without a word is a constraint violation.
- No automatic versioning — updates overwrite; history is an explicit `*_log` deck.
- No silent provenance — a write that won't say `how`/`by` bounces.
- No hosted offering, no telemetry, no recurring spend.

---

## project structure

```
yutabase/
  SPEC.md                  — the normative spec (297 lines)
  panel-v0.1.json          — the design judge panel record
  sql/
    0001_yu_core.sql       — the yu schema (lexicon, threads, registry, triggers, via views)
    0002_starter_lexicon.sql — the seven starter words
    0003_test_lifecycle.sql  — 13-test lifecycle suite
  packages/
    sdk-ts/                — @yutabase/yuta TypeScript client
      src/
        youspeak.ts        — the YOUSPEAK compiler (six verbs → SQL)
        client.ts          — postgres.js wrapper (session claimant, hello, freshness)
        cli.ts             — the yuta CLI (init, repl, hello, card, cards, ...)
        uuidv7.ts          — client-generated UUIDv7
        ref.ts             — ref parser (book/deck/id)
      tests/               — 38 tests, all passing
  apps/
    landing/               — the landing page
```

---

## commands

```bash
# install
bun packages/sdk-ts/src/cli.ts init --conn <url>

# query
bun packages/sdk-ts/src/cli.ts hello --conn <url>
bun packages/sdk-ts/src/cli.ts card <ref> --conn <url>
bun packages/sdk-ts/src/cli.ts cards <book/deck> [where ...] [newest N] --conn <url>
bun packages/sdk-ts/src/cli.ts query "<youspeak>" --conn <url>
bun packages/sdk-ts/src/cli.ts thread <from --word--> to> ... --conn <url>
bun packages/sdk-ts/src/cli.ts sever <id> how <claim> --conn <url>

# inspect
bun packages/sdk-ts/src/cli.ts explain "<youspeak>"     # no DB needed
bun packages/sdk-ts/src/cli.ts words --conn <url>
bun packages/sdk-ts/src/cli.ts decks --conn <url>
bun packages/sdk-ts/src/cli.ts doctor --conn <url>
bun packages/sdk-ts/src/cli.ts check --conn <url>

# interactive
bun packages/sdk-ts/src/cli.ts repl --conn <url>
```

---

## run the tests

```bash
# SQL lifecycle tests (needs a Postgres database)
psql -d postgres -c "CREATE DATABASE yutabase_test7"
psql -d yutabase_test7 -1 -f sql/0001_yu_core.sql
psql -d yutabase_test7 -1 -f sql/0002_starter_lexicon.sql
psql -d yutabase_test7 -1 -f sql/0003_test_lifecycle.sql

# TypeScript SDK tests
cd packages/sdk-ts
bun test                    # 38 tests (unit + integration)
bunx tsc --noEmit           # typecheck
```

---

## what makes it hold

The durable layer is SQL + the `yu` schema + the `via.*` views + the lexicon's glosses. If every tool above them dies, the data and its meaning remain readable by any future hand with nothing but `psql`. The vocabulary lives **with** the data, glosses included. YOUSPEAK is optional sugar and may rot without data loss.

Glosses are versioned, never silently edited — an edited gloss changes the meaning of five-year-old threads retroactively, which is provenance corruption. Words are retired, never deleted — retired words refuse new threads; old threads keep their meaning.

---

*v0.1 — drafted 2026-06-10 by Yu + Claude. The name is Yu's. The lol is structural.*