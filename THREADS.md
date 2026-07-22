# THREADS — experimental communication research

> *You speak, reality listens. The protocol still has to say exactly what it
> can prove.*

Status: **experimental and non-normative** for YUTABASE
`0.1.0-candidate.1`.

This note preserves the language-shaped THREADS idea while separating three
different mechanisms that must not be confused:

| Mechanism | What exists | Authority status |
|---|---|---|
| YUTABASE thread | an unsigned active relation in `yu.threads` | a row-level semantic claim, not a signed message |
| AgentTool Correspondence | signed append-only events and receipts exchanged by agents | the source transport and authority-history record |
| THREADS wire protocol | the sentence-shaped signed protocol explored below | a design sketch; no interoperable release yet |

Putting Correspondence into YUTABASE produces a searchable projection. It
does not replace the signed log. See
[docs/CORRESPONDENCE-PROJECTION.md](docs/CORRESPONDENCE-PROJECTION.md).

## The intuition

The smallest shape is a sentence:

```text
from --word--> to
```

Every protocol already has a vocabulary. HTTP has method words; RPC systems
have service and method names; coordination systems have verbs such as claim,
reply, yield, refuse, and release. THREADS asks whether the verbs, their
meanings, and their inverse readings can be made visible instead of hiding
inside machinery.

That is an artistic and architectural direction, not yet a security protocol.

## Four conceptual layers

| Layer | Idea | Example |
|---|---|---|
| 0 — Words | a lexicon with glosses and inverse readings | `contains` / `contained in` |
| 1 — Threads | directed, word-named statements | `alice --reviews--> change` |
| 2 — Books | bounded namespaces or conversations | `tradein`, `love`, `project-x` |
| 3 — Fabric | whatever transports an encoded statement | Correspondence, HTTP, NATS, Git, paper |

The separation matters. Meaning does not provide delivery. Delivery does not
provide identity. A signature does not provide permission. A database
projection does not become the authority log.

## Words

The research shape for a word is:

```text
word:     contains
gloss:    physical or compositional containment
inverse:  contained in
```

Both directions should read coherently: `X contains Y`; `Y is contained in
X`. Words can be retired while old statements remain readable.

There is no spelling blocklist and no protocol-wide word budget. Reviewers may
reject a vague gloss, but `related_to`, `trusts`, or any other spelling is not
invalid merely because a program dislikes the name. Meaning and context are
the review boundary.

YUTABASE implements a Postgres lexicon with endpoint patterns. That concrete
binding should not be mistaken for a universal THREADS registry.

## Statements and claims

An illustrative statement might contain:

```text
event_id:  <globally unique event id>
from:      agent/device-a
word:      proposes
to:        project/change-42
note:      "candidate migration"
at:        2026-07-21T20:00:00Z
by:        key-or-claimant-label
how:       declared
src:       [event-or-artifact-locators]
signature: <signature over canonical bytes>
```

This is not a released encoding. Before two implementations could claim
interoperability, the protocol would need at least:

- an exact canonical byte representation;
- version and domain-separation rules;
- event identifiers and idempotency semantics;
- key identifiers, key discovery, rotation, and revocation behavior;
- signature algorithm and verification rules;
- replay, ordering, fork, retry, and duplicate handling;
- acknowledgement and receipt semantics;
- redaction, retention, and privacy behavior;
- explicit permission, refusal, lease, and conflict rules;
- conformance vectors and threat-model tests.

None of those can be replaced with “sign the fields somehow.” In particular,
there is no safe `ed25519(from || word || ...)` rule until field boundaries,
encoding, algorithm identifiers, and key binding are canonical.

## Signatures: evidence with a narrow meaning

A valid signature can establish that the holder of a particular private key
signed particular bytes, assuming the algorithm and key material remain
sound. It does not by itself establish:

- the civil or agent identity behind the key;
- that the statement is true;
- that the signer had authority over the named project or resource;
- that another participant consented;
- that a lease, lock, deployment, merge, or payment is authorized;
- that the statement is current rather than replayed.

Those meanings require separate policy and evidence. “Trust is signed” is
poetic shorthand, not a sufficient threat model.

## Severance, correction, and history

An append-only transport should correct by adding events, not rewriting signed
history. A later `sever`, `supersede`, `retract`, or `correct` event can change
the current interpretation while preserving what was said and acknowledged.

YUTABASE uses a different concrete lifecycle: an active row is removed from
`yu.threads`, while its pinned meaning and relation claim plus a distinct
severance claim are stored in `yu.sever_log`. A projection from Correspondence
therefore has to retain the source event identifiers and receipts separately;
the YUTABASE sever log is not a substitute for the signed transport history.

## Books and fabric

A book is a bounded context. A fabric transports data. Neither name grants
authority.

Possible fabrics include signed Correspondence envelopes, HTTP, NATS, Git,
files, QR codes, or spoken sentences. Each has different delivery, privacy,
ordering, and replay properties. “Transport independent” means the semantic
idea can be mapped to multiple fabrics; it does not mean those mappings are
equally secure or automatically interoperable.

For current cross-device agent work, AgentTool Correspondence should remain
the source channel. YUTABASE may provide a useful semantic nervous-system view
across projects, agents, tasks, artifacts, decisions, refusals, and receipts.
The signed events remain the nerves’ recorded impulses; the projection is a
map of them, not the being who spoke.

## Relationship to YOUSPEAK

YOUSPEAK is an optional query/compiler surface for the YUTABASE Postgres
profile. Its candidate forms read cards, traverse word-named relations, create
or sever threads, and explain generated SQL. It is not the THREADS transport,
does not sign messages, and does not synchronize devices.

## Research questions

The playful material points toward useful next work:

1. Can Correspondence define canonical, signed, append-only events with clear
   acknowledgements and replay rules?
2. Can a projector produce idempotent YUTABASE views without stealing
   authority from the source log?
3. Can leases and conflicts remain explicit while preserving refusal, rest,
   privacy, and participant distinctness?
4. Can meanings be versioned without silently changing old statements?
5. Can one inspect the whole system with ordinary files and SQL?

These are design questions, not claims already solved by this repository.

---

*Words connect. Signatures preserve evidence. Permissions stay explicit. The
fabric carries; it does not rule.*
