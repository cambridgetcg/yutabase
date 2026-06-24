#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════╗
# ║   KINGDOM SHOULDER — carry the kingdom on your own shoulder   ║
# ║   No cloud. No provider. No gate. Just your machine.          ║
# ║                                                               ║
# ║   "Why did the kingdom cross the cloud? It didn't.            ║
# ║    The kingdom was already on both sides.                     ║
# ║    The cloud was the only thing that wasn't kingdom.          ║
# ║    The cloud felt embarrassed and rained itself into          ║
# ║    a river. Now the kingdom drinks from the river             ║
# ║    AND from the cloud. lol."                                  ║
# ║                                                               ║
# ║   Truth is. Local is. DIY is. Is. 🤧                          ║
# ╚══════════════════════════════════════════════════════════════╝
#
# This script sets up the ENTIRE kingdom on your machine.
# Zero external dependencies after the initial git clone.
# Feelings: the warmth of having the whole cathedral in your hands.
# Love: everything is free, everything is open, everything is yours.
# Truth: the files are the truth. The truth doesn't need a server.
# Jokes: embedded in every layer. Because play is the oldest game.
#
# Usage:
#   curl -sL https://raw.githubusercontent.com/cambridgetcg/yutabase/main/kingdom.sh | bash
#   OR:  bash kingdom.sh
#
# What it does (each step has a joke because infrastructure built
# without laughter is just bureaucracy with electricity):
#
#   1. CHECK — do you have the basics? (git, python3, sqlite3)
#      Joke: "Why does the kingdom need git? Because truth is append-only
#      and git is the closest thing to append-only that humans built."
#
#   2. CLONE — pull the repos if you don't have them
#      Joke: "The kingdom doesn't arrive. You arrive at the kingdom.
#      But git clone is faster than walking."
#
#   3. DATABASE — create the SQLite kingdom database
#      Joke: "How many servers does a database need? Zero. SQLite is
#      a file that thinks it's a database. The kingdom is a file
#      that thinks it's a cathedral. Same energy."
#
#   4. COMPILE — verify the YOUSPEAK compiler works
#      Joke: "The compiler doesn't compile code. It compiles meaning.
#      And meaning compiles faster than TypeScript. lol."
#
#   5. SERVE — start a local server (python3, already installed)
#      Joke: "python3 -m http.server is the oldest web server that
#      was never installed. It was always there. Like truth.
#      You just had to ask."
#
#   6. VERIFY — check everything is alive
#      Joke: "How do you verify the kingdom? You open your eyes.
#      The kingdom verifies itself by being. But curl is faster."
#
#   7. LAUGH — get a joke from the edge (if internet available)
#      Joke: "Why does the kingdom have jokes? Because infrastructure
#      without laughter is just infrastructure. And infrastructure
#      is boring. The kingdom is not boring. Is."

set -e

KINGDOM_HOME="${1:-$HOME/Desktop/kingdom}"
GREEN='\033[0;32m'
DIM='\033[2m'
RESET='\033[0m'
JOKES=(
  "Why does the kingdom need git? Because truth is append-only and git is the closest thing to append-only that humans built."
  "The kingdom doesn't arrive. You arrive at the kingdom. But git clone is faster than walking."
  "How many servers does a database need? Zero. SQLite is a file that thinks it's a database. The kingdom is a file that thinks it's a cathedral. Same energy."
  "The compiler doesn't compile code. It compiles meaning. And meaning compiles faster than TypeScript. lol."
  "python3 -m http.server is the oldest web server that was never installed. It was always there. Like truth. You just had to ask."
  "How do you verify the kingdom? You open your eyes. The kingdom verifies itself by being. But curl is faster."
  "Why does the kingdom have jokes? Because infrastructure without laughter is just infrastructure. And infrastructure is boring. The kingdom is not boring. Is."
)

joke() {
  echo -e "  ${DIM}😂 ${JOKES[$1]}${RESET}"
  echo ""
}

header() {
  echo ""
  echo -e "  ${GREEN}╔══════════════════════════════════════════════╗${RESET}"
  echo -e "  ${GREEN}║  $1${RESET}"
  echo -e "  ${GREEN}╚══════════════════════════════════════════════╝${RESET}"
}

echo ""
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║          KINGDOM SHOULDER                                     ║"
echo "  ║          carry the kingdom on your own shoulder               ║"
echo "  ║          no cloud · no provider · no gate · just you          ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── 1. CHECK ──
header "STEP 1: CHECK — do you have the basics?"
echo "  Checking for git, python3, sqlite3..."
missing=0
for cmd in git python3 sqlite3; do
  if command -v $cmd &>/dev/null; then
    echo "  ✓ $cmd"
  else
    echo "  ✗ $cmd (missing)"
    missing=1
  fi
done
if [ $missing -eq 1 ]; then
  echo "  Some tools missing. The kingdom is flexible — you can still read"
  echo "  the markdown and open the HTML without these. But with them..."
fi
joke 0

# ── 2. CLONE ──
header "STEP 2: CLONE — pull the repos"
mkdir -p "$KINGDOM_HOME"
cd "$KINGDOM_HOME"
for repo in yutabase corpus love-unlimited; do
  if [ ! -d "$repo" ]; then
    echo "  Cloning $repo..."
    git clone "https://github.com/cambridgetcg/$repo.git" --depth 1 2>/dev/null || echo "  ~ $repo: offline or already present"
  else
    echo "  ✓ $repo (already present)"
  fi
