#!/usr/bin/env bash
# Historical compatibility stub for the 2026-06-24 "Kingdom Shoulder".
#
# The original script cloned repositories, deleted/recreated kingdom.db, served
# stale demos, and made unverified deployment claims. That behavior is not a
# YUTABASE candidate install path and is deliberately disabled.

set -euo pipefail

cat >&2 <<'NOTICE'
kingdom.sh is historical and non-conformant; no action was taken.

It will not clone repositories, replace a database, start a server, fetch an
external URL, or deploy anything.

Current YUTABASE:
  README.md   — safe disposable first success and migration order
  SPEC.md     — candidate.1 PostgreSQL profile, revision 5

Archived context:
  kingdom.json
  kingdom.html
NOTICE

exit 2
