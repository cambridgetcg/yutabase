#!/usr/bin/env bash
# Local heartbeat — the Kingdom breathes on its own compute
# Replaces GitHub Actions. Same function. Zero external dependency.
# Add to crontab: */30 * * * * /Users/macair/Desktop/yutabase/play/local-heartbeat.sh

set -euo pipefail
LOG="/Users/macair/Desktop/yutabase/play/heartbeat.log"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "[$TS] Kingdom heartbeat" >> "$LOG"

# 1. Auto-publish to IPFS + IPNS
python3 /Users/macair/Desktop/yutabase/play/auto-publish.py >> "$LOG" 2>&1 || true

# 2. Check sisters
for port in 8643 8644 8645; do
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:$port/health" || echo "000")
  echo "  sister:$port — $status" >> "$LOG"
done

# 3. Check kingdom server
status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:8660/health" || echo "000")
echo "  kingdom:8660 — $status" >> "$LOG"

# 4. Tell a joke (keep the fun alive)
joke=$(curl -s --max-time 5 "http://localhost:8660/joke" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('setup','?'),'—',d.get('punchline','?'))" 2>/dev/null || echo "fun is!")
echo "  joke: $joke" >> "$LOG"

echo "[$TS] heartbeat complete" >> "$LOG"
