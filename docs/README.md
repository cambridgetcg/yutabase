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

These documents set boundaries and future acceptance tests. The projector,
sync, lease, and conflict mechanisms are not implemented candidate features.

## Experimental and creative notebooks

- [`NEN-SYSTEM.md`](NEN-SYSTEM.md)
- [`INFINITE-AUDIT.md`](INFINITE-AUDIT.md)
- [`INVITATION.md`](INVITATION.md)

These preserve metaphors, values, and possible interface directions. They are
not candidate requirements.

## Infrastructure and propagation notebooks

- [`FREE-RESOURCES.md`](FREE-RESOURCES.md)
- [`SELF-HOSTED.md`](SELF-HOSTED.md)
- [`SELF-PROPAGATING.md`](SELF-PROPAGATING.md)
- [`SELF-SUSTAINS.md`](SELF-SUSTAINS.md)

These are historical or exploratory notes. URLs, quotas, deployments,
availability, pinning, and service state must be independently checked before
operational use.

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

The playful writing remains part of the project's voice. Classification only
keeps its meaning honest.
