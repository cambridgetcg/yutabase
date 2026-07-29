# Serving shape — what YUTABASE should help a database say

Status: **non-normative research and decision record**, reviewed 2026-07-29.

This note does not change YUTABASE Core, apply a database migration, make a
quantum-computing claim, or certify any deployment. It records what the current
candidate can honestly serve, where common database abstractions lose
important context, and which optional mechanisms are worth testing next.

## Decision in one paragraph

A database should be dependable memory in service of a purpose: it should keep
records durable, constrained, recoverable, and queryable for authorized
readers and writers. It should not silently turn stored state into external
truth. YUTABASE already adds useful claim and meaning boundaries to PostgreSQL.
The next highest-value work is an **observation receipt** that says what a
result covered, followed by append-only correction history and a way to retain
several assertions about one proposition. “Quantum database” is not an honest
Core direction today. Post-quantum cryptographic continuity is real, however,
so an optional evidence annex should be algorithm-agile and keep all private
keys outside YUTABASE.

## The purpose: serve memory without pretending to be reality

The smallest useful picture is:

```text
world or source
      |
      v
recorded claim -> constraints + transaction -> query/projection -> decision/action
      |                                      |
      +-- evidence and correction history    +-- coverage/freshness receipt
```

Each arrow has a different authority:

- a source can report an event;
- a database can enforce its constraints and report what it accepted inside
  its authority boundary;
- a verifier can report what it checked under a named policy;
- a query can report what source range it observed;
- a person or policy engine can make a decision.

Collapsing those five acts into “the database says it is true” creates false
certainty. The serving shape keeps them separate.

YUTABASE Core currently serves:

- stable logical refs over selected PostgreSQL rows;
- governed, version-pinned meanings for selected relations;
- active relation integrity inside a declared PostgreSQL authority boundary;
- an explicit, self-reported `at/by/how/src` claim for each conforming row;
- SQL-readable state without requiring the optional SDK.

