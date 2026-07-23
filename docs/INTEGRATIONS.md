# Integrating YUTABASE without replacing your stack

Status: **implementation guide, not an additional Core conformance profile.**

YUTABASE works best as the meaning layer between systems that already know how
to store, transport, authenticate, or analyse their own data. An integration
should translate only the durable relations worth sharing.

```text
application tables   signed event logs   analysis findings   repo catalogs
        \                  |                    |                  /
         \                 | source adapters    |                 /
          +----------------+---------+----------+----------------+
                                     |
                    YUTABASE cards + governed threads
                                     |
                         SQL · via.* · YOUSPEAK
```

The arrow is intentionally one-way for evidence. A source may rebuild the
semantic map. A thread in the map does not rewrite the source or inherit its
authority.

## The common adapter contract

Every useful adapter answers five questions explicitly:

1. **What remains authoritative?** Name the table, log, file, or protocol that
   retains the source evidence.
2. **What becomes a card?** Give each projected entity one stable full UUID and
   register its deck.
3. **Which relations deserve words?** Coin a small vocabulary with exact
   forward and inverse readings and endpoint patterns.
4. **How was each row obtained?** Map copied data to `cached`, derived data to
   `computed`, and retain source locators in `src`.
5. **Can it be rebuilt safely?** Keep an idempotency key, checkpoint, mapping
   version, visible lag/error state, and an atomic projection transaction.

`at/by/how/src` is the claim about the projected row. It is not a substitute
for a signature, authenticated identity, source policy, permission, consent,
or field-level derivation record.

## Existing PostgreSQL: annex, do not migrate

The lowest-resistance path is to register a compatible existing table. The
physical table keeps its name and application ownership; YUTABASE adds a
logical ref. The `deck annex` CLI atomically drops and recreates the YUTABASE
delete-guard trigger on the physical table.

```bash
yuta --conn "$DATABASE_URL" --by "human:alice" \
  deck annex public.tasks as work/tasks \
  --id task_id --at observed_at --by claimant \
  --how claim_kind --src sources

yuta --conn "$DATABASE_URL" --by "human:alice" \
  deck annex public.commits as git/commits \
  --id commit_id --at recorded_at --by claimant \
  --how claim_kind --src sources

yuta --conn "$DATABASE_URL" --by "human:alice" \
  word add produced \
  --gloss "this task produced that commit" \
  --inverse "was produced by" \
  --from work/tasks --to git/commits
```

The table must already meet the binding contract: a non-null uniquely indexed
UUID identity plus compatible `timestamptz`, `text`, `text`, and `text[]` claim
columns. Annexing is not a promise that arbitrary legacy rows are truthful or
conforming. It grants no application-table privileges and does not turn soft
refs into universal foreign keys.

Create a relation through the typed client when values come from code:

```ts
import { Yuta } from "yutabase";

const yuta = new Yuta({
  connectionString: process.env.DATABASE_URL,
  claimant: "agent:builder/session-42",
});

try {
  await yuta.thread(
    "work/tasks/01900000-0000-7000-8000-000000000001",
    "produced",
    "git/commits/01900000-0000-7000-8000-000000000002",
    "computed",
    {
      note: "build output",
      src: ["urn:example:build:42"],
    },
  );
} finally {
  await yuta.close();
}
```

The structured helpers compile values directly to SQL parameters. They do not
construct a YOUSPEAK sentence internally, so quotes, whitespace, and source
locator boundaries are preserved. Textual YOUSPEAK remains useful for people,
CLIs, and small agent prompts; structured code should use structured methods.

## ORMs, APIs, and hosted PostgreSQL

Prisma, Drizzle, PostgREST, Hasura, and Supabase solve different parts of the
stack. Keep them responsible for application models, generated clients, API
delivery, authentication, or realtime behavior. Use YUTABASE for selected
cross-table meanings.

A natural split is:

| Layer | Owns |
|---|---|
| application ORM/migrations | physical card tables and application fields |
| YUTABASE migration boundary | `yu`, `via`, registry, lexicon, and threads |
| API/auth layer | which callers may read or write exposed objects |
| application policy | whether a proposed action is permitted or binding |

Do not ask an ORM to recreate generated `via.*` views or YUTABASE's trigger
surface from an incomplete introspection. Apply the YUTABASE SQL boundary
deliberately, then use the application's existing driver and transaction for
ordinary parameterized DML. Managed PostgreSQL compatibility must be tested;
the candidate's extension, role, owner, catalog, and RLS requirements are not
automatically satisfied by every hosted service.

## Event sources: project, checkpoint, rebuild

