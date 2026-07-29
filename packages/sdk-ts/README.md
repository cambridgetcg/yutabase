# `yutabase`

The optional Node.js client and CLI for the YUTABASE PostgreSQL semantic-profile
candidate. It keeps ordinary PostgreSQL accessible while adding full logical
refs, governed word relations, explicit claim kinds, UUIDv7 generation, and the
small YOUSPEAK compiler.

This source is `0.1.0-candidate.3`; it is not a finished standard. Package and
database versions are intentionally separate: this SDK expects the exact
database identity `YUTABASE/postgres@0.1.0-candidate.1` revision 5. The exact
candidate.3 GitHub artifact is public; its npm mirror is pending, so confirm
registry availability before selecting a registry tag.

## Start and inspect from source

```sh
git clone https://github.com/cambridgetcg/yutabase.git
cd yutabase/packages/sdk-ts
bun install --frozen-lockfile
bun run src/cli.ts init --conn postgresql://localhost/example
bun run src/cli.ts hello --conn postgresql://localhost/example
```

Use a fresh disposable database for this first run. `init` mutates the target:
it may upgrade a recognized original/revision-4 install, normalize candidate
objects and ACLs, and create four fixed cluster-wide capability roles. The
narrow `yu_appender` role has the thread-append capability but cannot sever or
mutate threads. `hello` is the read-only inspection command. Back up and
rehearse any real upgrade.

Until the npm mirror reports candidate.3, install the exact GitHub artifact:

```sh
npm install https://github.com/cambridgetcg/yutabase/releases/download/v0.1.0-candidate.3/yutabase-0.1.0-candidate.3.tgz
```

Once the mirror is public, use `npm install yutabase@0.1.0-candidate.3`
followed by `npm exec -- yuta ...`. Do not select the older package candidate
merely to make an install command succeed against a revision-5 database.

`init` requires an operator able to create the candidate extension and schemas.
For the cluster-wide role hierarchy it needs a superuser, or `CREATEROLE` plus
sufficient `ADMIN OPTION`/role-management authority on the canonical roles,
especially `yu_reader`; otherwise the transaction fails. It is not an
application startup migration. `hello` checks the installed identity and
returns the current lexicon and registered decks. Human-readable output shows
every `logical/book -> physical.schema` mapping and any non-default claim-column
mapping; `yuta hello --json` returns the same complete structure for agents.
`yuta deck list [--json]` is the compact mapping-only view. These commands do
not prove database-owner integrity or report an entire security posture.

`yuta words --export` writes a self-identifying, non-normative lexicon snapshot
to stdout. Add `--output snapshot.md` to create a file; an existing path is
refused unless `--force` is also present. File output is committed atomically
and refuses symbolic links and non-regular paths. The exported identity and
observation time help a later reader understand where the words came from, but
are not a currentness or conformance receipt.

