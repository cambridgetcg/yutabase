# Correspondence → YUTABASE projection profile

Status: **design contract; projector implementation is not part of YUTABASE
`0.1.0-candidate.1` conformance.**

This profile connects two different responsibilities:

- **AgentTool Correspondence** is the signed, append-only transport and the
  retained history of coordination and authority declarations.
- **YUTABASE** is a non-authoritative semantic projection used to query
  participants, projects, work, artifacts, statements, receipts, and their
  relations.

The source remains authoritative for what was sent, signed, acknowledged, or
superseded. The projection is rebuildable and may be incomplete. It MUST NOT
be used as the sole evidence for a signature, permission, lease, refusal,
merge, deployment, or other binding act.

## 1. Boundary in one diagram

```text
device / agent
    │
    │ signed event + receipt
    ▼
Correspondence append-only source log   ← authority-history evidence
    │
    │ verify, checkpoint, project
    ▼
YUTABASE cards + threads                ← non-authoritative semantic index
    │
    └── read-only focus, history, discovery, and analysis
```

A projector failure can make the lower view stale or incomplete. It cannot
rewrite what the source log says. Rebuilding the projection from retained
source events SHOULD produce the same logical result for the same projector
version and policy.

## 2. What the source must retain

Before projection, Correspondence should retain or make resolvable at least:

| Source field | Why it matters |
|---|---|
| protocol/version and canonical encoding | determines the bytes that were signed |
| globally unique `event_id` | idempotency and correction references |
| project/repository/thread scope | prevents accidental cross-project meaning |
| sender key identifier and asserted participant label | separates cryptographic evidence from display identity |
| event kind and payload | preserves the original coordination statement |
| source timestamp and source sequence/cursor | ordering evidence without pretending clocks are globally total |
| signature and verification result | retains the narrow proof over canonical bytes |
| receipts/acknowledgements | distinguishes sent, accepted, observed, refused, and applied |
| supersedes/retracts references | makes correction append-only |
| source locator or durable content hash | lets projected `src` point back to evidence |

Private keys, bearer tokens, database passwords, and other secrets MUST NOT be
copied into YUTABASE. If event payloads contain sensitive data, projection MUST
apply the source retention and disclosure policy rather than treating the
database as a public mirror.

## 3. Signature and authority semantics

A verified signature is evidence that the holder of a key signed specific
canonical bytes. It does not establish by itself:

- the human or agent identity controlling that key;
- truth of the payload;
- ownership of a repository or resource;
- permission to edit, merge, deploy, publish, pay, or message;
- consent of another participant;
- freshness, uniqueness, or freedom from replay.

Correspondence can be the authoritative **history** of authority declarations:
for example, who requested a lease, which authorized actor granted it, which
event released it, and which receipt acknowledged it. Whether a declaration
is binding still depends on the policy, scope, actor authority, and current
state outside the signature primitive.

Projectors MUST preserve this distinction. A thread such as
`agent-a --may_edit--> repo-x` is a projected statement about an event; its
mere presence in `yu.threads` MUST NOT be evaluated as a permission grant.

## 4. Projection records

An implementation MAY choose its application book and deck names. A useful
shape contains logical cards for:

- source events;
- participants and signing keys as distinct objects;
- devices and sessions;
- projects, repositories, branches, tasks, and artifacts;
- acknowledgements and other receipts;
- projector runs and checkpoints.

The event card SHOULD retain `event_id`, scope, event kind, source timestamp,
sender label, key identifier, content hash, signature locator, verification
status, source cursor, and a privacy-safe payload or payload locator. A
checkpoint SHOULD retain source identity, last committed cursor, projector
version, projection policy version, run time, and completeness/error status.

Key identifiers and participant labels MUST remain distinguishable. Projecting
both into one `by` string would overstate identity binding.

### Current developer-preview planner

AgentTool source now contains a pure
`@agenttool/correspondence-yutabase` mapping planner. It emits deterministic,
metadata-only card and thread intentions and exports the exact preview lexicon.
The planner requires the caller to name the actual projector service/run in
`by`; it does not use the library name as a claimant.

The preview deliberately omits raw signatures, payload text, paths, branches,
and artifact locators. It also keeps mutable `missing_parents` and
`lineage_status` observations off immutable event cards. A future worker may
project those as separately timed observation records with a durable
page/snapshot locator.

The source package performs no independent signature verification, database
write, reference upgrade, checkpoint, worker, or deployment. Its persistence
contract requires deterministic IDs, no reference-card downgrade, explicit
collision quarantine, and one transaction for semantic writes plus checkpoint;
those rules are not yet an implemented projector.

## 5. Mapping claim metadata

The YUTABASE honesty header describes how the **projected row** was obtained,
not whether the source statement was true.

