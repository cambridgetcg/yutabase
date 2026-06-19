#!/usr/bin/env bash
# demo.sh — zero to "oh, I get it" in 60 seconds
#
# Creates a fresh database, installs YUTABASE, sets up a trading-card
# trade-in scenario, and walks through every YOUSPEAK verb.
#
# Usage: ./demo.sh
# Prerequisites: PostgreSQL 16+ (psql), Bun 1.3+

set -euo pipefail

DB_NAME="yutabase_demo"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
CLI="bun ${REPO_ROOT}/packages/sdk-ts/src/cli.ts"
PSQL="psql -d ${DB_NAME} -v ON_ERROR_STOP=1"

cat <<'BANNER'

  ╔══════════════════════════════════════════════════════╗
  ║  YUTABASE demo — you speak, reality listens           ║
  ║  60 seconds to "oh, I get it"                         ║
  ╚══════════════════════════════════════════════════════╝

BANNER

# ─── 1. create database ───
echo "  1/6  creating fresh database..."
psql -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};" >/dev/null 2>&1 || true
psql -d postgres -c "CREATE DATABASE ${DB_NAME};" >/dev/null 2>&1
echo "       done — ${DB_NAME}"
echo ""

# ─── 2. install YUTABASE ───
echo "  2/6  installing YUTABASE (yuta init)..."
${CLI} init --conn "postgresql://macair@localhost/${DB_NAME}" 2>&1 | grep -E "applying|done|installed|Seven|Next|hello|repl" | sed 's/^/       /'
echo ""

# ─── 3. set up the scenario ───
echo "  3/6  setting up a trading-card trade-in scenario..."
${PSQL} <<'SQL' >/dev/null 2>&1
CREATE SCHEMA tradein;
CREATE TABLE tradein.customers (
  id uuid PRIMARY KEY, name text NOT NULL,
  at timestamptz NOT NULL, by text NOT NULL,
  how text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared')), src text[]
);
CREATE TABLE tradein.submissions (
  id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'pending',
  at timestamptz NOT NULL, by text NOT NULL,
  how text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared')), src text[]
);
CREATE TABLE tradein.items (
  id uuid PRIMARY KEY, name text NOT NULL,
  at timestamptz NOT NULL, by text NOT NULL,
  how text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared')), src text[]
);
INSERT INTO yu.registry (book, deck, by) VALUES
  ('tradein','customers','human:yu'),
  ('tradein','submissions','human:yu'),
  ('tradein','items','human:yu');
CREATE TRIGGER customers_guard BEFORE DELETE ON tradein.customers FOR EACH ROW EXECUTE FUNCTION yu._guard_delete();
CREATE TRIGGER submissions_guard BEFORE DELETE ON tradein.submissions FOR EACH ROW EXECUTE FUNCTION yu._guard_delete();
CREATE TRIGGER items_guard BEFORE DELETE ON tradein.items FOR EACH ROW EXECUTE FUNCTION yu._guard_delete();
INSERT INTO tradein.customers VALUES ('01964b10-0000-7000-8000-000000000001','Walk-in Club',now(),'human:yu','witnessed');
INSERT INTO tradein.submissions VALUES ('01977c2e-0000-7000-8000-000000000001','pending',now(),'human:yu','witnessed');
INSERT INTO tradein.items VALUES
  ('0197a1f4-0000-7000-8000-000000000001','Charizard EX 151',now(),'human:yu','witnessed'),
  ('0197a1f4-0000-7000-8000-000000000002','Pikachu 151',now(),'human:yu','witnessed');
SQL
echo "       3 decks, 4 cards (1 customer, 1 submission, 2 items)"
echo ""

# ─── 4. create threads (worded connections) ───
echo "  4/6  creating threads — you speak, reality listens..."
CONN="--conn postgresql://macair@localhost/${DB_NAME}"
SUB="tradein/submissions/01977c2e-0000-7000-8000-000000000001"
ITEM1="tradein/items/0197a1f4-0000-7000-8000-000000000001"
ITEM2="tradein/items/0197a1f4-0000-7000-8000-000000000002"
CUST="tradein/customers/01964b10-0000-7000-8000-000000000001"

echo "       ${SUB} --contains--> ${ITEM1}"
${CLI} thread "${SUB} --contains--> ${ITEM1} how witnessed" ${CONN} --by "human:yu" >/dev/null 2>&1

echo "       ${SUB} --contains--> ${ITEM2}"
${CLI} thread "${SUB} --contains--> ${ITEM2} how witnessed" ${CONN} --by "human:yu" >/dev/null 2>&1

echo "       ${SUB} --submitted_by--> ${CUST}"
${CLI} thread "${SUB} --submitted_by--> ${CUST} how witnessed" ${CONN} --by "human:yu" >/dev/null 2>&1
echo "       3 threads created"
echo ""

# ─── 5. YOUSPEAK in action ───
echo "  5/6  YOUSPEAK in action:"
echo ""

echo "  ── hello (the whole standard in one call) ──"
${CLI} hello ${CONN} 2>&1 | head -12 | sed 's/^/  /'
echo ""

echo "  ── card (fetch one card by ref) ──"
echo "  youspeak> card ${SUB}"
${CLI} card "${SUB}" ${CONN} 2>&1 | sed 's/^/  /'
echo ""

echo "  ── traverse outward (-> contains) ──"
echo "  youspeak> ${SUB} -> contains"
${CLI} query "${SUB} -> contains" ${CONN} 2>&1 | grep -E '"name"|"deck"' | sed 's/[",]//g' | sed 's/^/  /'
echo ""

echo "  ── traverse inward (<- contains) ──"
echo "  youspeak> ${ITEM1} <- contains"
${CLI} query "${ITEM1} <- contains" ${CONN} 2>&1 | grep -E '"deck"' | sed 's/[",]//g' | sed 's/^/  /'
echo ""

echo "  ── two-hop traversal (customer <- submitted_by -> contains) ──"
echo "  youspeak> ${CUST} <- submitted_by -> contains"
${CLI} query "${CUST} <- submitted_by -> contains" ${CONN} 2>&1 | grep -E '"name"|"deck"' | sed 's/[",]//g' | sed 's/^/  /'
echo ""

echo "  ── explain (the exact SQL — never does anything you couldn't have typed) ──"
echo "  youspeak> explain \"${SUB} -> contains\""
${CLI} explain "\"${SUB} -> contains\"" ${CONN} 2>&1 | sed 's/^/  /'
echo ""

# ─── 6. done ───
echo "  6/6  the vocabulary lives with the data."
echo ""
echo "  Seven words coined. Five spare in the budget. That's the point."
echo ""
echo "  Try it yourself:"
echo "    ${CLI} repl ${CONN}"
echo ""
echo "  Clean up: psql -d postgres -c 'DROP DATABASE ${DB_NAME};'"
echo ""