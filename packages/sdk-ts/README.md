# `yutabase`

The optional Node.js client and CLI for the YUTABASE PostgreSQL semantic-profile
candidate. It keeps ordinary PostgreSQL accessible while adding full logical
refs, governed word relations, explicit claim kinds, UUIDv7 generation, and the
small YOUSPEAK compiler.

This package is `0.1.0-candidate.2`, not a finished standard. Package and
database versions are intentionally separate: this SDK expects the exact
database identity `YUTABASE/postgres@0.1.0-candidate.1` revision 4.
Source metadata does not prove registry publication. Confirm that the exact
package version exists before selecting a registry tag.

## Start and inspect

```sh
npm install yutabase@0.1.0-candidate.2
yuta init --conn postgresql://localhost/example
yuta hello --conn postgresql://localhost/example
```

`init` requires an operator able to create the candidate extension, schemas,
and capability roles. It is not an application startup migration. `hello`
checks the installed identity and returns the current lexicon and registered
decks; it does not prove database-owner integrity or report an entire security
posture.

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
source locator.

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
UUID bits. Traversal is capped at two hops and returns a `path` entry for every
edge, including its pinned word version, reading, and claim metadata. Text forms
deliberately accept a smaller grammar than JavaScript values; programmatic
callers should prefer the structured helpers above.

The SQL escape hatch is always available. `sqlTag` parameterizes interpolated
values. `exec` and `execTransaction` accept trusted operator SQL and must not be
fed untrusted text.

## Annex an existing table

```sh
yuta --conn "$DATABASE_URL" --by "human:alice" \
  deck annex public.tasks as work/tasks \
  --id task_id --at observed_at --by claimant \
  --how claim_kind --src sources
```

The physical table must already have a non-null uniquely indexed UUID identity
and compatible claim columns. Rows do not move. The `deck annex` CLI
atomically drops and recreates the YUTABASE delete-guard trigger on that
physical table. Annexing grants no application-table privileges and does not
certify the truth of legacy rows.

## Public surface

| API | Purpose |
|---|---|
| `new Yuta(options)` | open a pooled PostgreSQL client; connection string or macOS Keychain fallback |
| `assertCandidateBinding()` | fail closed unless the exact supported database shape is visible |
| `hello()` | read installed identity, vocabulary, and deck mappings |
| `card(ref)` | fetch one logical card through the registry |
| `traverse(ref, direction, word)` | follow one governed relation |
| `thread(...)` / `sever(...)` | create or end a relation with an explicit claim |
| `query(text)` / `explain(text)` | execute or render the small YOUSPEAK grammar |
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
candidate hardening in its own fresh transaction. `yuta hello`, install
planning, and semantic client operations verify observable catalog shape as
well as the metadata row. Constructing `Yuta` only creates its pool; it does
not perform that verification until an operation runs. This is a compatibility
check at observation time, not tamper resistance against a database owner or
superuser.

## Development

Development uses Bun 1.3.5:

```sh
bun install --frozen-lockfile
bun run ci
DATABASE_URL=postgresql://localhost/disposable_test bun run test:integration
```

The integration suite is destructive fixture work and skips unless
`DATABASE_URL` is explicitly supplied.