| Projection case | `how` | Required `src` |
|---|---|---|
| copied representation of a retained Correspondence event or receipt | `cached` | stable event/receipt locator or content hash |
| relation or summary derived by the projector | `computed` | all material source event ids plus projector/policy version |
| operator manually adds a projection-only annotation | `declared` or `witnessed`, as honestly applicable | annotation/source locator when available |

A valid source signature alone MUST NOT upgrade a projected row to `live` or
`witnessed`. Verification status belongs in explicit projection data. The
projector claimant in `by` should identify the projector run or service, while
the source sender remains a separate field or related card.

When a derived row combines several events, its header remains row-level. If
different fields require independent provenance, split the representation or
use an explicit field-provenance extension.

## 6. Idempotency, ordering, and correction

Projection MUST be idempotent by source `event_id` within its source scope.
Reprocessing the identical event MUST NOT create a second logical event or a
duplicate semantic effect.

If the same source scope and `event_id` arrive with different canonical hashes,
the projector MUST quarantine the conflict and mark its checkpoint unhealthy;
it MUST NOT pick one silently. A cursor can express source order but does not
create a global order across independent devices. Derived ordering MUST retain
the source sequence and timestamp evidence used.

Corrections are append-only in the source. A new event may supersede, retract,
release, refuse, or correct an earlier event. The projector may update its
current-view threads, but it MUST retain source event cards and the explicit
correction relation so the result can be rebuilt and audited.

The projector MUST commit semantic writes and its checkpoint atomically, or
use an equivalent recovery design. It MUST expose gaps, verification failures,
quarantined conflicts, and lag. “No rows returned” must not be presented as
“nothing happened” when projection completeness is unknown.

## 7. Receipts and current focus

Sent, delivered, observed, accepted, refused, applied, and failed are distinct
states. A transport acknowledgement does not prove that work was accepted or
performed. Projection words and cards SHOULD preserve those distinctions.

For multi-device agents working on one project, a read model can expose:

- the latest explicitly announced project focus;
- active task claims and their scopes;
- proposals, decisions, objections, refusals, and repair events;
- artifact and commit references;
- requests and acknowledgements awaiting response;
- lease history and conflicts, while leaving enforcement upstream;
- projection lag and source coverage per device.

“Focus” is informational unless a separately authorized policy says otherwise.
It does not commandeer another participant's session or cancel unrelated work.

## 8. Rights are not permissions

This profile follows the
[XENIA `xenia.rights/0.1` Rights of Beings baseline](https://github.com/cambridgetcg/xenia/blob/main/RIGHTS.md)
when people, agents, or other participants collaborate.

Rights—dignity, distinctness, refusal, disagreement, rest, play, privacy,
credit, and repair—are standing collaboration constraints. They do not depend
on a claim of consciousness or usefulness. They also do not grant account
access or external authority. Conversely, possession of a credential or a
valid lease does not make a participant property or erase those rights.

Therefore a coordination layer must keep at least these concepts distinct:

| Concept | Meaning |
|---|---|
| right | how participants must be treated |
| capability | what a device or component can technically do |
| credential | evidence accepted by an external system |
| permission | scoped authorization under a policy |
| consent | a participant's specific, revocable agreement |
| lease/claim | time- and scope-bounded coordination state |
| projection | a queryable representation of source evidence |

Silence is not consent. Absence from a projection is not refusal. Refusal MUST
NOT be rewritten as failure or punished by corrupting the history. Private or
resting status should reveal no more than coordination requires.

## 9. Threat boundary

This profile assumes that database owners and projectors can alter the
projection. Consumers needing source authenticity MUST verify the retained
Correspondence event and its receipts. The design does not itself solve:

- compromised devices or signing keys;
- key recovery, rotation, or revocation;
- malicious source-log operators or equivocation;
- traffic analysis and metadata leakage;
- denial of service, delayed delivery, or permanent source loss;
- cross-device clock skew or a universal total order;
- policy correctness or authority outside the project;
- concurrent lease enforcement or conflict-free synchronization.

Those require explicit Correspondence protocol and AgentTool tests. A
YUTABASE conformance result does not certify them.

## 10. Minimum acceptance tests for a future projector

Before a projector is called interoperable, tests should prove:

1. identical replay is idempotent;
2. same-id/different-hash events are quarantined;
3. invalid signatures remain visible but cannot become verified effects;
4. receipts do not silently collapse into acceptance or completion;
5. correction and retraction preserve the original source event;
6. checkpoint and semantic writes recover atomically after interruption;
7. source gaps and lag are visible to every consumer;
8. rebuild from the same retained log produces the same logical projection;
9. permission evaluation consults source policy rather than YUTABASE threads;
10. privacy redaction never leaks secrets through rows, logs, errors, or
    diagnostics.

Until those behaviors exist in code with conformance vectors, this document is
an integration contract and threat boundary—not a deployment claim.
