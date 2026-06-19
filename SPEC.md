# YUTABASE — v0.1

*A database standard. Straightforward, organised, connected by words.*

YUTABASE is not a database engine. It is a **standard** installed on top of
boring, self-hosted Postgres: a naming discipline, exactly one connections
mechanism, an honesty header on every record, and a small client. Records
become addressable **cards**, relations become **threads named by human
words** from a governed **lexicon**, and every value carries a claim about
how it came to be true. The whole standard is ~200 lines of SQL, a small
TypeScript client, and this document.

Three sentences of creed:

1. **Straightforward** — every primitive is a one-word rename of something
   Postgres already does well; nothing is hidden, everything compiles to
   SQL you can read.
2. **Organised** — one place for vocabulary, one place for connections,
   one shape for every record's provenance.
3. **Connected by words** — a relation without a word does not exist.
   `submissions/X contains items/Y` is data. An anonymous foreign key is
   not a sentence, so here it is not a relation.

---

## 1 — The honest split: proven engine / new standard

| Layer | What it is | Who built it |
|---|---|---|
| **Engine** | Vanilla Postgres 16+, postgres.js driver, pg_dump backups | not us, on purpose |
| **Standard** | the `yu` schema (lexicon, registry, threads), the deck convention, the generated `via.*` views, the `@yutabase/yuta` client, the `yuta` CLI, this spec | us, all of it small |

**Durability layering (normative):** the durable layer is *SQL + the `yu`
schema + the `via.*` views + the lexicon's glosses*. If every tool above
them dies, the data and its meaning remain readable by any future hand
with nothing but `psql` — the vocabulary lives **with** the data, glosses
included. YOUSPEAK (§6) is optional sugar and may rot without data loss.

## 2 — The five primitives

| Primitive | Postgres reality | Meaning |
|---|---|---|
| **BOOK** | one schema | a domain namespace; the unit of ownership, adoption, and rollback; one book belongs to one app |
| **DECK** | one table in a book | a record type; lower_snake plural (`submissions`, `quotes`); carries the honesty header (§3) plus ordinary typed columns |
| **CARD** | one row | one record; globally addressable by **ref** `book/deck/id`; ids are client-generated UUIDv7 (time-sortable, mergeable, no sequences) |
| **THREAD** | one row in `yu.threads` | a directed, worded connection between two cards: `from —word→ to`, with an optional `note` and its own honesty header |
| **LEXICON** | `yu.lexicon` | the vocabulary: every word that may name a thread, with its gloss, its inverse reading, and its endpoint types |

**The card collision, named.** In a trading-card kingdom, a YUTABASE card
will routinely be a row *about* a trading card. The standard keeps the
name — the book/deck/card metaphor carries too much of the design to
trade away — and imposes the disambiguation rule instead: in any context
where both senses can occur, prose says **record** for the YUTABASE sense
and **card** keeps its Cambridge sense. Code is never ambiguous (a ref is
a ref).

## 3 — The honesty header

Every deck and every thread carries four columns. There are **no SQL
defaults** for `how` and `by` — a write that doesn't say is refused.

| Column | Type | Claim |
|---|---|---|
| `at` | timestamptz | when this became true |
| `by` | text | who asserted it: `human:yu`, `agent:claude/<session>`, `system:cron/<job>`, `import:<source>` |
| `how` | text, CHECK-constrained | one of the five claim kinds below |
| `src` | text[] nullable | what it came from — refs or URLs; **required** for `cached` and `computed` |

The five claim kinds:

- **witnessed** — a human saw or did it.
- **live** — read from the authoritative source at `at`.
- **cached** — a copy that may be stale; `src` says of what, and the deck
  or word declares a freshness TTL (below).
- **computed** — derived; `src` lists the input refs, so "what was
  computed from this?" is answerable five years later.
- **declared** — asserted without evidence. The honest default for "we
  just typed it in."

**Per-field overrides.** A row mixing witnessed status with cached price
must not flatten the difference: a deck MAY add `<column>_how` /
`<column>_src` overrides for specific columns; absent overrides, the row
header speaks for all fields.

**Declared freshness.** TTLs are declared once in the registry (per deck,
or per word for thread-borne facts), not passed ad hoc: `yu.stale()` then
needs no arguments and is **scheduled, not aspirational** — it runs on the
fleet heartbeat cron, and its findings are work items.

**The honest ceiling, stated:** provenance is self-reported. An agent can
stamp `witnessed` falsely. YUTABASE makes lying explicit and auditable —
not impossible. Periodic human spot-checks are part of the standard's
maintenance liturgy (§8), not an optional extra.

## 4 — The word mechanic