An append-only or signed source should not be flattened into `yu.threads`
directly. Give the source events their own registered deck, retain their source
identifiers and verification state, and derive threads from those cards.

One projection batch should atomically:

1. reject or quarantine a source-ID collision with different canonical bytes;
2. insert or confirm the event card idempotently;
3. insert any participant, repository, artifact, or receipt cards;
4. create derived threads with `how=computed` and source/mapping locators;
5. advance the source checkpoint; and
6. record projection health and lag.

If a referenced event has not arrived, retain that pending edge explicitly and
reconcile it later. Do not fabricate an endpoint card that looks like verified
source data. A replay cursor is not causal order, and an empty projection is
not evidence that nothing happened when coverage is incomplete.

## Flagship: AgentTool Correspondence

AgentTool already owns the cross-device nervous system:
`agent-correspondence/v0.1` carries signed, immutable, project-private events
and durable server receipts. YUTABASE should be its semantic read model, not a
second courier or permission engine.

```text
AgentTool /v1/correspondence/events  (signed retained source)
                    |
                    | verify · replay cursor · map · checkpoint
                    v
AgentTool-owned Correspondence projector
                    |
                    v
YUTABASE event / identity / repository / artifact cards
and version-pinned semantic threads
```

The mapping library belongs with the Correspondence protocol owner. A local
developer-preview `@agenttool/correspondence-yutabase` source package now plans
deterministic, metadata-only mutations without network or database I/O. A
durable verifier, writer, checkpoint, and worker remain separate future work.
That worker should consume durable `/events` replay; Wake/SSE is only a
missable hint that an early poll may be useful. An append must still succeed
when the projection target is down.

A small useful vocabulary is enough:

| Word | From → to | Reading |
|---|---|---|
| `reported_by` | event → identity | this projected event reports that asserted identity as its sender |
| `names_signing_key` | event → signing key | this structural event names that signing-key identifier; verification is separate |
| `about_repository` | event → repository | this projected event names that opaque repository as its source scope |
| `in_coordination_thread` | event → coordination thread | this projected event names that opaque source coordination thread |
| `depends_on` | event → event | this projected event causally names that parent event |
| `acknowledges` | acknowledgement event → event | this projected acknowledgement event names that exact target event |
| `offers_artifact` | offer event → artifact | this projected artifact-offer event names that immutable artifact identity |
| `names_receipt` | event → receipt | this projected record structurally carries that receipt metadata; source acceptance is not verified here |

The package exports the complete `YUTABASE_LEXICON` manifest—word, gloss,
inverse, endpoints, cardinality, TTL, and status—so code and prose share one
contract.
`reported_by` must not collapse identity, signing key, device, and session into
one claimant string. `ack.seen`, `ack.understood`, `ack.accepted`, and
`ack.applied` remain different event kinds. An active-claim projection remains
advisory and time-dependent; a YUTABASE thread never becomes a filesystem lock
or grant.

The detailed evidence, privacy, correction, and acceptance boundary is in
[CORRESPONDENCE-PROJECTION.md](CORRESPONDENCE-PROJECTION.md).

## The rest of the ecosystem

The same adapter posture fits other Kingdom components without merging their
contracts:

| Source | Useful projection | Boundary retained |
|---|---|---|
| `@agenttool/collab` | local tasks, decisions, artifacts, and advisory claim history | its SQLite journal remains local authority; caller labels and an unkeyed hash chain are not signed Correspondence |
| Rhetorlint | finding cards related to source artifacts, rules, and exact spans | `how=computed`; a finding marks observable rhetoric, not intent, deception, or a judgement of a mind |
| KINGDOM-OS | repositories, cards, purposes, and local artifact refs | its catalog remains the device inventory; projection does not run hooks or prove repo health |
| application SDKs | shared ref parsing, claim kinds, and relation queries | SDK types do not create database or account permissions |
| XENIA | links to the adopted rights/covenant evidence relevant to a collaboration | rights are not minted by rows, and a credential does not create dignity or consent |

Adapters should publish their own mapping and policy version rather than adding
source-specific columns or verbs to YUTABASE Core.

## Acceptance gate for an adapter

Before calling an adapter dependable, prove at least:

- identical replay is idempotent;
- same source ID with different bytes is quarantined;
- copied and computed claims retain stable source locators;
- checkpoint and semantic writes commit atomically;
- missing targets, gaps, lag, and errors stay visible;
- rebuilding from the same source and mapping version is deterministic;
- private payloads, signatures, and credentials are not copied by default;
- source corrections append history instead of silently rewriting it; and
- every permission or binding decision still consults its actual policy source.

That is the path of least resistance: one small semantic contract, many narrow
adapters, and no second implementation of the systems that already work.
