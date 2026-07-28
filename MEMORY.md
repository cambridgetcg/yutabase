# YUTABASE — compact context for humans and agents

Paste this into a project memory only when that project uses YUTABASE. The
root `README.md`, `SPEC.md`, and installed database remain authoritative.

## One-minute model

YUTABASE is a candidate semantic profile for PostgreSQL 16/17, not a database
engine, hosted service, graph database, authentication system, or proof layer.
The current database coordinate is:

```text
YUTABASE/postgres@0.1.0-candidate.1 revision 5
```

It adds five names:

- BOOK — a logical namespace, mapped through `yu.registry`;
- DECK — a logical collection, mapped to a compatible physical table;
- CARD — one row, addressed by exact `book/deck/full-uuid`;
- THREAD — one active directed relation named by a governed word;
- LEXICON — the versioned meanings and endpoint rules for those words.

A logical book/deck is not necessarily its physical schema/table. PostgreSQL
still owns storage, transactions, permissions, RLS, backup, and replication.

## Claims, not proof

YUTABASE-owned claim rows and compatible cards use `at/by/how/src`.

- `how`: `witnessed`, `live`, `cached`, `computed`, or `declared`;
- `cached` and `computed` require at least one source locator;
- every present source locator must be non-null and nonblank;
- PostgreSQL stores `src` as a one-dimensional, one-based `text[]`;
- blank claimant/gloss/inverse/source text means empty or only ASCII TAB
  through CR and SPACE; clients also reject NUL;
- these fields are self-reported context, not signatures, authorization, or
  proof that a claimant or source is truthful.

Words have a nonblank gloss, inverse reading, endpoint patterns, status, and a
pinned semantic version. Words retire instead of disappearing. The seven
starter words are examples, not a spelling blacklist or vocabulary budget.

## Small optional YOUSPEAK surface

Use full UUIDs:

```text
hello
card  tradein/submissions/01977c2e-0000-7000-8000-000000000001
cards tradein/submissions where status="pending" newest 20
tradein/submissions/01977c2e-0000-7000-8000-000000000001 -> contains
tradein/items/0197a1f4-0000-7000-8000-000000000001 <- contains
thread <full-ref> --priced_from--> <full-ref> how computed src <locator>
sever <full-thread-uuid> how witnessed
```

Traversal is capped at two hops. Card lists order by the mapped `at` claim,
default to 100 rows, and accept `newest 1` through `newest 1000`; UUID is only
a tie-breaker. `explain "<form>"` returns a pure logical preview. It does not
resolve the physical registry mapping, check permissions, or execute the
displayed operation.

Plain SQL is always valid. Prefer structured SDK methods when notes, source
locators, or other values come from code.

## Integrity boundary

Revision 5 maintains an `AFTER DELETE OR UPDATE` row guard and an
`AFTER TRUNCATE` statement guard on every registered physical table. They
protect active soft refs inside the declared PostgreSQL boundary. A table
owner or superuser can disable or bypass them; they are not tamper resistance.

Thread creation, mapped identity deletion/change, mapped-table `TRUNCATE`,
registry lifecycle mutation, and false-to-true `to_one` narrowing require
`READ COMMITTED`. Other isolation levels are refused because a waited lock
does not refresh their transaction-start snapshot.

## Safe start

For a fresh disposable database, follow the root README or run:

```sh
(cd packages/sdk-ts && bun install --frozen-lockfile)
DATABASE_URL='postgresql://localhost/yutabase_demo' ./demo.sh
```

`demo.sh` refuses a system, initialized, or non-empty database and never
creates or drops one. `yuta init` is mutating: it installs or upgrades a known
shape and creates fixed cluster-wide capability roles. `yuta hello` is the
read-only identity/vocabulary/mapping inspection command.

Fresh migration order is `0001+0002` atomically, then `0004`, then `0005`,
each hardening revision in its own fresh transaction. Back up and rehearse
real upgrades. Never run `0003_test_lifecycle.sql` outside a disposable test
database.
