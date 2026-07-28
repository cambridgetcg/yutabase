# Play experiments

This directory contains non-normative, historical experiments. It is not a
YUTABASE candidate API, install path, test suite, or current operations
directory.

Some scripts can start listeners, call networks, publish content, or modify
local files and databases. Read a script completely and verify every endpoint,
credential boundary, target path, and opt-in before running it. A filename or
old success message is not evidence that its service, protocol, or dependency
still exists.

For the implemented PostgreSQL 16/17 candidate, start with the root
[`README.md`](../README.md), [`SPEC.md`](../SPEC.md), and guarded
[`demo.sh`](../demo.sh) for a fresh disposable database. Initialization can
create or reuse fixed cluster-wide capability roles that outlive that
database; read the root initialization warning first. The current browser-only
compiler playground is
[`apps/playground/index.html`](../apps/playground/index.html); it previews
logical SQL and does not connect to or mutate a database.
