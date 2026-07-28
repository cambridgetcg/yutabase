#!/usr/bin/env bash
# demo.sh — safe, explicit first tour of YUTABASE
#
# The caller supplies a fresh disposable database. This script never creates,
# drops, or guesses one, and it refuses a database that already has user data.
#
# Usage:
#   DATABASE_URL=postgresql://localhost/yutabase_demo ./demo.sh
#
# Prerequisites:
#   PostgreSQL 16/17 client tools, Bun 1.3.5, and:
#   (cd packages/sdk-ts && bun install --frozen-lockfile)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
SDK_ROOT="${REPO_ROOT}/packages/sdk-ts"
CLI=(bun "${SDK_ROOT}/src/cli.ts")

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "demo refused: set DATABASE_URL to a fresh disposable database" >&2
  exit 2
fi
if [[ ! -d "${SDK_ROOT}/node_modules/postgres" ]]; then
  echo "demo refused: install SDK dependencies first:" >&2
  echo "  (cd packages/sdk-ts && bun install --frozen-lockfile)" >&2
  exit 2
fi
for command in bun psql; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "demo refused: missing required command ${command}" >&2
    exit 2
  fi
done

PSQL=(psql "${DATABASE_URL}" -v ON_ERROR_STOP=1)
preflight="$("${PSQL[@]}" -At -c "
  SELECT current_database(),
         current_database() NOT IN ('postgres', 'template0', 'template1')
         AND to_regnamespace('yu') IS NULL
         AND to_regnamespace('via') IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM pg_catalog.pg_namespace n
           WHERE n.nspname NOT IN ('public', 'information_schema')
             AND n.nspname !~ '^pg_'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM pg_catalog.pg_class c
           WHERE c.relnamespace = to_regnamespace('public')
         );
")"
IFS='|' read -r database_name database_is_disposable <<<"${preflight}"
if [[ "${database_is_disposable}" != "t" ]]; then
  echo "demo refused: ${database_name} is a system, initialized, or non-empty database" >&2
  echo "create a fresh disposable database and point DATABASE_URL to it" >&2
  exit 2
fi

cat <<'BANNER'

  ╔══════════════════════════════════════════════════════╗
  ║  YUTABASE demo — logical refs, worded connections    ║
  ╚══════════════════════════════════════════════════════╝

BANNER

echo "  1/5  installing the candidate into ${database_name}..."
"${CLI[@]}" init --conn "${DATABASE_URL}" | sed 's/^/       /'
echo

echo "  2/5  creating three ordinary PostgreSQL decks..."
"${PSQL[@]}" <<'SQL' >/dev/null
BEGIN ISOLATION LEVEL READ COMMITTED;
CREATE SCHEMA tradein;
CREATE TABLE tradein.customers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
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
CREATE TABLE tradein.submissions (LIKE tradein.customers INCLUDING ALL);
ALTER TABLE tradein.submissions DROP COLUMN name;
ALTER TABLE tradein.submissions
  ADD COLUMN status text NOT NULL DEFAULT 'pending';
CREATE TABLE tradein.items (LIKE tradein.customers INCLUDING ALL);

INSERT INTO yu.registry (
  book, deck, physical_schema, physical_table, native, by
) VALUES
  ('tradein', 'customers', 'tradein', 'customers', true, 'human:demo'),
  ('tradein', 'submissions', 'tradein', 'submissions', true, 'human:demo'),
  ('tradein', 'items', 'tradein', 'items', true, 'human:demo');

INSERT INTO tradein.customers (id, name, at, by, how) VALUES
  (
    '01964b10-0000-7000-8000-000000000001',
    'Walk-in Club', now(), 'human:demo', 'witnessed'
  );
INSERT INTO tradein.submissions (id, status, at, by, how) VALUES
  (
    '01977c2e-0000-7000-8000-000000000001',
    'pending', now(), 'human:demo', 'witnessed'
  );
INSERT INTO tradein.items (id, name, at, by, how) VALUES
  (
    '0197a1f4-0000-7000-8000-000000000001',
    'Charizard EX 151', now(), 'human:demo', 'witnessed'
  ),
  (
    '0197a1f4-0000-7000-8000-000000000002',
    'Pikachu 151', now(), 'human:demo', 'witnessed'
  );
COMMIT;
SQL
echo "       registered 3 decks; revision 5 installed both guard types itself"
echo

SUB="tradein/submissions/01977c2e-0000-7000-8000-000000000001"
ITEM1="tradein/items/0197a1f4-0000-7000-8000-000000000001"
ITEM2="tradein/items/0197a1f4-0000-7000-8000-000000000002"
CUST="tradein/customers/01964b10-0000-7000-8000-000000000001"
CONNECTION=(--conn "${DATABASE_URL}" --by "human:demo")

echo "  3/5  connecting cards with starter words..."
"${CLI[@]}" thread "${SUB} --contains--> ${ITEM1} how witnessed" \
  "${CONNECTION[@]}" >/dev/null
"${CLI[@]}" thread "${SUB} --contains--> ${ITEM2} how witnessed" \
  "${CONNECTION[@]}" >/dev/null
"${CLI[@]}" thread "${SUB} --submitted_by--> ${CUST} how witnessed" \
  "${CONNECTION[@]}" >/dev/null
echo "       ${SUB} --contains--> ${ITEM1}"
echo "       ${SUB} --contains--> ${ITEM2}"
echo "       ${SUB} --submitted_by--> ${CUST}"
echo

echo "  4/5  reading the model..."
echo
echo "  card ${SUB}"
"${CLI[@]}" card "${SUB}" --conn "${DATABASE_URL}" | sed 's/^/    /'
echo
echo "  ${SUB} -> contains"
"${CLI[@]}" query "${SUB} -> contains" --conn "${DATABASE_URL}" |
  sed 's/^/    /'
echo
echo "  ${CUST} <- submitted_by -> contains"
"${CLI[@]}" query "${CUST} <- submitted_by -> contains" \
  --conn "${DATABASE_URL}" | sed 's/^/    /'
echo

echo "  5/5  showing the pure logical SQL preview..."
"${CLI[@]}" explain "${SUB} -> contains" | sed 's/^/    /'
echo
echo "  done — ${database_name} is intentionally retained for inspection"
echo "  try: bun packages/sdk-ts/src/cli.ts hello --conn \"\$DATABASE_URL\""
echo "  recreate the disposable database before running this demo again"
