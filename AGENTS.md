# YUTABASE repository guidance

YUTABASE is currently a `0.1.0-candidate.1` Postgres semantic profile, not a
finished or de-facto database standard. Keep claims proportional to evidence.

## Contract boundaries

- `SPEC.md` defines YUTABASE Core and the Postgres binding.
- `sql/` is the durable implementation of that binding.
- `packages/sdk-ts/` contains the optional YOUSPEAK client and CLI.
- THREADS, SQLite, kingdom/play surfaces, and protocol crossovers are
  experimental unless a document explicitly says otherwise.
- Correspondence events may be projected into YUTABASE, but signed source
  events remain the authority log. A projection does not grant permission,
  transfer authority, or create a lock.

## Change discipline

- Preserve the plain-SQL escape hatch and readable Postgres substrate.
- Add or change a normative behavior only with a hard-failing conformance test.
- Keep migrations upgradeable from the original v0.1 schema and test both a
  fresh install and an upgrade containing existing threads.
- Do not describe self-reported provenance as proof or row-level provenance as
  field-level provenance.
- Do not deploy migrations, publish packages, or change production data without
  separate explicit authorization.

## Verification

Run the TypeScript unit/type/build checks from `packages/sdk-ts`. Against both
PostgreSQL 16 and 17, install `0001` then `0002` then `0004`; only afterward
run the destructive `0003` lifecycle fixture. The repository CI workflow is
the executable reference for exact commands.
