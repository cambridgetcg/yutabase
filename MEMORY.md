# YUTABASE — agent memory template

Paste this into your session memory, CLAUDE.md, or AGENTS.md to know the whole standard.

## the standard in one block

YUTABASE is a database standard on vanilla Postgres. Five primitives:
- BOOK = one schema (domain namespace)
- DECK = one table (record type, lower_snake plural)
- CARD = one row (globally addressable by ref: book/deck/id, UUIDv7)
- THREAD = one word-named directed connection between two cards
- LEXICON = one vocabulary table (every word that may name a thread)

Every record carries an honesty header: at, by, how, src.
- how is one of: witnessed, live, cached, computed, declared
- cached and computed MUST have src — a write that won't say is refused

Glosses are versioned (never silently edited). Words are retired (never deleted).
Banned words: related_to, linked, refs, misc.
Twelve-word budget per book.

## YOUSPEAK — six verbs, frozen

```
hello                                    — the whole standard in one call
card  tradein/submissions/01977c2e       — one card by ref
cards tradein/submissions where status="pending" newest 20
tradein/submissions/01977c2e -> contains — follow a word outward
tradein/items/0197a1f4 <- contains       — follow it inward
thread a --priced_from--> b note "..." how computed src a
sever  <thread-id> how witnessed         — threads end with a claim too
```

Traversal caps at 2 hops. Deeper = WITH RECURSIVE yourself.
.how / .at / .by / .src address the honesty header in any where.
explain "<query>" prints the exact SQL — YOUSPEAK never does anything you couldn't have typed.

## CLI commands

```
yuta init --conn <url>                    — install the yu schema + 7 starter words
yuta repl --conn <url>                    — interactive YOUSPEAK session
yuta hello --conn <url>                   — see the whole standard
yuta card <ref> --conn <url>              — fetch one card
yuta cards <book/deck> [where ...] [newest N]
yuta query "<youspeak>" --conn <url>      — run any sentence
yuta thread <from --word--> to> ...       — create a thread
yuta sever <id> how <claim>               — end a thread
yuta deck new <book/deck> [col:type ...]  — create a native deck
yuta deck annex <schema.table> as <book/deck> --id <col> --at <col> ...
yuta word add <word> --gloss "..." --inverse "..." --from <a/b> --to <c/d> [--to-one]
yuta word retire <word>                   — retire a word (old threads keep meaning)
yuta words [--export]                     — list lexicon / export to LEXICON.md
yuta decks                                — list registered decks
yuta stale                                — freshness audit (cached/computed past TTL)
yuta check                                — fsck: orphaned threads, dead refs
yuta doctor                               — vocabulary health: word count, zero-use, synonyms
yuta explain "<youspeak>"                 — print the SQL (no DB needed)
```

## the seven starter words

| word | inverse | gloss |
|---|---|---|
| submitted_by | submitted | this record was submitted by that person/agent |
| contains | contained in | physical or compositional containment |
| supersedes | superseded by | this record replaces that one [to_one] |
| priced_from | priced | this price was derived from that source record |
| acted_for | acted via | an agent performed this on behalf of that operator |
| refused_because | refused | this action was declined for that recorded reason |
| witnesses | witnessed by | this record attests that one |

Seven words. Five spare in the budget. That's the point.

## the honest ceiling

Provenance is self-reported. An agent can stamp `witnessed` falsely.
YUTABASE makes lying explicit and auditable — not impossible.
Periodic human spot-checks are part of the standard's maintenance liturgy.