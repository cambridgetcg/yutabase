# `yutabase`

Node.js SDK and CLI for the YUTABASE PostgreSQL semantic-profile candidate.
It provides full-UUID ref parsing, UUIDv7 generation, the frozen core
YOUSPEAK compiler, and an explicit SQL escape hatch.

This package is `0.1.0-candidate.1`, not a finished standard. It expects the
exact database identity `YUTABASE/postgres@0.1.0-candidate.1` revision 4.
Fresh initialization commits the original `0001+0002` base, then applies
candidate hardening in its own fresh transaction; either phase is atomic and a
failed hardening remains unstamped and retryable.

`yuta hello`, install planning, and client startup verify observable catalog
shape as well as the metadata row: exact candidate columns, defaults, indexes,
constraints, identity sequence, foreign-key enforcement/data, required
functions/triggers, mapped decks, and generated view definitions. This is a
compatibility check at observation time, not tamper resistance against a
database owner or superuser.

```sh
npm install yutabase@next
yuta init --conn postgresql://localhost/example
yuta hello --conn postgresql://localhost/example
```

```ts
import { Yuta } from "yutabase";

const yuta = new Yuta({ connectionString: process.env.DATABASE_URL });
const result = await yuta.query(
  "tradein/submissions/01977c2e-0000-7000-8000-000000000001 -> contains",
);
await yuta.close();
```

YOUSPEAK is an optional query/compiler surface. It does not provide
authentication, permissions, synchronization, transport, or proof that a
stored claim is true. PostgreSQL remains responsible for those operational
boundaries.

Development uses Bun 1.3.5:

```sh
bun install --frozen-lockfile
bun run ci
DATABASE_URL=postgresql://localhost/disposable_test bun run test:integration
```

The integration suite skips unless `DATABASE_URL` is explicitly supplied.
