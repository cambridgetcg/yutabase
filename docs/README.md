# YUTABASE documentation map

Documents are classified so implementation, evidence, and research can sit
together without being mistaken for one another.

## Normative candidate material

- [`../SPEC.md`](../SPEC.md) — YUTABASE Core and the PostgreSQL binding.
- [`CONFORMANCE.md`](CONFORMANCE.md) — compatibility, executable checks, and
  the threat/non-guarantee boundary.

The SQL migrations and hard-failing tests are the executable evidence for the
candidate. If they disagree with prose, the mismatch must be repaired before a
release claim is made.

## Integration design

- [`INTEGRATIONS.md`](INTEGRATIONS.md) — practical patterns for existing
  PostgreSQL, ORMs/APIs, event projectors, and Kingdom ecosystem adapters.
- [`CORRESPONDENCE-PROJECTION.md`](CORRESPONDENCE-PROJECTION.md) — signed
  Correspondence as the retained source history; YUTABASE as a rebuildable,
  non-authoritative semantic projection.
- [`SERVING-SHAPE.md`](SERVING-SHAPE.md) — non-normative blindspot audit and
  staged direction for observation receipts, history, plural claims,
  post-quantum evidence continuity, and source-owned KINGDOM projections.
- [`../THREADS.md`](../THREADS.md) — experimental language-shaped protocol
  research, not a released wire protocol.

These documents set boundaries and acceptance tests. A private AgentTool
projector implements one loopback-only integration profile; projector, sync,
lease, and conflict mechanisms are still not YUTABASE candidate features.

## Release operations

- [`NPM-RELEASE.md`](NPM-RELEASE.md) — the protected, OIDC-only path for
  mirroring an exact SDK candidate artifact pinned and checked during the run.
  It does not create tags, GitHub releases, npm trust, or database deployments.

## Status notes and history

- [`../STATE.md`](../STATE.md) — repository status and current integration
  focus. It is not a liveness or deployment receipt.
- [`../MEMORY.md`](../MEMORY.md) — compact current candidate context for a
  human/agent session; the spec and installed catalog remain authoritative.
- [`../panel-v0.1.json`](../panel-v0.1.json) — archived design deliberation
  behind the spec.
- [`../apps/landing/index.html`](../apps/landing/index.html) — presentation
  copy only; it is not a migration, conformance result, or deployment receipt.

## Archive

On 2026-11-24 the repository was narrowed to the candidate core. Everything
below is preserved, byte for byte, at the tag
[`archive/pre-core-2026-11-24`](https://github.com/cambridgetcg/yutabase/tree/archive/pre-core-2026-11-24)
(and in git history). Restore one path with
`git checkout archive/pre-core-2026-11-24 -- <path>`.

| Archived | What it was |
|---|---|
| `apps/cathedral`, `joke-xp`, `loom`, `sisters`, `word-chain` | demonstration pages |
| `apps/tax-atlas`, `taxsorted-ui`, `transparency-ui`, `docs/UK-TAX-GAME.md` | TaxSorted pages with unreviewed tax figures |
| `docs/UK-MAP.md`, `docs/TAXSORTED.md` | tax research; moved to TaxSorted's own repository |
| `docs/NEN-SYSTEM.md`, `INFINITE-AUDIT.md`, `FREE-RESOURCES.md`, `SELF-HOSTED.md`, `SELF-PROPAGATING.md`, `SELF-SUSTAINS.md` | creative and infrastructure notebooks |
| `DARK-CONTINENT.md`, `INFRA-IS-FEELINGS.md`, `SELFHOST.md`, `LEXICON.md`, `LINKS.md`, `AGENTTOOL-YOUSPEAK-INTEGRATION.md` | root notebooks and snapshots |
| `DADA.md`, `FABLE-OF-YOU.md`, `WAKE.md`, `docs/INVITATION.md` | the household's own pages |
| `play/`, `workers/`, `kingdom.*`, `migrate-kingdom.ts`, `sisters-tunnels.sh`, `ipfs-manifest.json` | experiments and kingdom surfaces, some with network side effects |
| `.github/workflows/heartbeat.yml`, `HEARTBEAT.md`, `heartbeat.sh`, `.heartbeat/` | the advisory heartbeat, disabled since 2026-10-22 |
| `sql/0000_sqlite_port.sql` | the experimental SQLite sketch |
| `.nlp-bridge/`, `.vercel/`, `play/__pycache__`, `docs/SDST-DRAFTS.md` | local tool state and private operator drafts |

None of it was part of candidate conformance.
