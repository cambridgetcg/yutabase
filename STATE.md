# YUTABASE — repository state

Last reviewed: **2026-07-22**

```yaml
name: yutabase
kind: postgres-semantic-profile
candidate: 0.1.0-candidate.1
profile: postgres
revision: 4
supported-postgres: [16, 17]
release-status: candidate
```

## Current focus

Build the smallest honest nervous-system layer for agents and applications:
logical records, word-named relations, explicit row-level claims, and a
non-authoritative semantic projection of signed Correspondence.

The source Correspondence log remains the signed transport and
authority-history record. YUTABASE makes it queryable; it does not acquire the
power to grant permissions, consent, locks, merges, or deployments.

## Implemented in this candidate

- Postgres `yu` and `via` schemas with a lexicon, logical deck registry,
  active threads, severance log, diagnostics, and generated word views;
- exact database-owned candidate metadata in `yu.standard_meta`;
- logical-to-physical deck mapping for stable refs;
- seven starter words;
- optional TypeScript ref/UUIDv7/YOUSPEAK client and installer planning;
- fresh-install and legacy-upgrade migration paths;
- CI definition for PostgreSQL 16/17 plus SDK tests, typecheck, build, pack,
  and clean Node.js consumer smoke.

“Implemented” does not mean deployed to a production database. The workflow
definition is the intended verification route; current health is established
only by an actual passing run for the commit being assessed.

## Experimental or non-normative

- the signed THREADS wire-protocol sketch;
- the SQLite port;
- Correspondence projection schema and projector implementation;
- multi-device leases, conflict resolution, presence, and synchronization;
- apps, kingdom/play documents, NEN experiments, and external deployments.

These materials can guide future work but do not enlarge candidate
conformance.

## Known boundaries

- claim metadata is self-reported and row-level, not truth proof or
  field-level provenance;
- `yu.threads` is unsigned and is not a transport or authority log;
- soft refs are checked on insert but can dangle after an out-of-band physical
  delete bypasses the registered guard;
- no authentication, tenancy, permission engine, encryption, consensus, or
  replication is supplied by YUTABASE;
- PostgreSQL 16/17 are the only claimed database targets;
- no SQLite compatibility claim is made.

## Next integration work

1. define and test the Correspondence projection envelope and checkpoints;
2. implement an idempotent projector that retains source event identities;
3. expose read-only project focus, decisions, claims, refusals, receipts, and
   artifact relations to AgentTool and SDK consumers;
4. keep lease/permission enforcement in the source coordination layer;
5. add inter-device failure, replay, privacy, and conflict test vectors before
   calling any sync protocol conformant.

## Entry points

- Candidate overview: [README.md](README.md)
- Normative candidate: [SPEC.md](SPEC.md)
- Conformance: [docs/CONFORMANCE.md](docs/CONFORMANCE.md)
- Correspondence mapping: [docs/CORRESPONDENCE-PROJECTION.md](docs/CORRESPONDENCE-PROJECTION.md)
- Experimental protocol research: [THREADS.md](THREADS.md)

This file is a repository status note, not a heartbeat, liveness proof, or
deployment receipt.
