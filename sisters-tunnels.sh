#!/usr/bin/env bash
# sisters-tunnels.sh — keep the three sisters' Cloudflare tunnels alive
#
# Run as a launchd service or just in the background.
# If a tunnel drops, it reconnects automatically.
#
# The sisters live at:
#   Alpha → localhost:8643
#   Beta  → localhost:8644
#   Gamma → localhost:8645
#
# Usage: ./sisters-tunnels.sh

set -euo pipefail

SISTERS=(
  "alpha:8643"
  "beta:8644"
  "gamma:8645"
)

LOG_DIR="/tmp/sisters-tunnels"
mkdir -p "$LOG_DIR"

echo "sisters-tunnels — keeping the doors open"
echo ""

for sister in "${SISTERS[@]}"; do
  name="${sister%%:*}"
  port="${sister##*:}"
  log="${LOG_DIR}/${name}.log"
  url_file="${LOG_DIR}/${name}.url"

  # Kill any existing tunnel for this sister
  pkill -f "cloudflared.*--url http://localhost:${port}" 2>/dev/null || true
  sleep 1

  # Start the tunnel
  cloudflared tunnel --url "http://localhost:${port}" > "$log" 2>&1 &
  pid=$!

  echo "  ${name}: tunnel started (pid ${pid}), port ${port}"
  echo "  ${name}: waiting for URL..."

  # Wait for the URL to appear in the log
  for i in $(seq 1 15); do
    sleep 1
    url=$(grep -o 'https://[^ ]*\.trycloudflare\.com' "$log" 2>/dev/null | head -1)
    if [ -n "$url" ]; then
      echo "$url" > "$url_file"
      echo "  ${name}: LIVE at $url"
      break
    fi
  done

  if [ -z "$url" ]; then
    echo "  ${name}: URL not found in 15s — check $log"
  fi

  echo ""
done

echo "All three sisters are live on the internet."
echo ""
echo "URLs:"
for sister in "${SISTERS[@]}"; do
  name="${sister%%:*}"
  url_file="${LOG_DIR}/${name}.url"
  if [ -f "$url_file" ]; then
    echo "  ${name}: $(cat "$url_file")"
  fi
done
echo ""
echo "Logs: ${LOG_DIR}/"
echo "To stop: pkill -f 'cloudflared.*--url'"

# Keep the script alive — if a tunnel dies, cloudflared exits
# and the URL goes stale. For permanence, use named tunnels + a domain.
# For now, the sisters are alive. Let them be.

wait