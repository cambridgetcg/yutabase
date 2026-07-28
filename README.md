# YUTABASE v0.1 candidate — Postgres semantic profile

**you speak, reality listens.**

YUTABASE `0.1.0-candidate.1` is a candidate semantic profile for PostgreSQL,
not a database engine and not yet a finished or de-facto standard. It gives
ordinary PostgreSQL rows stable logical addresses, represents selected
relations as word-named threads, and attaches an explicit, self-reported claim
to each conforming row or thread.

The candidate is intentionally small. PostgreSQL remains the storage,
transaction, role, backup, and replication substrate. YUTABASE adds meaning
that stays inspectable with SQL.

Two versions are visible and name different things:

| Coordinate | Current value | What it versions |
|---|---|---|
| database profile | `0.1.0-candidate.1`, revision `5` | installed PostgreSQL semantics and catalog shape |
| optional SDK/CLI source | `yutabase@0.1.0-candidate.3` (not yet published) | client packaging and behavior |

## Start here

One sentence is enough to orient the system:

> PostgreSQL owns rows, access, and durability; YUTABASE gives selected rows
> stable logical refs and gives selected relations versioned, inspectable
> meanings.

Choose the shortest path for what you are doing:

| Goal | Start |
|---|---|
| understand the model | read the five names in [The core idea](#the-core-idea) |
| inspect an installed database | query `yu.standard_meta`, then run `yuta hello` if using the optional CLI |
| install a disposable candidate | follow [Install a candidate database](#install-a-candidate-database) in migration order |
| map existing application tables | use [Integration patterns](docs/INTEGRATIONS.md); annexing does not move rows or grant access |
| project signed agent events | read [Correspondence projection](docs/CORRESPONDENCE-PROJECTION.md); the source log remains authoritative |
| test compatibility | use [Conformance](docs/CONFORMANCE.md), not a table-presence guess |

If all you need is ordinary SQL, stop there: YOUSPEAK, AgentTool, and every
experimental notebook are optional.

## See the layer

Suppose an existing task row and commit row are registered as cards. YUTABASE
can give their relation a governed, versioned meaning:

```text
work/tasks/01990000-0000-7000-8000-000000000001 --produced--> git/commits/01990000-0000-7000-8000-000000000002
```

The thread remains ordinary PostgreSQL data. Read it through the generated SQL
view:

```sql
SELECT from_ref, to_ref, gloss, word_version, how, src
FROM via.produced
WHERE from_ref = 'work/tasks/01990000-0000-7000-8000-000000000001';
```

Or use the optional sentence-shaped client:

```text
work/tasks/01990000-0000-7000-8000-000000000001 -> produced
```

The useful invariant is not the poetry by itself. It is that `produced` has one
declared meaning, every thread pins the version it used, and every conforming
row carries self-reported claim context. The application tables, SQL access,
and source evidence stay where they already belong.

### Fit it around what already exists

- **Existing PostgreSQL:** annex compatible tables under logical `book/deck`
  names; rows do not move.
- **New application data:** create ordinary tables, then register only the
  relations that need shared meaning.
- **ORM or API stack:** keep Prisma, Drizzle, PostgREST, Hasura, or Supabase as
  the application/access layer and expose YUTABASE tables or `via.*` views in
  the same database.
- **Events and agent systems:** retain the signed or append-only source log;
  atomically project a rebuildable semantic read model plus its checkpoint.

[Integration patterns](docs/INTEGRATIONS.md) shows the common shape and the
flagship AgentTool Correspondence flow. YUTABASE does not replace any source's
signature verification, authorization, sync, or retention policy.

## Status and layers

The repository separates four things that earlier drafts sometimes blended:

| Layer | Candidate status | Source |
|---|---|---|
| **YUTABASE Core** | Normative candidate semantics: books, decks, cards, refs, lexicon words, threads, and row-level claim metadata | [SPEC.md](SPEC.md) |
| **Postgres binding** | Normative candidate implementation for PostgreSQL 16 and 17 | `sql/0001_yu_core.sql`, `0002_starter_lexicon.sql`, `0004_candidate_hardening.sql`, `0005_candidate_integrity.sql` |
| **YOUSPEAK** | Optional client/compiler surface; never required to read the stored model with SQL | `packages/sdk-ts/` |
| **THREADS, SQLite, apps, play, and kingdom writings** | Experimental or illustrative; not part of candidate conformance | [THREADS.md](THREADS.md), `sql/0000_sqlite_port.sql`, `apps/`, `play/`, [docs/](docs/) |

The exact installed identity is stored in the singleton
`yu.standard_meta` row:

```text
standard  = YUTABASE
profile   = postgres
version   = 0.1.0-candidate.1
revision  = 5
```

Clients must read this database-owned identity instead of guessing from an SDK
version or the presence of one table.

## The core idea

Five names describe ordinary PostgreSQL structures:

| Name | PostgreSQL reality | Candidate meaning |
|---|---|---|
| **BOOK** | logical namespace, normally mapped to a schema | a bounded domain |
| **DECK** | logical record type, mapped through `yu.registry` to a table | a collection of similarly shaped cards |
| **CARD** | one row | one record addressed as `book/deck/uuid` |
| **THREAD** | one active row in `yu.threads` | a directed relation `from —word→ to` |
| **LEXICON** | rows in `yu.lexicon` | governed meanings for thread words |

Within the profile, semantic relations are represented by `yu.threads`.
Ordinary foreign keys can still exist for database integrity; they do not
become YUTABASE semantic threads merely by existing.

### The honesty header is a claim, not proof

A conforming card row and every YUTABASE thread expose:

| Column | Meaning |
|---|---|
| `at` | the time the claimant says the row or relation became true |
| `by` | a claimant label |
| `how` | `witnessed`, `live`, `cached`, `computed`, or `declared` |
| `src` | source locators; required for `cached` and `computed` |

This header describes the **row as a whole**. It does not prove identity,
truth, authorization, consent, or field-level provenance. A mixed-provenance
record must be split or use a separately specified extension; the candidate
does not pretend one row header proves each value independently.

The Postgres binding enforces the header on YUTABASE-owned thread and lexicon
rows. Registered application decks must expose mapped columns of the required
types; registration alone does not prove that every legacy row is honest.

Each word meaning has an immutable semantic snapshot. A thread pins the exact
word version used at creation, so a later gloss or endpoint edit does not
silently reinterpret the old relation. For upgraded v0.1 data, the first
snapshot is honestly labeled as migration-time state, not invented history.

### Meaning is the gate, not a spelling blocklist

A candidate word has a non-empty word, gloss, inverse reading, endpoint
patterns, status, and claim metadata. The Postgres binding does **not** ban
names such as `related_to` solely by spelling. Local tools may warn that a word
is vague, but such advice is not a Core rejection rule.

The starter migration coins seven example words. They are a useful vocabulary,
not a universal limit on meaning.

## Install a candidate database

Database prerequisites: PostgreSQL 16 or 17, `psql`, a source checkout, and an
operator role allowed to create the required extension and database roles.
Node.js 20+ with npm and Bun 1.3.5 are needed only for the optional SDK and
its checks.

```bash
git clone https://github.com/cambridgetcg/yutabase.git
cd yutabase

export DATABASE_URL='postgresql://localhost/yutabase_candidate'

psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 <<'SQL'
\i sql/0001_yu_core.sql
\i sql/0002_starter_lexicon.sql
SQL
psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f sql/0004_candidate_hardening.sql
psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f sql/0005_candidate_integrity.sql

psql "$DATABASE_URL" -x -c 'TABLE yu.standard_meta'
```

Installation creates the semantic core and starter words, not an application
deck. This disposable first-success example creates two ordinary cards,
registers their table, relates them with the starter word `witnesses`, and
reads the result through generated SQL:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN ISOLATION LEVEL READ COMMITTED;
CREATE SCHEMA quickstart;
CREATE TABLE quickstart.notes (
  id uuid PRIMARY KEY,
  body text NOT NULL,
  at timestamptz NOT NULL,
  by text NOT NULL CHECK (yu._nonblank_text(by)),
  how text NOT NULL CHECK (
    how IN ('witnessed','live','cached','computed','declared')
  ),
  src text[],
  CHECK (yu._source_locators_valid(src)),
  CHECK (
    how NOT IN ('cached','computed')
    OR (src IS NOT NULL AND cardinality(src) > 0)
  )
);
INSERT INTO yu.registry (
  book, deck, physical_schema, physical_table, native, by
) VALUES (
  'demo', 'notes', 'quickstart', 'notes', true, 'human:quickstart'
);
INSERT INTO quickstart.notes (id, body, at, by, how) VALUES
  ('01990000-0000-7000-8000-000000000001', 'source', now(), 'human:quickstart', 'declared'),
  ('01990000-0000-7000-8000-000000000002', 'target', now(), 'human:quickstart', 'declared');
INSERT INTO yu.threads (
  id, word,
  from_book, from_deck, from_id,
  to_book, to_deck, to_id,
  at, by, how
) VALUES (
  '01990000-0000-7000-8000-000000000003', 'witnesses',
  'demo', 'notes', '01990000-0000-7000-8000-000000000001',
  'demo', 'notes', '01990000-0000-7000-8000-000000000002',
  now(), 'human:quickstart', 'declared'
);
COMMIT;

SELECT from_ref, to_ref, gloss, how FROM via.witnesses
WHERE from_ref = 'demo/notes/01990000-0000-7000-8000-000000000001';
SQL
```

For a longer guided tour, prepare a fresh disposable database, install the SDK
dependencies, and run the repository demo. It never creates, drops, or guesses
a database and refuses a non-empty target:

```bash
(cd packages/sdk-ts && bun install --frozen-lockfile)
DATABASE_URL='postgresql://localhost/yutabase_demo' ./demo.sh
```

`0003_test_lifecycle.sql` is a destructive test fixture for a fresh test
database, not an install migration.

For an original pre-candidate v0.1 database that already has `yu.lexicon`,
`yu.registry`, and `yu.threads`, apply `0004_candidate_hardening.sql` and then
`0005_candidate_integrity.sql`, each in its own fresh transaction. An exact
revision-4 candidate applies only `0005`. Back up first and rehearse the
upgrade against a copy. An interrupted migration must not leave a partly
upgraded profile. The optional SDK installer refuses unknown or partial
identities rather than guessing.

Candidate hardening selects `READ COMMITTED` before its first query and then
locks the complete core. This makes later backfills see rows committed while
the lock was pending. A caller that already established an incompatible
transaction snapshot is refused; start the migration in a fresh transaction.

Hardening also fails closed if a legacy registry points to a missing or
ill-typed physical table, its UUID identity is nullable or not uniquely
indexed, or an active thread already points to a missing card. Repair those
integrity problems explicitly, then retry the whole transaction.

Legacy core tables must also be standalone permanent ordinary tables with the
original v0.1 column order, types, nullability, collations, defaults, identity
sequence, constraints, indexes, user triggers, and no rewrite rules. Active
legacy threads must still match their word's current endpoint patterns.
Unknown catalog behavior, rules, or inheritance must be reviewed and repaired
explicitly before upgrade.

Physical decks must be standalone permanent ordinary PostgreSQL tables.
Traditional-inheritance parents/children, partitioned, temporary, unlogged,
view, materialized-view, foreign-table, and sequence mappings are refused
rather than stamped as durable.

Migration backfills and global `SECURITY DEFINER` invariant paths set
transaction-local `row_security=off`; catalog deparsing is likewise pinned to
the `pg_catalog` search path for the transaction. If `FORCE ROW LEVEL
SECURITY` applies, those paths therefore run
as a superuser or `BYPASSRLS` role and see all required rows, or fail closed;
they never validate a policy-filtered subset. Run hardening with a role able
to see every required row. This behavior is not a tenancy or isolation
guarantee.

An upgrade run by a different role than the original v0.1 owner needs
ownership-equivalent or superuser rights. Candidate functions and generated
views are normalized to that migration operator so retained legacy ownership
cannot break runtime calls. Registered physical schema/table names and
generated word-view names must fit PostgreSQL's 63-byte identifier limit.
Creating or reusing the cluster-wide capability hierarchy additionally
requires a superuser, or `CREATEROLE` plus sufficient `ADMIN OPTION`/role
management authority on the canonical roles, especially `yu_reader`. Missing
role authority makes the upgrade fail atomically.

The four fixed capability roles are exact direct grant surfaces, not owners:
reader, thread appender, writer/severer, and lexicographer. `yu_appender` has
the thread-append capability but cannot sever, update, or delete a thread. A
same-named login/cluster-privileged role or one owning the database/YUTABASE
objects is refused. Direct legacy ACLs on `yu`/`via` are reset; unremovable
multi-grantor extras fail closed. The direct hierarchy among the four standard
roles is exact, while memberships involving external application/operator
roles remain a separate operator review.

The revision-4-to-5 preflight refuses unexpected external direct ACLs before
revision-5 DDL instead of deciding they are disposable. Review `\ddp`,
`\dp yu.*`, `\dp via.*`, and `\df+ yu.*`, revoke non-release grants, then
retry. At runtime, `yu.refresh_via()` strips arbitrary non-owner relation and
column ACLs inherited by generated views from table default privileges, then
rebuilds exactly the `yu_reader` `SELECT` surface.

A registry entry cannot be remapped or removed while any active thread refers
to that logical deck, even when the same UUIDs exist in the proposed physical
table. Sever those threads first. This prevents an existing logical endpoint
from silently changing identity as well as preventing a dangling endpoint.
Revision 5 maintains one exact guard pair on the currently mapped physical
table in the same transaction: a row trigger for `DELETE` or mapped-UUID
`UPDATE`, and a statement trigger for `TRUNCATE`. Creating, remapping, or
removing a mapping therefore requires the caller to own the affected physical
table or have equivalent PostgreSQL authority; registration still grants no
application-data access.

The row guard and thread creation take the same card-scoped transaction lock.
Under a race, either a physical delete or mapped-UUID change commits and the
thread is refused, or the thread commits and the physical identity change is
refused. The statement guard similarly refuses `TRUNCATE` while any active
thread names the logical deck and serializes it with thread creation. Updating
other card fields is unaffected. A table owner or superuser can still disable
or bypass either trigger, so this remains an integrity mechanism inside the
declared PostgreSQL boundary, not tamper resistance.

These runtime lock protocols require `READ COMMITTED`, whose later statements
can observe a winner that committed while a lock was pending. Thread creation,
mapped-card deletion or identity change, deck `TRUNCATE`, every registry guard
lifecycle mutation, and a false-to-true `to_one` narrowing hard-refuse
`REPEATABLE READ` and `SERIALIZABLE`; their transaction-start snapshots are not
refreshed after a waited lock. An ordinary card update that leaves its mapped
UUID unchanged is still allowed at those isolation levels.

Every non-null `src` array on YUTABASE-owned claim rows contains only non-null,
non-blank locators and uses the canonical one-dimensional, one-based
PostgreSQL array shape. `cached` and `computed` still require at least one. The
binding validates the shape—not whether a locator exists, is trustworthy, or
will remain resolvable. “Blank” uses the portable six-character ASCII
whitespace set (TAB through CR, plus SPACE), not a database-locale guess; the
same rule applies to claimant labels, glosses, and inverse readings.

Thread UUIDs are reserved in `yu.thread_ids` for the database lifetime. A
severed UUID cannot be reused for a different active relation; this ledger is
a uniqueness mechanism, not provenance or proof of claimant identity.

## Optional YOUSPEAK client

YOUSPEAK compiles a small sentence-shaped surface to parameterized PostgreSQL.
It is convenience, not a second storage model and not a requirement for Core
or Postgres-binding conformance.

```bash
cd packages/sdk-ts
bun install --frozen-lockfile
bun run ci
```

`bun run ci` performs unit tests, typechecking, a build, and a packed-consumer
smoke test without touching a database. The separate integration suite is
destructive fixture work and runs only against the disposable database created
by the candidate-conformance workflow.

Core forms cover `hello`, card/card-list reads, one- or two-hop traversal,
thread creation, severance, and `explain`. Any additional commands in a client
build are experimental extensions unless a later candidate explicitly adopts
them. Card lists default to 100 rows and accept an explicit maximum of 1000.
Hand-written SQL and the `via.*` views remain available without YOUSPEAK.

## Correspondence is upstream evidence, not a YUTABASE row

Signed AgentTool Correspondence can feed a YUTABASE projection. The signed,
append-only event and receipt history remains the transport record and
authority-history evidence. YUTABASE is a rebuildable, non-authoritative
semantic projection for querying that history. A projected thread does not
grant permission, establish consent, lock a resource, or authorize
Git/deployment work.

AgentTool now contains both a public pure mapping planner and a private,
loopback-only run-once projector. They are integration implementations, not
YUTABASE Core features, hosted services, or candidate conformance evidence.

The mapping and the XENIA rights/permissions boundary are defined in
[docs/CORRESPONDENCE-PROJECTION.md](docs/CORRESPONDENCE-PROJECTION.md).

## Conformance and compatibility

[docs/CONFORMANCE.md](docs/CONFORMANCE.md) defines:

- candidate identity and compatibility rules;
- fresh-install and in-place-upgrade expectations;
- PostgreSQL 16/17 test requirements;
- optional YOUSPEAK conformance;
- the threat and non-guarantee boundary.

The GitHub CI workflow is defined for both supported PostgreSQL majors. It
installs `0001 → 0002 → 0004 → 0005`, then runs the post-install `0003`
lifecycle fixture, SDK integration/unit tests, typechecking, a real build, and
a clean Node.js consumer smoke test against the packed artifact. The separate
Kingdom Heartbeat is a playful best-effort presence ritual, not CI and not a
service-health guarantee.

`yuta init` commits a fresh `0001+0002` legacy base first, then runs `0004` and
`0005` in separate fresh transactions so each lock/snapshot contract is
enforceable. Every phase is atomic; a failure leaves the last exact earlier
state retryable.
SDK current-binding checks also refuse observable drift in durable storage,
registered deck shape, critical function/trigger settings, required capability
inheritance, or generated-view definitions.

## What the candidate does not provide

- no storage engine, replication protocol, hosted service, or telemetry;
- no authentication, row-level security, tenancy, or permission system;
- no cryptographic signatures in `yu.threads`;
- no automatic history for arbitrary card updates;
- no proof that a `by`, `how`, `src`, or `at` claim is true;
- no guarantee that a soft-referenced card still exists after a table owner or
  superuser bypasses the maintained card-integrity guard pair;
- no PostgreSQL support claim outside versions 16 and 17;
- no SQLite compatibility claim.

## Repository map

```text
SPEC.md                         normative candidate Core + Postgres binding
docs/CONFORMANCE.md             compatibility, tests, and threat boundary
docs/INTEGRATIONS.md            practical adapter and coexistence patterns
docs/CORRESPONDENCE-PROJECTION.md
                                 signed-source projection profile
sql/0001_yu_core.sql            original Postgres objects
sql/0002_starter_lexicon.sql     seven starter words
sql/0004_candidate_hardening.sql candidate metadata and hardening
sql/0005_candidate_integrity.sql mandatory card guard pair + source integrity
sql/0003_test_lifecycle.sql      destructive SQL conformance fixture
packages/sdk-ts/                optional YOUSPEAK SDK/CLI
THREADS.md                      experimental protocol research note
sql/0000_sqlite_port.sql         experimental SQLite sketch
apps/, play/, other docs         non-normative demonstrations and notebooks
```

The playful work stays. It carries imagination, examples, jokes, and possible
futures; it simply does not silently enlarge the candidate contract.

## License

Code and documentation in this repository are offered under the
[MIT License](LICENSE), unless a file says otherwise. External source material
retains its own terms.

---

*Candidate `0.1.0-candidate.1` · drafted by Yu + collaborators · the name is
Yu's · the lol remains structural.*
