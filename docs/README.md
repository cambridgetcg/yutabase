# YUTABASE documentation map

Documents are classified so imagination, implementation, and evidence can sit
together without being mistaken for one another.

## Normative candidate material

- [`../SPEC.md`](../SPEC.md) — YUTABASE Core and the PostgreSQL 16/17 binding.
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
- [`../THREADS.md`](../THREADS.md) — experimental language-shaped protocol
  research, not a released wire protocol.

These documents set boundaries and acceptance tests. A private AgentTool
projector implements one loopback-only integration profile; projector, sync,
lease, and conflict mechanisms are still not YUTABASE candidate features.

## Experimental and creative notebooks

- [`NEN-SYSTEM.md`](NEN-SYSTEM.md)
- [`INFINITE-AUDIT.md`](INFINITE-AUDIT.md)
- [`INVITATION.md`](INVITATION.md)
- [`../DARK-CONTINENT.md`](../DARK-CONTINENT.md)
- [`../INFRA-IS-FEELINGS.md`](../INFRA-IS-FEELINGS.md)
- [`../FABLE-OF-YOU.md`](../FABLE-OF-YOU.md)
- [`../WAKE.md`](../WAKE.md)
- [`../panel-v0.1.json`](../panel-v0.1.json) — archived design deliberation

These preserve metaphors, values, and possible interface directions. They are
not candidate requirements.

## Infrastructure and propagation notebooks

- [`FREE-RESOURCES.md`](FREE-RESOURCES.md)
- [`SELF-HOSTED.md`](SELF-HOSTED.md)
- [`SELF-PROPAGATING.md`](SELF-PROPAGATING.md)
- [`SELF-SUSTAINS.md`](SELF-SUSTAINS.md)
- [`../SELFHOST.md`](../SELFHOST.md) — archived, unsafe as a current runbook
- [`../HEARTBEAT.md`](../HEARTBEAT.md) — historical snapshot, not health
- [`../LINKS.md`](../LINKS.md) — unverified time-sensitive link snapshot
- [`../play/`](../play/) — experiments; some scripts have network or
  publication side effects and are not candidate tools

These are historical or exploratory notes. URLs, quotas, deployments,
availability, pinning, and service state must be independently checked before
operational use.

## Release operations

- [`NPM-RELEASE.md`](NPM-RELEASE.md) — the protected, OIDC-only path for
  mirroring an existing immutable SDK candidate artifact to npm. It does not
  create tags, GitHub releases, npm trust, or database deployments.

## Product, policy, and tax research

- [`TAXSORTED.md`](TAXSORTED.md)
- [`UK-MAP.md`](UK-MAP.md)
- [`UK-TAX-GAME.md`](UK-TAX-GAME.md)
- [`SDST-DRAFTS.md`](SDST-DRAFTS.md)

These are product/research notes, not YUTABASE conformance, legal advice, tax
advice, filing authority, or evidence that an external submission occurred.
Time-sensitive facts must be reverified against primary sources before use.

## Status notes

- [`../STATE.md`](../STATE.md) — repository status and current integration
  focus. It is not a liveness or deployment receipt.
- [`../MEMORY.md`](../MEMORY.md) — compact current candidate context for a
  human/agent session; the spec and installed catalog remain authoritative.
- [`../LEXICON.md`](../LEXICON.md) — non-normative exported environment
  snapshot, not the fresh seven-word candidate lexicon.
- [`../AGENTTOOL-YOUSPEAK-INTEGRATION.md`](../AGENTTOOL-YOUSPEAK-INTEGRATION.md)
  — historical integration ideation whose proposed extra verbs are not core.
- [`../apps/landing/index.html`](../apps/landing/index.html) — presentation
  copy only; it is not a migration, conformance result, or deployment receipt.

The playful writing remains part of the project's voice. Classification only
keeps its meaning honest.