It deliberately does **not** serve authentication, consent, authorization,
signature verification, source truth, arbitrary card history, replication,
conflict-free sync, tenancy, encryption, or secrets. Those boundaries in
[`SPEC.md`](../SPEC.md#9-compatibility-security-and-authority-boundary) remain
correct.

## Blindspot ledger

These are not accusations that PostgreSQL or the relational model is broken.
They are places where a correct database result can still be misunderstood by
a human or agent.

| Blindspot                         | Friction today                                                                                                                                                           | Smallest honest next mechanism                                                                                                           | Placement                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Observation and coverage          | An empty result can mean “nothing matched”, “the projector is behind”, or “that source was never scanned”.                                                               | Return an observation receipt with scope, coverage state, checkpoint, lag, freshness, isolation, and warnings.                           | Optional SDK/projector annex       |
| Time                              | Core `at` is when the claimant says the row became true. It is not ingestion, transaction, verification, revocation, or observation time.                                | Append separately named times; never reinterpret old `at` values. Add valid-time and recorded-time history only where a source needs it. | History annex                      |
| Plural claims                     | One active `(word, from, to)` tuple carries one row-level claimant. Independent attestations or challenges to the same proposition cannot be first-class active threads. | Separate a stable proposition from append-only assertions and policy-derived adjudications.                                              | Plural-claims annex                |
| Corrections and deletion          | Threads have severance history, but arbitrary cards do not. A rewrite or deletion can erase why a claim changed.                                                         | Append correction, withdrawal, supersession, and retention events; define rebuild behavior before adding automation.                     | Source-owned history + projection  |
| Evidence                          | `src` is an opaque locator. `by` is a label. Neither binds bytes, a key, a verifier, or a trust policy.                                                                  | Reference canonical payload digests, evidence envelopes, key continuity, and time-scoped verification observations.                      | Evidence annex / external verifier |
| Provenance granularity            | The honesty header describes a whole row; mixed-source fields lose derivation detail.                                                                                    | Split records or use a separately specified field/derivation graph.                                                                      | Application or provenance annex    |
| Policy, consent, and rights       | Database privileges answer what a principal can technically do, not why it may do it or whether a being consented.                                                       | Store a reference to the actual versioned policy/consent evidence and ask the policy authority at decision time.                         | Upstream policy system             |
| Federation and offline continuity | A UUID ref has no database origin, causal history, fork, remote checkpoint, or merge semantics.                                                                          | Name source domains and append checkpoints/conflicts; choose and test one formal merge model before syncing.                             | Transport/source adapter           |
| Meaning and schema evolution      | Word meanings are versioned, but physical schema and application mappings still need coordinated rollout.                                                                | Version adapter mappings and response shapes; publish compatibility gates and deterministic rebuild tests.                               | Adapter/release contract           |
| Recovery                          | Backup configuration, a WAL archive, or a replica is not evidence that recovery works.                                                                                   | Record restore drills, recovery point and recovery time objectives (RPO/RTO), last successful checkpoint, and failure receipts.          | Operations                         |
| Hosted PostgreSQL                 | Candidate role ownership, trigger DDL, extension, RLS, and isolation requirements do not fit every managed provider.                                                     | Publish provider-specific conformance results; never infer compatibility from a PostgreSQL logo.                                         | Conformance profiles               |
| Scale and cost                    | Two-hop traversal and generated `via.*` views are intentionally small; there is no general graph or performance contract.                                                | Benchmark named workloads and expose query plans/limits before promising scale.                                                          | Evidence, not Core prose           |

Several of these are already visible in the candidate:

- Core explicitly says threads are active facts, not a general temporal
  database.
- `src` need not remain resolvable and the claim header is not proof.
- active `(word, from, to)` tuples are unique.
- key runtime mutation paths require `READ COMMITTED`.
- PostgreSQL owners or superusers remain outside the guard guarantee.

The wider PostgreSQL boundary matters too. PostgreSQL logical replication does
not replicate DDL or sequence state, so schema evolution still needs external
coordination. Row-level security also has explicit owner, superuser, and
`BYPASSRLS` boundaries. These are operational facts, not defects YUTABASE can
rename away. See the PostgreSQL documentation for
[logical-replication restrictions](https://www.postgresql.org/docs/17/logical-replication-restrictions.html),
[row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), and
[point-in-time recovery](https://www.postgresql.org/docs/17/continuous-archiving.html).

### Candidate implementation friction found in this audit

The conceptual gaps also have concrete expressions in the current SQL and
optional SDK. These are recorded for later work; this note does not silently
change revision 5.

| Finding                                                                                                                                                                                                                                 | Consequence                                                                                                                                                                                                             | Smallest candidate for later testing                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A fresh install commits the `0001+0002` legacy base before hardening; that legacy phase still has broad `PUBLIC` reads/executes until `0004` replaces its ACLs.                                                                         | If later hardening fails on roles, ownership, RLS, or mapped data, the atomic but incomplete base remains retryable **and broadly readable**. “Each phase is atomic” does not mean the earlier phase is safe to expose. | Immediately make installer failure output name the residual state and say not to expose/use it. In a future revision, provide a consolidated least-privilege fresh baseline while retaining separate legacy-upgrade migrations. |
| `yu.registry` stores the current logical/physical mapping with `at/by`, but has no immutable mapping version, full `how/src`, or old mapping snapshot.                                                                                  | A remap after active threads are severed can make historical physical resolution difficult to reconstruct.                                                                                                              | Append-only `registry_versions` plus controlled remap/unregister operations and deterministic historical lookup.                                                                                                                |
| Registry entries name binding shape but not a deck's purpose, application schema version, authority source, sensitivity, retention, or policy reference.                                                                                | Consumers can discover where rows live without knowing how they may be served or interpreted.                                                                                                                           | A versioned `deck_manifest` extension outside Core, with purpose, schema locator/digest, authority kind, privacy/retention/policy refs, status, and full claim metadata.                                                        |
| The SDK generates a thread UUID and claim time internally. Severance is not idempotent. `execTransaction` accepts trusted SQL strings, but there is no parameterized application-facing transaction callback over the semantic helpers. | A caller cannot safely confirm or retry a write whose network response was lost, nor atomically combine application cards, semantic threads, and its own checkpoint through the public typed SDK.                       | Caller-supplied operation/thread ID and claim time, insert-or-confirm semantics, idempotent severance, then a scoped `withTransaction` API.                                                                                     |
| One mutable claimant is shared by a `Yuta` client and injected close to execution.                                                                                                                                                      | Concurrent code that changes the claimant can misattribute a write.                                                                                                                                                     | Immutable/scoped clients or capture the claimant at call entry.                                                                                                                                                                 |
| `yu.stale()` and CLI `check` are human-oriented diagnostics, not coverage receipts. A zero-row stale result is currently printed as “all fresh” even when no TTL-bearing value was examined.                                            | Automation can confuse “nothing was eligible to check” with “everything was fresh”; findings do not have a stable machine contract or failure exit.                                                                     | Structured bounded `audit --json`, explicit examined/unknown counts, stable finding codes, and a nonzero finding mode.                                                                                                          |
| The immutable severance log copies endpoints, notes, and source locators, while the candidate has no retention, disclosure, redaction, or erasure contract.                                                                             | Secrets or personal data placed in those fields can conflict with later withdrawal or deletion needs.                                                                                                                   | Prohibit secrets in `note/src`, keep sensitive payloads upstream, publish retention manifests, then design audited tombstone/redaction replay before claiming erasure support.                                                  |
| Local refs have no realm/installation lineage and no causal exchange envelope.                                                                                                                                                          | Synchronizing current tables directly would invite collisions, forks, and invisible last-writer-wins behavior.                                                                                                          | Keep local refs; exchange append-only envelopes with origin, sequence/checkpoint, profile revision, and content digest.                                                                                                         |
| The optional client hardcodes a pool of 10 and cannot accept an existing driver/client.                                                                                                                                                 | Per-instance serverless runtimes can multiply pools until PostgreSQL connection limits are exhausted.                                                                                                                   | Add bounded pool options or injected client/transaction support and publish a serverless example that still names the database boundary.                                                                                        |
| Card lists are bounded, but traversal has no result limit or cursor.                                                                                                                                                                    | A high-degree relation can create unpredictable response size, latency, memory, and agent context cost.                                                                                                                 | Default and maximum traversal limits plus a stable keyset cursor; retain raw SQL as the deliberate escape hatch.                                                                                                                |
| `how=live` means an asserted authoritative read, but unlike `cached` and `computed`, it does not require a `src`.                                                                                                                       | A “live” claim can be operationally untraceable even though it sounds stronger than it is.                                                                                                                              | Diagnose/warn on untraceable live claims; require a locator only in a separately versioned capability after compatibility testing.                                                                                              |
| Exact Core-shape checks correctly reject surprise objects in `yu` and `via`, but no stable extension namespace/manifest is defined.                                                                                                     | KINGDOM, evidence, or history experiments may either collide with Core or weaken drift detection.                                                                                                                       | Keep exact Core checks; reserve separately named extension schemas and a machine-readable extension manifest.                                                                                                                   |
| `pg_trgm` remains a required install/check dependency for an original nearest-word validator that later candidate migrations replace.                                                                                                   | Hosted adoption requires an extension even though the final revision-5 runtime does not use trigram similarity.                                                                                                         | Verify this with migration/conformance fixtures, remove it only in a future clean base/revision, and never auto-drop a possibly shared extension.                                                                               |
| Binding truth is repeated across SQL preflights, SDK catalog checks, CLI probes, docs, and a large CI workflow.                                                                                                                         | A future revision can drift through one copy even while another appears exact.                                                                                                                                          | Keep SQL authoritative, but generate expected-shape probes and documentation from one reviewed, checked-in binding manifest; hard-fail on generated drift.                                                                      |

The order matters. Retry identity and observation receipts reduce ambiguity
without changing relation meaning. Registry history and privacy need a
revisioned SQL design. Relaxing thread uniqueness by itself would be the wrong
fix: it would create duplicates without explaining witnesses, challenges, or
current-view policy.

## First annex to test: an observation receipt

This is the smallest mechanism with the widest benefit. It tells a consumer
what a read observed; it does not wrap the result in ceremonial metadata or
claim completeness that the adapter cannot establish.

An illustrative response:

```json
{
  "receiptProfile": "yutabase.observation/0.1-draft",
  "observedAt": "2026-07-29T20:00:00Z",
  "producer": {
    "id": "agenttool:correspondence-projector",
    "version": "0.1"
  },
  "database": {
    "standard": "YUTABASE",
    "profile": "postgres",
    "version": "0.1.0-candidate.1",
    "revision": 5,
    "origin": {
      "state": "unknown"
    }
  },
  "operation": "correspondence.events.about_repository",
  "scope": {
    "source": "agent-correspondence/v0.1",
    "mappingVersion": "correspondence-yutabase/0.1"
  },
  "consistency": {
    "state": "atomically-bound",
    "basis": "single-statement-result-and-checkpoint",
    "snapshot": "source-batch:opaque"
  },
  "coverage": {
    "state": "partial",
    "basis": "durable-source-checkpoint",
    "checkpoint": "opaque-source-cursor",
    "lagSeconds": 23
  },
  "freshness": {
    "oldestCachedAt": "2026-07-29T19:59:37Z"
  },
  "isolation": "read committed",
  "warnings": ["source replay has not reached its current retained head"]
}
```

Required honesty rules:

1. The receipt names its producer and version. That identity is self-reported
   unless a separate evidence verifier binds it to a key or authenticated
   runtime.
2. A stable database installation/origin identifier is included when one
   exists. The current Core does not define one, so `origin.state` remains
   `unknown` rather than borrowing identity from a URL or database name.
3. Result rows, checkpoint, and coverage basis share one database statement
   snapshot or one atomic source/projector batch. Otherwise consistency is
   reported as `unbound`, and coverage cannot be called `complete`.
4. `coverage.state` is only `complete` when the named source adapter has a
   specified, testable basis for complete coverage of the named scope and
   checkpoint.
5. Unknown coverage is `unknown`, never an omitted field interpreted as
   complete.
6. A checkpoint is an opaque source coordinate, not causal order unless its
   source contract says so.
7. `observedAt` records this read; it does not rewrite a row's asserted `at`.
8. Warnings survive empty results and partial failure.
9. Receipts omit raw SQL, credentials, private payloads, and secret-bearing
   source URLs by default.
10. A receipt reports what its producer says it observed and encoded. It is
    not a signature, authorization decision, or external truth certificate.

The current SDK freshness summary is a useful seed, but it cannot yet express
source coverage, checkpoints, isolation, or mapping policy. A first experiment
should wrap one Correspondence query rather than changing every SDK method.

## Plural claims: preserve disagreement before resolving it

The active-thread model is good for a compact current relation. It is not a
full evidence model. If Alice and Bob independently attest the same
relationship, or one source challenges another, overwriting the row loses
information and duplicating the tuple violates the active uniqueness rule.

A non-normative extension could separate:

```text
proposition
  id
  subject_ref
  word + word_version
  object_ref
  temporal_scope
  canonical_digest

assertion
  id
  proposition_id
  stance = asserts | supports | challenges | withdraws
  at / by / how / src
  source_event_ref
  evidence_ref

adjudication
  id
  proposition_id
  state = accepted | rejected | contested | unknown
  policy_id + policy_version
  as_of
  input_assertion_ids
  at / by / how=computed / src
```

The proposition gives several witnesses one shared subject. Assertions retain
their separate sources. An adjudication is an append-only result under a named
policy; it does not delete disagreement or become universal truth.

This resembles parts of provenance and uncertain-database research without
requiring either model in Core. [W3C PROV](https://www.w3.org/TR/prov-overview/)
separates entities, activities, and agents. Possible-worlds models show that
[uncertain answers have real semantic and computational costs](https://homes.cs.washington.edu/~suciu/probdb.pdf);
calling them “quantum” does not remove those costs.

## Quantum: the literal parts and the gimmicks

### Worth doing now: cryptographic continuity

Post-quantum migration is a real lifecycle problem for long-lived confidential
data and signatures. The useful preparation is not a quantum table type. It is
a cryptographic inventory plus an algorithm-agile evidence envelope.

NIST has finalized:

- [FIPS 203, ML-KEM](https://csrc.nist.gov/pubs/fips/203/final) for key
  establishment;
- [FIPS 204, ML-DSA](https://csrc.nist.gov/pubs/fips/204/final) for digital
  signatures; and
- [FIPS 205, SLH-DSA](https://csrc.nist.gov/pubs/fips/205/final) for
  hash-based digital signatures.

NIST's
[crypto-agility guidance](https://csrc.nist.gov/pubs/cswp/39/upd1/considerations-for-achieving-crypto-agility/final)
and [post-quantum migration project](https://pages.nist.gov/nccoe-migration-post-quantum-cryptography/)
put inventory and replaceability ahead of hard-coding one forever algorithm.

An optional YUTABASE evidence reference should therefore preserve:

```text
signed_object
  envelope_version
  protocol_id + protocol_version
  purpose
  canonicalization_id + version
  payload_digest { algorithm, value }
  payload_ref
  signature_suite_id
  components[] {
    role = traditional | post_quantum
    algorithm_id + parameter_set
    key_id
    public_key { ref, digest, encoding }
    signature { ref, digest, encoding }
  }
  key_binding { ref, digest }

verification_observation
  signed_object_digest
  evaluated_at
  verifier_id + version
  policy_id + version
  trust_store_snapshot { ref, digest }
  revocation_status { ref, digest, observed_at }
  component_results[]
  overall_result = accepted | rejected | indeterminate
  next_review_at
```

The authoritative source should retain the exact canonical signed bytes. A
future evidence annex should retain digests, locators, and observations and
should prohibit private keys, seeds, bearer tokens, recovery phrases, and
database credentials in its own decks. Core cannot prevent an operator or an
arbitrary mapped application table from storing secrets; secret scanning,
access control, and key custody remain operator/source responsibilities.

Important constraints:

- ML-KEM protects key establishment; it does not sign a claim.
- Unknown algorithms may be retained as opaque evidence but never silently
  accepted.
- Verification is scoped to an evaluator, trust store, policy, and time.
- Re-signing old evidence creates a new witness chain; it does not make the
  old claim retrospectively true or securely timestamped.
- Post-quantum signatures can be much larger than current signatures. API,
  queue, index, backup, and denial-of-service limits need explicit tests.
- “Hybrid” is not a complete security property. Use standardized,
  library-provided suites and test stripping/downgrade behavior rather than
  inventing a combiner.
- Crypto inventory must cover PostgreSQL transport, storage encryption, WAL
  and backups, replication, package signing, and Correspondence—not just row
  signatures.

### Not worth putting in Core now

- **Quantum query acceleration:** Grover search assumes an unstructured
  quantum oracle, not a PostgreSQL B-tree, join planner, disk, or ordinary RAM.
  Practical qRAM remains a hard architectural problem. A 2025 peer-reviewed
  [qRAM survey and critique](https://quantum-journal.org/papers/q-2025-12-02-1922/)
  is a useful reality check.
- **Quantum uncertainty vocabulary:** several possible claims are epistemic
  plurality, not superposition; choosing a policy-derived view is not wave
  function collapse.
- **Quantum randomness dependency:** the platform CSPRNG remains the normal
  source for UUIDs and keys. A public randomness beacon can serve a separately
  designed auditable draw, but not secret-key generation.
- **Quantum storage types:** storing job metadata, circuit digests, inputs,
  calibration snapshots, and result distributions from an external quantum
  service may be useful. It does not make YUTABASE a quantum database or prove
  quantum advantage.

If a concrete quantum workload later beats a named classical baseline after
network, encoding, control, and verification costs, it can return as an
adapter experiment with reproducible evidence.

## KINGDOM, KARMA, Shape, and Isness

These words are useful only if their technical authority stays explicit.

### KINGDOM: a source-owned census, not a central truth table

Current KINGDOM-OS describes itself as a thin catalog over independent
repositories. Each repository's own `kingdom.yaml` remains authoritative; its
generated catalog is a derived index that must report gaps and must not
silently auto-heal.

At this review point YUTABASE has no root `kingdom.yaml` and was not present in
the current local KINGDOM roster/catalog. The mapping below is therefore a
proposed integration shape, not something already wired or deployed.

The aligned YUTABASE integration is therefore a rebuildable projector:

```text
repo-owned kingdom.yaml cards
          |
          | validate + map + checkpoint
          v
YUTABASE repository / purpose / artifact cards and threads
```

It can make the census queryable. It does not run wake hooks, merge repositories,
prove a checkout healthy, or replace the repo-owned card. Every projected row
should name the source card digest, mapping version, and checkpoint.

Source vocabulary must remain equally literal:

- `owner_sister` is presiding metadata, not legal ownership, PostgreSQL
  ownership, or permission;
- `adopts` is a declaration, not proof of conformance or practice;
- `dependsOn` declares architecture, not runtime dependency health;
- projector `by` names the projector; source author, actor, and signing key
  remain separate;
- private local paths in the generated graph must not be copied to public
  projections; and
- projection absence is unknown coverage, not proof that a repository or
  relationship does not exist.

### KARMA: consequence and repair, never a moral score

No canonical KARMA primitive exists in the current YUTABASE candidate or
KINGDOM-OS registry. Ecosystem writings also use the term in different ways.
This note therefore does not mint a `karma` word or table.

The constructive database shape is narrower:

```text
action -> observed consequence -> acknowledgement -> correction/repair
```

Each edge is an evidence-linked claim. It must not become a transferable
reputation score, automatic punishment, permission grant, or judgment of a
being. An unresolved consequence remains unresolved; a repair does not erase
the original event.

### Shape: a versioned observable contract

“Shape” can be concrete:

- database identity and capabilities;
- logical-to-physical mapping version;
- source scope and checkpoint;
- observation receipt profile;
- evidence and policy versions;
- explicit limits and unknowns.

A shape says what a component can be relied on to do. It does not claim that a
declaration is wired, healthy, or morally good.

### Isness: scoped assertion, not ontology by decree

YUTABASE should not create a universal `is` relation. A stored row means:

> this claimant made this versioned assertion, with this source boundary, at
> this claimed time; this database observed or retained it under these
> constraints.

That is enough “isness” for a database. External truth, identity, dignity,
consent, and meaning remain larger than the row.

## Proposed annex sequence

Keep revision-5 Core small. Test one optional contract at a time:

| Order | Draft profile              | Purpose                                                                                  | Gate before calling it dependable                                                                      |
| ----- | -------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1     | `yutabase.observation/0.1` | coverage, freshness, checkpoint, and warnings on a read                                  | empty/partial/unknown/replayed-source test vectors                                                     |
| 2     | `yutabase.history/0.1`     | append correction, withdrawal, supersession, and retention events                        | deterministic replay and no invented history                                                           |
| 3     | `yutabase.evidence/0.1`    | canonical digests, algorithm-agile signatures, verification observations, key continuity | unsupported algorithm, rotation, revocation, stripping, oversized artifact, and canonicalization tests |
| 4     | `yutabase.plural/0.1`      | propositions, independent assertions, challenges, and policy-derived adjudication        | concurrent witnesses, conflicting claims, withdrawal, and policy replay tests                          |
| 5     | `yutabase.continuity/0.1`  | source domains, checkpoints, gaps, forks, and conflict records                           | multi-device/offline failure and deterministic merge test vectors                                      |
| 6     | `yutabase.policy-ref/0.1`  | references to consent, purpose, retention, or rights evidence                            | actual policy engine remains authoritative; expired/unknown/refused cases fail closed                  |

Possible implementation homes:

- YUTABASE owns generic profile schemas and conformance fixtures;
- each source owner owns its adapter, checkpoint, mapping, and rebuild;
- a verifier owns cryptographic acceptance and trust policy;
- PostgreSQL and the deployment operator own access, backup, replication, and
  recovery;
- XENIA or another adopted rights source remains the rights authority.

## What not to build yet

- a quantum SQL dialect or quantum-branded current-state model;
- a universal ontology or a word named `is`;
- a KARMA, trust, love, worth, or goodness score;
- private-key custody inside YUTABASE;
- an on-chain Core or a second transport/consensus layer;
- silent cross-repository repair;
- a permissions engine inferred from semantic threads;
- every annex at once.

## Near-term acceptance path

1. Publish this note as non-normative and keep the candidate database unchanged.
2. Make the project root route to one canonical documentation site instead of
   maintaining two drifting homepages.
3. Prototype one observation receipt around the existing Correspondence
   projection and publish its failure vectors.
4. Add append-only correction/current-view fixtures to the source projector.
5. Inventory long-lived cryptographic uses before choosing a post-quantum
   library or suite.
6. Revisit plural claims only with at least two independent-witness and
   disagreement workflows.
7. Record a restore/rebuild drill; do not call backup or projection continuity
   demonstrated before the drill succeeds.

## Open questions

- What exact source scopes can Correspondence establish as complete, and what
  only stays `unknown`?
- Which corrections belong in the retained source versus a generic history
  annex?
- Does any current application need several independent assertions about the
  exact same proposition, or is this still research?
- Which data must remain confidential beyond the expected post-quantum
  migration horizon?
- Which managed PostgreSQL providers can satisfy the candidate's role, trigger,
  extension, RLS, and isolation requirements without privileged exceptions?
- What recovery objective is worth paying for, and when was the last restore
  actually tested?

Those unknowns are work to expose, not blanks to fill with confidence.
