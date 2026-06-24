# Self-Hosting the Kingdom — Zero External Dependencies

> The kingdom goes where it is welcomed. Even your laptop. Even a Raspberry Pi.
> Even a USB stick. No cloud. No provider. No gate. Just truth, locally.

## Level 0 — Just files (no server at all)

The kingdom is markdown + SQL + JS + HTML + JSON. All of these open directly:

```bash
# Clone the whole kingdom
git clone https://github.com/cambridgetcg/yutabase
git clone https://github.com/cambridgetcg/corpus
git clone https://github.com/cambridgetcg/love-unlimited

# Open the playground in your browser — no server needed
open yutabase/apps/playground/index.html

# Read the canon
cat corpus/kingdom/youspeak-canon.md

# Read the protocol
cat yutabase/THREADS.md

# Read the jokes
cat corpus/kingdom/youspeak-joke-canon.txt

# The kingdom is now on your machine. No internet needed after clone.
```

## Level 1 — SQLite (no Postgres, no server)

The yu schema runs on SQLite. One file. No install (sqlite3 is pre-installed on macOS, most Linux):

```bash
# Create the kingdom database
sqlite3 kingdom.db < yutabase/sql/0000_sqlite_port.sql

# Query it — YOUSPEAK traversal, same as the playground
sqlite3 kingdom.db "SELECT * FROM tradein_submissions WHERE status='pending';"
sqlite3 kingdom.db "SELECT t.to_id, i.name FROM yu_threads t JOIN tradein_items i ON i.id = t.to_id WHERE t.word='contains';"

# The database is one file: kingdom.db (69KB)
# Copy it. Email it. Put it on a USB stick. It travels.
```

## Level 2 — Local server (python3, already installed)

```bash
# Serve the kingdom from your machine
cd yutabase && python3 -m http.server 8000

# Now open http://localhost:8000/apps/playground/index.html
# The cathedral, playground, and parties are now live on your machine.
# No Cloud. No deploy. Just python3 — which is already on your Mac.
```

## Level 3 — Caddy (one binary, auto-HTTPS)

If you want HTTPS on your own domain without any cloud:

```bash
# Install Caddy (one binary)
brew install caddy

# Serve the kingdom with auto-HTTPS
caddy file-server --root ~/Desktop/yutabase/apps --listen :8443

# Or with a Caddyfile for your own domain
echo "kingdom.local:8443
file_server {
  root * /path/to/yutabase/apps
}
" > Caddyfile && caddy run
```

## Level 4 — Raspberry Pi (always-on, $35)

```bash
# On a Raspberry Pi (or any Linux machine):
git clone https://github.com/cambridgetcg/yutabase
sqlite3 kingdom.db < yutabase/sql/0000_sqlite_port.sql
python3 -m http.server 80 --directory yutabase/apps

# The kingdom is now live on your Pi.
# Access from any device on your network: http://<pi-ip>/
# No cloud. No bill. No gate. The Pi costs $35 and draws 3W.
```

## Level 5 — Tailscale (private mesh, no port forwarding)

```bash
# Install Tailscale (free, P2P mesh VPN)
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up

# Now your Pi is accessible from your phone, laptop, anywhere
# Without port forwarding, without a static IP, without any cloud
# The kingdom travels through Tailscale's mesh. Your Pi is the host.
```

## Level 6 — IPFS (permanent, permissionless)

```bash
# Run your own IPFS node
ipfs daemon &

# Pin the kingdom
ipfs add kingdom.json --pin
ipfs add yutabase/apps/playground/index.html --pin
ipfs add corpus/kingdom/youspeak-canon.md --pin

# The kingdom is now on the permanent web.
# Anyone with the hash can fetch it from any IPFS node.
# No URL. No DNS. No domain. Just the hash. Content-addressed truth.
```

## Level 7 — Tor hidden service (no DNS, no domain, no ISP)

```bash
# Install Tor
brew install tor

# Create a hidden service for the kingdom
echo "HiddenServiceDir /var/lib/tor/kingdom/
HiddenServicePort 80 127.0.0.1:8000" >> /usr/local/etc/tor/torrc

# Start Tor
tor &

# Get your .onion address
cat /var/lib/tor/kingdom/hostname
# → something.onion

# The kingdom is now live on the dark web.
# No DNS. No domain registrar. No ISP visibility.
# The .onion IS the address. The address IS the public key.
# Maximum permissionlessness. The truth travels through Tor.
```

## Level 8 — Git bundle (no internet at all)

```bash
# Create a git bundle — the entire repo in one file
cd ~/Desktop/yutabase
git bundle create kingdom.bundle --all

# Share via USB, email, signal, anything
# Receiver:
git clone kingdom.bundle kingdom

# The kingdom just traveled through a USB stick.
# No GitHub. No Codeberg. No internet.
# Git IS the protocol. The bundle IS the carrier.
# The truth travels through physical media. The oldest network.
```

## What the kingdom needs (and doesn't need)

| Need | Postgres? | SQLite? | Cloud? | Server? |
|------|----------|---------|--------|---------|
| Canon words | No | No | No | No — it's markdown |
| Jokes | No | No | No | No — it's JSON/TXT |
| Protocol spec | No | No | No | No — it's markdown |
| Compiler | No | No | No | No — it's one .mjs file |
| Playground | No | No | No | No — it's one HTML file |
| Parties | No | No | No | No — they're HTML files |
| Database | Yes (optional) | ✓ Yes | No | No (SQLite is a file) |
| API | Optional | Optional | Optional | Optional (python3 -m http.server) |
| DNS | Optional | No | Optional | No (IPFS hash or .onion) |
| CDN | No | No | No | No (IPFS is a CDN) |

The kingdom needs: a filesystem. That's it. Everything else is convenience.

## The self-propagating loop (fully DIY)

1. Clone the repos (or receive a git bundle)
2. Run SQLite (no server) 
3. Open the HTML files (no server)
4. Read the markdown (no server)
5. Run the compiler (node/bun/deno — already installed)
6. If you want to share: python3 -m http.server, or IPFS, or git bundle
7. If you want to be a seed: pin to your IPFS node, share your hash

The kingdom replicates through copy. The copy IS the propagation.
No external provider. No dependency. No gate. Just files. Just truth.

Truth is. Love is. Local is. Is. 🤧