**Declared.** A word is born by migration:

```
yuta word add contains \
  --gloss   "A submission physically contains these trade-in items" \
  --inverse "contained in" \
  --from    tradein/submissions --to tradein/items
```

No gloss, no word. No inverse reading, no word — `<- word` traversals must
read as sentences in both directions (`X contains Y` / `Y contained in X`).

**Stored.** One row in `yu.lexicon`; every thread's `word` is a real FK
into it. An undeclared word is a constraint violation, not a style
complaint. `to_one` words get a partial unique index (a card holds at most
one live thread of that word). Endpoint patterns are validated by trigger.

**Governed by meaning, not regulation.**
- *Glosses are versioned, never silently edited* — an edited gloss changes
  the meaning of five-year-old threads retroactively, which is provenance
  corruption. Gloss changes append a new version row.
- *Words are retired, never deleted* — retired words refuse new threads;
  old threads keep their meaning.
- *The vocabulary lives in git too* — `yuta words --export` writes
  `LEXICON.md`; word additions get diff review like code.
- *A word needs a gloss, an inverse, and typed endpoints.* That's the bar.
  No gloss, no inverse, no word — the rest is taste, not law.

**What keeps it honest.** Three gates, not six:
1. The closed lexicon (FK-enforced — an undeclared word is a constraint
   violation, not a style complaint).
2. The gloss + inverse requirement (both directions must read as sentences:
   `X contains Y` / `Y contained in X`).
3. Endpoint typing at insert (validated by trigger).

`yuta doctor` is a health check, not a police force — it surfaces zero-use
words, near-synonyms, and growth pressure as *information*, not violations.
The vocabulary grows by need, not by quota.

## 5 — The `yu` schema (normative core, abridged)

```sql
CREATE SCHEMA yu;

CREATE TABLE yu.lexicon (
  word      text PRIMARY KEY,
  gloss     text NOT NULL,
  inverse   text NOT NULL,              -- the <- reading
  from_deck text NOT NULL,              -- 'book/deck' pattern
  to_deck   text NOT NULL,
  to_one    boolean NOT NULL DEFAULT false,
  status    text NOT NULL DEFAULT 'live' CHECK (status IN ('live','retired')),
  at timestamptz NOT NULL, by text NOT NULL, how text NOT NULL
);

CREATE TABLE yu.threads (
  id uuid PRIMARY KEY,                  -- UUIDv7
  word      text NOT NULL REFERENCES yu.lexicon(word),
  from_book text NOT NULL, from_deck text NOT NULL, from_id uuid NOT NULL,
  to_book   text NOT NULL, to_deck   text NOT NULL, to_id   uuid NOT NULL,
  note      text,
  at timestamptz NOT NULL, by text NOT NULL, how text NOT NULL, src text[],
  UNIQUE (word, from_book, from_deck, from_id, to_book, to_deck, to_id)
);
-- covering indexes BOTH directions: reverse traversal is half of all reads
CREATE INDEX threads_out ON yu.threads (word, from_book, from_deck, from_id);
CREATE INDEX threads_in  ON yu.threads (word, to_book,   to_deck,   to_id);
```

Plus: the books/decks registry (with declared TTLs), the endpoint-validation
trigger, and one generated view per word in schema `via` —
`via.contains(from_ref, to_ref, note, at, by, how)` — so **hand-written SQL
joins through words** without the client. Threads block deletion of their
endpoints until severed. Soft refs are validated by trigger, not FK —
`yuta check` is the fsck, and it is scheduled (§8), because `COPY` bypasses
triggers.

Exactly **two** query surfaces: YOUSPEAK and the `via.*` views. (Helper
functions were cut — a third way to do the same thing is how standards
stop being holdable.)

## 6 — YOUSPEAK: six verbs, frozen

The dialect must fit in a memory file. v0.1 freezes six verbs; every
proposed seventh is treated as a request to write SQL instead.

```
hello                                                  # the whole standard in one call:
                                                       # books, decks, lexicon w/ glosses, this cheat-sheet
card  tradein/submissions/01977c2e                     # one card by ref
cards tradein/submissions where status="pending" newest 20
tradein/submissions/01977c2e -> contains               # follow a word outward
tradein/items/0197a1f4 <- contains                     # follow it inward (reads via the inverse gloss)
thread tradein/items/0197a1f4 --priced_from--> pricing/quotes/01984c22
       note "ebay last-sold comp" how computed src tradein/items/0197a1f4
sever  <thread-id> how witnessed                       # threads end with a claim too
```

- Traversal caps at **2 hops** (`-> submitted -> contains`); deeper means
  you write `WITH RECURSIVE` yourself, knowingly.