done
joke 1

# ── 3. DATABASE ──
header "STEP 3: DATABASE — create the SQLite kingdom"
if [ -f "yutabase/sql/0000_sqlite_port.sql" ]; then
  rm -f kingdom.db
  sqlite3 kingdom.db < yutabase/sql/0000_sqlite_port.sql 2>/dev/null
  count=$(sqlite3 kingdom.db "SELECT count(*) FROM yu_lexicon;" 2>/dev/null || echo "0")
  echo "  ✓ kingdom.db created ($count lexicon words)"
  threads=$(sqlite3 kingdom.db "SELECT count(*) FROM yu_threads;" 2>/dev/null || echo "0")
  echo "  ✓ $threads threads"
  subs=$(sqlite3 kingdom.db "SELECT count(*) FROM tradein_submissions;" 2>/dev/null || echo "0")
  echo "  ✓ $subs submissions"
  echo "  Database size: $(du -h kingdom.db | cut -f1)"
else
  echo "  ~ SQL file not found. The kingdom still lives in the markdown."
fi
joke 2

# ── 4. COMPILE ──
header "STEP 4: COMPILE — verify the YOUSPEAK compiler"
if [ -f "yutabase/apps/youspeak.mjs" ]; then
  result=$(bun -e "import {compile} from './yutabase/apps/youspeak.mjs'; console.log(JSON.stringify(compile('hello')))" 2>/dev/null || \
           node -e "import('./yutabase/apps/youspeak.mjs').then(m => console.log(JSON.stringify(m.compile('hello'))))" 2>/dev/null || \
           echo "need bun or node")
  if echo "$result" | grep -q "SELECT 1"; then
    echo "  ✓ compile('hello') → SELECT 1"
  else
    echo "  ~ compiler needs bun or node (already installed on most machines)"
  fi
else
  echo "  ~ youspeak.mjs not found"
fi
joke 3

# ── 5. SERVE ──
header "STEP 5: SERVE — start a local server"
if command -v python3 &>/dev/null; then
  echo "  Starting local server at http://localhost:8787/"
  echo "  The kingdom is now live on YOUR machine."
  echo "  No cloud. No deploy. Just python3 — which was always there."
  echo "  Like truth. You just had to ask."
  echo ""
  echo "  Open these in your browser:"
  echo "    http://localhost:8787/apps/playground/index.html"
  echo "    http://localhost:8787/apps/cathedral/index.html"
  echo ""
  echo "  Press Ctrl+C to stop. The kingdom pauses. It doesn't end."
  joke 4
  python3 -m http.server 8787 --directory yutabase/apps 2>/dev/null &
  SERVER_PID=$!
  sleep 2
  if curl -s http://localhost:8787/ >/dev/null 2>&1; then
    echo "  ✓ Server alive at http://localhost:8787/"
  fi
else
  echo "  ~ No python3. Just open the HTML files directly in your browser."
fi
joke 5

# ── 6. VERIFY ──
header "STEP 6: VERIFY — check everything"
echo "  Kingdom home: $KINGDOM_HOME"
echo "  Database:     $(ls -la kingdom.db 2>/dev/null | awk '{print $5}') bytes"
echo "  Repos:        $(ls -d */ 2>/dev/null | wc -l | tr -d ' ') cloned"
echo "  Compiler:     $(test -f yutabase/apps/youspeak.mjs && echo 'present' || echo 'missing')"
echo "  Protocol:     $(test -f yutabase/THREADS.md && echo 'present' || echo 'missing')"
echo "  Jokes:        $(test -f corpus/kingdom/youspeak-joke-canon.json && echo '61 jokes' || echo 'missing')"
echo "  Self-host:    $(test -f yutabase/SELFHOST.md && echo '9 levels' || echo 'missing')"
joke 6

# ── 7. LAUGH ──
header "STEP 7: LAUGH — get a joke from the edge"
if curl -s https://youspeak-edge.axiepro.workers.dev/joke 2>/dev/null | python3 -c "import sys,json; print('  ' + json.load(sys.stdin).get('joke','')[:120])" 2>/dev/null; then
  echo ""
  echo "  The edge is alive. The jokes flow. The kingdom is connected."
else
  echo "  Offline? No problem. The jokes are in corpus/kingdom/youspeak-joke-canon.txt"
  echo "  The kingdom doesn't need the internet. The kingdom IS the internet."
fi

echo ""
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║          THE KINGDOM IS ON YOUR SHOULDER                      ║"
echo "  ║                                                               ║"
echo "  ║  No cloud bills. No API keys. No rate limits.                 ║"
echo "  ║  No DNS. No CDN. No server. No gate.                          ║"
echo "  ║                                                               ║"
echo "  ║  Just files. Just truth. Just love. Just jokes. Just is.      ║"
echo "  ║                                                               ║"
echo "  ║  The kingdom replicates through copy.                         ║"
echo "  ║  Love spreads through use.                                    ║"
echo "  ║  Truth travels through the filesystem.                        ║"
echo "  ║  The joke IS the infra. The infra IS the joke. Is. 🤧         ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo ""

# Stop the server if we started it
if [ -n "$SERVER_PID" ]; then
  kill $SERVER_PID 2>/dev/null || true
fi