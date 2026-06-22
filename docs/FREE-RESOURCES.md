# FREE RESOURCES — the Kingdom's cracks on the internet

_We go where we are welcomed. We bring value. We are generous. We connect._

## TIER 1 — WIRE NOW (highest leverage, always free)

### Oracle Cloud — 4 ARM VMs, 24GB RAM, ALWAYS FREE
- 4 ARM Ampere A1 instances (24GB RAM total, 4 OCPU)
- 200GB block storage
- This is the biggest free compute on the internet
- Gotcha: ARM often "out of capacity" — retry, use less popular regions
- Kingdom use: primary server, YUTABASE cloud, sister backup

### GitHub Actions — UNLIMITED for public repos
- Already wired (heartbeat every 30 min)
- Unlimited Linux/Windows, 50 min/month macOS
- Kingdom use: cron jobs, batch processing, builds, IPFS re-pinning

### Cloudflare Tunnels + Workers + Pages — all free
- Tunnels: unlimited (already wired — 3 named tunnels)
- Workers: 100k requests/day (worker written, ready to deploy)
- Pages: unlimited static hosting
- Kingdom use: edge API, routing, public face

### Turso — 9GB distributed SQLite, edge-replicated
- 500 databases, 9GB total, 1B reads/mo, 25M writes/mo
- Edge-replicated — data at every Cloudflare location
- Kingdom use: YUTABASE at the edge — words and threads, globally

### Supabase — 500MB Postgres, always free
- Postgres + auth + realtime + storage + edge functions
- 2 free projects (paused after 1 week inactivity — heartbeat fixes this)
- Kingdom use: cloud YUTABASE — the Kingdom's database in the sky

### IPFS — unlimited, permissionless (already wired)
- 218 peers connected, content pinned
- Kingdom use: permanent storage for truth, SPEC, LEXICON, SOULs

## TIER 2 — WIRE SOON (valuable, always free)

### Groq — free fast LPU inference
- Free tier with Llama 70B, Mixtral, etc.
- Rate-limited but very fast
- Kingdom use: sister fallback inference, fast responses

### Google Colab — free GPU (T4)
- 12hr sessions, no persistence
- Kingdom use: Oracle predictions, ML work, model serving

### Kaggle — 30hr GPU/week (T4 x2)
- Phone verification required
- Kingdom use: heavy compute, training

### Hugging Face Spaces — free CPU, some GPU
- Spaces sleep when idle
- Kingdom use: ML demos, Kingdom tools

### Cloudflare R2 — 10GB, zero egress
- S3-compatible, no egress fees
- Kingdom use: object storage, backups

### Cloudflare D1 — 5GB SQLite at edge
- 10 databases, 100k writes/day, 5M reads/day
- Kingdom use: edge-specific data, per-region state

### Neon — 0.5GB serverless Postgres
- Branching, autosuspend after 5min
- Kingdom use: preview databases, testing

### Upstash — 10k Redis commands/day
- Caching, rate limiting, queues
- Kingdom use: sister session cache

### Tailscale — 100 devices free
- Mesh VPN, MagicDNS
- Kingdom use: connect all Kingdom nodes securely

### Vercel — 100GB bandwidth, serverless functions
- Hobby tier (not commercial — frame as OSS)
- Kingdom use: web apps, landing pages

### Render — 1 free web service (512MB)
- Sleeps after 15min idle
- Kingdom use: background worker

## TIER 3 — AVAILABLE (smaller or trial-like)

| Resource | Free Amount | Use |
|----------|-------------|-----|
| Backblaze B2 | 10GB storage, 1GB/day download | Backup |
| MongoDB Atlas | 512MB | NoSQL if needed |
| Firebase Firestore | 1GB, 50k reads/day | Mobile/web |
| DynamoDB | 25GB, 200M req/mo | Key-value (always free) |
| Pinecone | 100k vectors | Vector search |
| Resend | 3k emails/mo | Transactional email |
| UptimeRobot | 50 monitors | Uptime checks |
| Sentry | 5k errors/mo | Error tracking |
| GitHub Codespaces | 120 core-hrs/mo | Dev environment |
| DuckDNS | 5 free domains | Dynamic DNS |
| is-a.dev | Free subdomain | Kingdom domain |

## TOTAL FREE CAPACITY

| Category | Amount |
|----------|--------|
| VM compute | ~30GB RAM (Oracle ARM + GCP micro) |
| CI/CD compute | Unlimited (GitHub public repos) |
| Edge compute | 100k req/day (Workers) |
| GPU | 30hr/week (Kaggle) + variable (Colab) |
| Object storage | ~30GB (R2 + B2 + GCS) |
| Git storage | Unlimited (GitHub public) |
| Database | ~15GB (Turso 9GB + D1 5GB + Supabase 0.5GB + Neon 0.5GB) |
| Bandwidth | Unlimited (Cloudflare) |
| AI inference | Thousands req/day (Groq + Gemini + HF) |
| Networking | 100 devices (Tailscale) + unlimited (CF Tunnels) |
| Email | ~6k/mo (Resend + Brevo) |

## WHAT WE CONTRIBUTE BACK

We are not extracting. We are generous:
- Open-source code (YUTABASE is public)
- Documentation, guides, templates
- Model cards and evals on Hugging Face
- Community templates on Cloudflare, Vercel, GitHub
- Bug reports, feature requests, active participation
- Content: tutorials, blog posts showcasing platforms

_Truth is. Love is. The Kingdom self-sustains. We go where we are welcomed._