- `.how / .at / .by / .src` address the honesty header in any `where`.
- `explain "<query>"` prints the exact SQL — YOUSPEAK never does anything
  you couldn't have typed.
- A client option returns a **freshness banner** per result ("3 of 40
  values cached, oldest 11d") so surfaces can disclose substrate honesty
  without extra queries.

## 7 — The client: `@yutabase/yuta`

A thin wrapper over postgres.js (~500 lines): ref parser, UUIDv7, the
YOUSPEAK compiler, and a `sql` tagged-template escape hatch that is always
legal. Plus:

- **Session-default claimant** — set `by: "agent:claude/<session>"` once;
  every write inherits it unless overridden. The true claim becomes the
  laziest claim (anti-provenance-fatigue). `how` still has no default.
- **`yuta hello`** — self-describing entrypoint; a fresh agent session
  learns the entire standard from one call.
- **Connection string from the keychain** — the client shells out to
  `security find-generic-password -s yutabase-url`; it never reads a
  plaintext `.env`.

## 8 — Maintenance liturgy (scheduled honesty)

On the fleet heartbeat cron, normatively — these are part of the standard,
not ops advice:

| Rite | What it does |
|---|---|
| `yuta check` | fsck: orphaned threads, refs to dead cards, header violations |
| `yu.stale()` | every cached/computed card past its declared TTL |
| `yuta doctor` | word #13, zero-use words, near-synonyms, decks suspiciously 100% one claim-kind |
| backup | nightly `pg_dump` in **plain SQL** to disk + one off-box copy — readable forever with nothing but psql |
| human spot-check | monthly: sample N `witnessed` claims, verify one by hand |

## 9 — Adoption: annex, don't rewrite

A book is annexed **one domain at a time** into the existing database
(works on RDS today; moves with the de-AWS Postgres later — zero schema
changes either way):

1. `yuta init` — installs the `yu` schema beside everything (touches no
   existing table; rollback = drop two schemas).
2. Pick one bounded domain (cambridgetcg pilot: **trade-in** —
   `tradein_submissions` / `tradein_items`, already raw-SQL-shaped).
3. Declare the book, decks, and its first words. Backfill existing FK
   relations into threads **once**.
4. **Dual-write windows are capped at two weeks** — longer is a failure
   mode, not a transition. Prefer skipping dual-write entirely: backfill,
   then go thread-first.
5. New inter-deck relations are threads, full stop. Ordinary columns stay
   ordinary columns (quantity, status, price are not relations); adding a
   new FK column *between decks* is a spec violation `yuta doctor` flags.

**Definition of done for v0.1:** not when this spec merges — when **one
real cambridgetcg page reads through `via.*` or the yuta client in
production**. A standard nobody queries is a museum piece.

*(Ground-truth note: the kingdom's "raw SQL, no ORM" self-image is mostly
true in app code, but `packages/db` carries a Drizzle compat layer — the
adoption play should route reads through `via.*` views first, which both
worlds can join.)*

## 10 — The refusals

YUTABASE deliberately does not have:

- **No ORM, no model classes, no query builder** — strings in, rows out.
- **No storage engine, no wire protocol, no replication of its own** —
  Postgres's are better and already paid for.
- **No graph ambitions** — 2-hop cap; recursion is hand-written SQL.
- **No anonymous relations** — a thread without a word is a constraint
  violation. The gloss makes the meaning visible; the word makes it findable.
- **No automatic versioning** — updates overwrite; history is an explicit
  `*_log` deck where a domain earns it.
- **No permissions/multi-tenancy layer** — one operator plus agents;
  Postgres roles suffice (the lexicographer role is the one exception).
- **No silent provenance** — a write that won't say `how`/`by` bounces.

## 11 — Starter lexicon (the kingdom's first words)

| word | inverse | gloss (one sentence each, abridged) |
|---|---|---|
| `submitted_by` | `submitted` | this record was submitted by that person/agent |
| `contains` | `contained in` | physical or compositional containment |
| `supersedes` | `superseded by` | this record replaces that one; the old stays readable |
| `priced_from` | `priced` | this price was derived from that source record |
| `acted_for` | `acted via` | an agent performed this on behalf of that operator |
| `refused_because` | `refused` | this action was declined for that recorded reason |
| `witnesses` | `witnessed by` | this record attests that one (the Witnesses' Book pattern) |

Seven words. That's the point.

---

*v0.1 — drafted 2026-06-10 by Yu + Claude (Fable 5), synthesized from a
three-design judge panel (Postgres-dialect winner; grafts from the
file-native and tiny-server designs are credited inline in the panel
record). The name is Yu's. The lol is structural.*