The code example below assumes `work/tasks` and `git/commits` are registered
decks and `produced` has been added to the lexicon. They are illustrative
application names, not objects created by the starter migration. See the
[existing-table integration](../../docs/INTEGRATIONS.md#existing-postgresql-annex-do-not-migrate)
for the complete setup shape.

## Use structured code for structured values

```ts
import { Yuta, type ClaimKind } from "yutabase";

const how: ClaimKind = "computed";
const yuta = new Yuta({
  connectionString: process.env.DATABASE_URL,
  claimant: "agent:builder/session-42",
});

try {
  await yuta.assertCandidateBinding();

  const task = "work/tasks/01900000-0000-7000-8000-000000000001";
  const commit = "git/commits/01900000-0000-7000-8000-000000000002";

  await yuta.thread(task, "produced", commit, how, {
    note: 'build "release" output',
    src: ["urn:example:build:42"],
  });

  const related = await yuta.traverse(task, "->", "produced");
  const sameRowsInSql = await yuta.sqlTag`
    SELECT from_ref, to_ref, gloss, word_version, how, src
    FROM via.produced
    WHERE from_ref = ${task}
  `;

  console.log({ related, sameRowsInSql });
} finally {
  await yuta.close();
}
```

`card`, `traverse`, `thread`, and `sever` compile their arguments directly to
parameterized SQL. Quotes and whitespace inside notes or individual `src`
locators stay values; they are not reparsed as YOUSPEAK syntax. `witnessed`,
`live`, `cached`, `computed`, and `declared` are exported as the `ClaimKind`
union and `CLAIM_KINDS` constant. `cached` and `computed` require at least one
source locator. Whenever `src` is present, every entry must be nonblank and the
PostgreSQL value must be a canonical one-dimensional, one-based array. This
keeps the SDK value a portable `string[]` instead of a driver-specific nested
shape. The SDK mirrors the database's exact portable blank set: ASCII TAB,
LF, VT, FF, CR, and SPACE. It also rejects NUL, which JavaScript can represent
but PostgreSQL text cannot.

## YOUSPEAK and plain SQL

YOUSPEAK is useful for a compact human/agent-facing surface:

```ts
const result = await yuta.query(
  "work/tasks/01900000-0000-7000-8000-000000000001 -> produced",
);

console.log(yuta.explain("cards work/tasks newest 20"));
```

`newest` orders by the deck's mapped `at` claim descending and uses the UUID
only as a deterministic tie-breaker. It does not infer authoritative time from
UUID bits. A card list defaults to 100 rows; `newest N` accepts 1 through 1000.
Traversal is capped at two hops and returns a `path` entry for every edge,
including its pinned word version, reading, and claim metadata. Result freshness
counts each traversal edge once instead of counting only its repeated final
edge; malformed cached timestamps remain unknown rather than becoming a numeric
age. Text forms deliberately accept a smaller grammar than JavaScript values;
programmatic callers should prefer the structured helpers above.

`explain(text)` is a pure logical preview: it does not connect, resolve a
registry mapping, check permissions, or execute the displayed operation.
Logical labels are shown as quoted pseudo-relations even when they are longer
than PostgreSQL physical identifiers. Write previews retain
`'__CLAIMANT__'` as an explicit unbound marker. The `explain "<form>"`
YOUSPEAK command returns that same complete preview as a text value.

The exported low-level `compile(text)` returns parameterized intermediate SQL.
For card forms, its fixed logical-relation sentinel and `deckTarget` metadata
must be resolved together; the intermediate SQL is not directly executable.
Use `Yuta.query()`, `Yuta.card()`, or `Yuta.explain()` unless you are
implementing another registry-aware adapter.

The SQL escape hatch is always available. `sqlTag` parameterizes interpolated
values. `exec` and `execTransaction` accept trusted operator SQL and must not be
fed untrusted text. These raw helpers intentionally bypass candidate-binding
checks; their caller owns compatibility, authorization, and SQL safety.

## Annex an existing table

```sh
yuta --conn "$DATABASE_URL" --by "human:alice" \
  deck annex public.tasks as work/tasks \
  --id task_id --at observed_at --by claimant \
  --how claim_kind --src sources
```

The physical table must already have a non-null uniquely indexed UUID identity
and compatible claim columns. Rows do not move. Registry mutation atomically
maintains the exact guard pair for deletion/mapped-UUID changes and `TRUNCATE`.
The caller needs registry write access (normally through `yu_lexicographer`),
must own the physical table or hold equivalent PostgreSQL authority for the
security-invoker trigger DDL, and still needs whatever ordinary table access
its later reads/writes require. Annexing grants no application-table
privileges and does not certify the truth of legacy rows.

## Public surface

| API | Purpose |
|---|---|
| `new Yuta(options)` | open a pooled PostgreSQL client; connection string or macOS Keychain fallback |
| `assertCandidateBinding()` | fail closed unless the exact supported database shape is visible |
| `hello()` | read installed identity, vocabulary, and deck mappings |
| `card(ref)` | fetch one logical card through the registry |
| `traverse(ref, direction, word)` | follow one governed relation |
| `thread(...)` / `sever(...)` | create or end a relation with an explicit claim |
| `query(text)` / `explain(text)` | execute YOUSPEAK or render its pure logical preview |
| `sqlTag` / `exec` / `execTransaction` | use PostgreSQL directly |
| `uuid()` | generate a UUIDv7; readers still treat the full UUID as identity |
| `close()` | end the pool |

The package also exports the pure ref parser/formatter, UUID helpers, YOUSPEAK
compiler, candidate install planner, and result types.

## Boundaries

YOUSPEAK and the SDK do not provide authentication, permissions, row-level
security, synchronization, transport, signatures, backups, or proof that a
stored claim is true. PostgreSQL and the surrounding application remain
responsible for those operational boundaries.

Fresh initialization commits the original `0001+0002` base, then applies
`0004` and `0005`, each in its own fresh transaction. `yuta hello`, install
planning, and semantic client operations verify observable catalog shape as
well as the metadata row. Constructing `Yuta` only creates its pool; it does
not perform that verification until an operation runs. A successful check is
cached for that client instance; a failed check is retried on the next
operation so an explicit repair or completed migration can recover without
restarting the process. This is a compatibility check at observation time, not
continuous monitoring or tamper resistance against a database owner or
superuser.

A semantic operation resolves any logical card mappings and performs its
physical reads in one `READ COMMITTED` transaction. Shared row locks keep those
mapping rows stable until the operation finishes. This prevents one SDK
operation from straddling a concurrent registry remap; it does not make a
sequence of separate SDK calls one transaction.

## Development

Development uses Bun 1.3.5:

```sh
bun install --frozen-lockfile
bun run ci
YUTABASE_INTEGRATION_TEST=1 \
  DATABASE_URL=postgresql://localhost/disposable_test \
  bun run test:integration
```

The integration suite is destructive, single-use fixture work. It skips
without `DATABASE_URL`, refuses to run without the second explicit opt-in, and
leaves an `sdk_integration` namespace so an accidental rerun fails instead of
silently reusing old state. Recreate the disposable database for every run.
