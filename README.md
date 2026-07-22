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

## Status and layers

The repository separates four things that earlier drafts sometimes blended:

| Layer | Candidate status | Source |
|---|---|---|
| **YUTABASE Core** | Normative candidate semantics: books, decks, cards, refs, lexicon words, threads, and row-level claim metadata | [SPEC.md](SPEC.md) |
| **Postgres binding** | Normative candidate implementation for PostgreSQL 16 and 17 | `sql/0001_yu_core.sql`, `0002_starter_lexicon.sql`, `0004_candidate_hardening.sql` |
| **YOUSPEAK** | Optional client/compiler surface; never required to read the stored model with SQL | `packages/sdk-ts/` |
| **THREADS, SQLite, apps, play, and kingdom writings** | Experimental or illustrative; not part of candidate conformance | [THREADS.md](THREADS.md), `sql/0000_sqlite_port.sql`, `apps/`, `play/`, [docs/](docs/) |

The exact installed identity is stored in the singleton
`yu.standard_meta` row:

```text
standard  = YUTABASE
profile   = postgres
version   = 0.1.0-candidate.1
revision  = 4
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

psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f sql/0001_yu_core.sql
psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f sql/0002_starter_lexicon.sql
psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f sql/0004_candidate_hardening.sql

psql "$DATABASE_URL" -x -c 'TABLE yu.standard_meta'
```

`0003_test_lifecycle.sql` is a destructive test fixture for a fresh test
database, not an install migration.

For an original pre-candidate v0.1 database that already has `yu.lexicon`,
`yu.registry`, and `yu.threads`, apply only
`0004_candidate_hardening.sql`. Back up first and rehearse the upgrade against
a copy. Apply every migration as a single transaction; an interrupted hardening
migration must not leave a partly upgraded profile. The optional SDK installer
refuses unknown or partial identities rather than guessing.

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

The three fixed capability roles are exact grant surfaces, not owners. A
same-named login/cluster-privileged role or one owning the database/YUTABASE
objects is refused. Direct legacy ACLs on `yu`/`via` are reset; unremovable
multi-grantor extras fail closed. Role memberships remain a separate operator
review.

A later registry remap is checked too: every active logical endpoint for that
deck must exist under the proposed physical table and UUID column. Copy or
move the cards first; the binding refuses a remap that would silently strand
active threads. The remapping lexicographer needs explicit `USAGE`/`SELECT` on
the proposed application deck; registration itself grants nothing. Registry
remaps and new thread inserts lock the same logical
deck declarations, so that check also holds when they race.

An installed deck delete guard and thread creation also take the same
card-scoped transaction lock. Under a race, either the delete commits and the
thread is refused, or the thread commits and the delete is refused. Out-of-band
deletion that omits or bypasses the guard remains outside this guarantee.

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
them. Hand-written SQL and the `via.*` views remain available without
YOUSPEAK.

## Correspondence is upstream evidence, not a YUTABASE row

Signed AgentTool Correspondence can feed a YUTABASE projection. The signed,
append-only event and receipt history remains the transport record and
authority-history evidence. YUTABASE is a rebuildable, non-authoritative
semantic projection for querying that history. A projected thread does not
grant permission, establish consent, lock a resource, or authorize
Git/deployment work.

The mapping and the XENIA rights/permissions boundary are defined in
[docs/CORRESPONDENCE-PROJECTION.md](docs/CORRESPONDENCE-PROJECTION.md).

## Conformance and compatibility

[docs/CONFORMANCE.md](docs/CONFORMANCE.md) defines:

- candidate identity and compatibility rules;
- fresh-install and in-place-upgrade expectations;
- PostgreSQL 16/17 test requirements;
- optional YOUSPEAK conformance;
- the threat and non-guarantee boundary.

GitHub CI runs both supported PostgreSQL majors, installs
`0001 → 0002 → 0004`, then runs the post-install `0003` lifecycle fixture. It
also runs SDK integration/unit tests, typechecking, a real build, and a clean
Node.js consumer smoke test against the packed artifact. The separate Kingdom
Heartbeat is a playful best-effort presence ritual, not CI and not a
service-health guarantee.

`yuta init` commits a fresh `0001+0002` legacy base first, then runs `0004` in
its own fresh transaction so its lock/snapshot contract is enforceable. Either
phase is atomic; a hardening failure leaves an unstamped, retryable legacy base.
SDK current-binding checks also refuse observable drift in durable storage,
registered deck shape, critical function/trigger settings, required capability
inheritance, or generated-view definitions.

## What the candidate does not provide

- no storage engine, replication protocol, hosted service, or telemetry;
- no authentication, row-level security, tenancy, or permission system;
- no cryptographic signatures in `yu.threads`;
- no automatic history for arbitrary card updates;
- no proof that a `by`, `how`, `src`, or `at` claim is true;
- no guarantee that a soft-referenced card still exists after an out-of-band
  delete bypasses the registered deck guard;
- no PostgreSQL support claim outside versions 16 and 17;
- no SQLite compatibility claim.

## Repository map

```text
SPEC.md                         normative candidate Core + Postgres binding
docs/CONFORMANCE.md             compatibility, tests, and threat boundary
docs/CORRESPONDENCE-PROJECTION.md
                                 signed-source projection profile
sql/0001_yu_core.sql            original Postgres objects
sql/0002_starter_lexicon.sql     seven starter words
sql/0004_candidate_hardening.sql candidate metadata and hardening
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
