# YUTABASE candidate conformance

This document defines the executable boundary for YUTABASE
`0.1.0-candidate.1`, Postgres profile revision `5`. It is normative for the
candidate. Passing these checks means compatibility with this revision; it
does not turn the candidate into a finished standard or certify an operator's
security.

## Conformance classes

| Class | Requirement |
|---|---|
| Core model | implements the primitives and semantics in `SPEC.md` sections 2–6 without contradicting their claim or authority boundaries |
| Postgres profile | passes all Core requirements plus the PostgreSQL installation, upgrade, metadata, SQL lifecycle, and preservation checks below |
| YOUSPEAK client | optional; passes compiler/client/install-planning tests against a conforming Postgres profile |

The repository release target is the **Postgres profile**. There is no
standalone Core certification program in this candidate. SQLite, THREADS, and
Correspondence projection documents do not currently define conformance
classes.

## Supported environment

A Postgres-profile conformance claim applies only to PostgreSQL **16** and
**17**, with `pg_trgm` available and with enough database privilege to run the
migrations. A successful run on another major is useful evidence but is not a
claim made by this candidate.

The optional SDK package declares Node.js `>=20`. Development and candidate CI
are pinned to Bun `1.3.5`; that CI result covers the runtime actually used by
the workflow rather than every compatible Node.js release.

## Exact database identity

After a fresh install or supported upgrade, exactly one `yu.standard_meta` row
MUST report:

| Field | Required value |
|---|---|
| `standard` | `YUTABASE` |
| `profile` | `postgres` |
| `version` | `0.1.0-candidate.1` |
| `revision` | `5` |

`capabilities` MUST equal this ordered array:

```text
row-claims
logical-physical-registry
word-version-pinning
global-thread-id-ledger
endpoint-existence-on-insert
concurrency-safe-to-one
role-scoped-functions
guarded-card-identity
nonblank-source-locators
```

`installed_at` and `upgraded_at` MUST be non-null timestamps with
`upgraded_at >= installed_at` for a fresh install. Upgrade semantics may
preserve an earlier installation time when it can be known honestly.

Clients MUST use the database row as the compatibility gate. These states are
distinct:

| State | Client behavior |
|---|---|
| neither `yu` nor `via` namespace exists | plan a fresh install |
| complete original v0.1 core, no candidate-hardening objects | plan `0004`, then `0005` |
| exact candidate revision 4 | plan the known `0005` integrity upgrade |
| exact revision-5 identity and complete observable binding shape | use the current candidate |
| partial hardening, missing core objects, unknown identity, or newer revision | refuse and require explicit operator handling |

The presence of `yu.standard_meta` is not enough if its identity is unknown.
The absence of metadata is not enough to call a partly installed database
legacy-compatible.

## Fresh-install test

Against an empty database, the runner MUST apply the first two files together
with `ON_ERROR_STOP` in one atomic transaction, then apply each hardening file
with `ON_ERROR_STOP` in its own new transaction:

```text
phase 1: sql/0001_yu_core.sql + sql/0002_starter_lexicon.sql
phase 2: sql/0004_candidate_hardening.sql
phase 3: sql/0005_candidate_integrity.sql
```

It MUST then hard-fail unless all of the following hold:

- the exact singleton identity above exists;
- `yu.registry` exposes separate `physical_schema` and `physical_table`
  mapping columns;
- all seven starter words exist;
- the SQL lifecycle fixture completes;
- each word has an immutable full semantic snapshot and each new thread pins
  the word version used at insertion;
- unknown words, endpoint mismatches, `to_one` violations, card deletion,
  mapped-UUID change, or deck `TRUNCATE` across the maintained guard pair,
  cached/computed claims without `src`, and null/blank `src` entries are
  refused;
- endpoint UUIDs missing from mapped physical tables are refused on insert;
- registered card identity columns are non-null UUIDs with a valid one-column
  unique key;
- registered physical decks are standalone permanent ordinary tables, not
  traditional-inheritance parents/children, partitioned, temporary/unlogged
  relations, or view/foreign/sequence lookalikes;
- a physical-table or identity-column registry remap with any active logical
  endpoint is refused without changing the old mapping, even when the same
  UUID exists at the proposed target; a remap is allowed after those threads
  are severed;
- registry remaps serialize with concurrent thread inserts, so either ordering
  preserves endpoint existence under the committed mapping;
- the mandatory physical row guard serializes delete and mapped-UUID changes
  with concurrent thread inserts, so either the identity change or the
  relation survives, never a dangling pair;
- the mandatory statement guard refuses `TRUNCATE` while a live thread names
  the deck and serializes truncation with concurrent thread inserts in both
  orderings;
- concurrent inserts cannot bypass a `to_one` word;
- narrowing a word to `to_one` refuses pre-existing duplicate sources, and an
  older false-pinned row still prevents a new one-to-one row for that source;
- thread creation, mapped-card deletion or UUID change, deck `TRUNCATE`,
  registry guard lifecycle mutation, and false-to-true `to_one` narrowing
  refuse non-`READ COMMITTED` runtime transactions; an update that preserves
  the mapped UUID remains allowed;
- the lexicographer cannot append compatibility history directly, and the
  reader role cannot inspect application decks without separate deck grants;
- a lexicon spelling is not rejected solely by a normative blocklist;
- word-generated views and physical schema/table mappings reject identifiers
  over PostgreSQL's 63-byte limit rather than accepting truncated aliases;
- physical endpoint checks run with the inserting role's explicit deck grants while
  remap checks use the lexicographer's proposed-deck grants and global
  semantic, registry, and cardinality checks remain serialized and cannot be
  made blind by capability-role RLS visibility;
- migration backfills and global `SECURITY DEFINER` invariant paths set
  `row_security=off`, so applicable `FORCE ROW LEVEL SECURITY` either runs as
  a superuser/`BYPASSRLS` role and exposes every required row, or hard-fails
  rather than validating a policy-filtered subset;
- the four capability roles own no database/YUTABASE objects, their internal
  direct membership hierarchy and schema/relation/column/function ACLs match
  the exact candidate whitelist, and the appender can insert a valid immutable
  thread but cannot sever or mutate it; external role memberships remain an
  operator-reviewed cluster policy;
- a thread UUID remains reserved after severance and cannot be reused;
- severance removes the active thread and preserves its pinned meaning,
  original relation claim, and distinct severance claim;
- generated `via.*` views support forward and reverse logical refs, and a
  post-migration word refresh under hostile global/schema table defaults
  removes every arbitrary non-owner relation/column ACL before restoring the
  exact reader-only direct surface;
- prior gloss/inverse text is recorded when either is changed.

`sql/0003_test_lifecycle.sql` is a destructive fixture and MUST run only in an
isolated test database. A printed success message is not sufficient: every
negative check must raise an error if its expected rejection or acceptance did
not occur.

The operator MUST run hardening with a role able to see every required row,
often a superuser or a role with `BYPASSRLS`. The fail-closed RLS behavior above
is not an access-control, tenancy, or isolation guarantee.

## Upgrade-preservation test

Against a separate empty database, the runner MUST:

1. apply `0001` and `0002` under a legacy owner role;
2. create and register at least two decks;
3. add endpoint cards and at least one valid thread;
4. record the thread identifier and relevant row counts;
5. apply `0004_candidate_hardening.sql`, then
   `0005_candidate_integrity.sql`, each as its own transaction under a
   different ownership-equivalent or superuser migration role;
6. assert the exact revision-5 identity, capabilities, physical mapping
   defaults, and canonical row-plus-`TRUNCATE` guard pairs;
7. assert the pre-existing thread, lexicon rows, registry rows, and severance
   history remain intact;
8. assert legacy word/thread versions use migration-time snapshots and that
   unavailable original relation-claim columns on old sever rows remain null
   rather than being fabricated.
9. assert candidate function/view ownership is normalized, `via.*` reads work
   as `yu_reader`, thread-creation roles use explicit deck grants, and guarded
   deletes, mapped-UUID changes, and truncates remain enforced after the
   cross-owner upgrade.

A second preservation path MUST begin from an exact revision-4 candidate with
existing mappings, cards, threads, lexicon rows, and at least one legacy
DELETE-only canonical guard. Applying only `0005` MUST preserve that state,
upgrade it to the exact revision-5 row guard, add the exact `AFTER TRUNCATE`
statement guard, reject invalid existing source locators without stamping
revision 5, and leave revision 4 intact on any failure.

Separate negative upgrades MUST refuse non-permanent or inherited core tables;
altered or unexpected columns, nullability, collations, defaults, identity
sequence options, constraints, indexes, user triggers, or rewrite rules on the
legacy core; active threads outside their word's current endpoint patterns;
and any run whose
applicable `FORCE ROW LEVEL SECURITY` policy would hide backfill rows.
Hardening MUST also reject a caller that established an incompatible snapshot
before the migration. A `REPEATABLE READ` invocation with no prior query MUST
switch to `READ COMMITTED`; if a concurrent legacy writer commits while the
core lock is pending, its row MUST receive every required backfill and generated
view before revision `4` is stamped. Revision 5 must likewise refuse an
incompatible or partial revision-4 prestate before changing its identity.

The upgrade MUST NOT silently reinterpret logical refs, delete existing
threads, fabricate pre-migration semantic history, or infer an unknown partial
install. Operators still need a backup and rehearsal; passing this fixture is
not a guarantee for every application schema or extension.

## Optional SDK checks

From `packages/sdk-ts/`, candidate CI runs:

```bash
bun install --frozen-lockfile
YUTABASE_INTEGRATION_TEST=1 \
  DATABASE_URL='<fresh disposable migrated database>' \
  bun run test:integration
bun run ci
```

`bun run ci` runs typechecking, unit tests, a real build, and a clean package
consumer smoke test. The packed artifact MUST expose its declared JavaScript,
declarations, CLI entry point, and `0001/0002/0004/0005` SQL assets. A clean
Node.js 20 consumer MUST be able to install it, import the public package
exports, and run the installed `yuta --help`. Tests MUST cover at least:

- strict full-UUID logical ref parsing and identifier rejection;
- UUIDv7 generation;
- parameterized YOUSPEAK compilation and its six command families plus the
  `explain` wrapper;
- a 100-row default/1000-row maximum for card lists and registry resolution of
  logical book/deck labels longer than physical PostgreSQL identifiers;
- rejection of unrecognized Core verbs;
- database-owned candidate metadata reads;
- fresh/current/legacy/revision-4/partial install planning;
- separate fresh installation phases (`0001+0002`, then fresh `0004`, then
  fresh `0005` transactions); and
- refusal of observable current-binding column/default/index/constraint,
  identity-sequence, storage, foreign-key, trigger, function,
  capability-inheritance, and generated-view definition drift, including
  policy-filtered global catalog checks;
- physical registry mapping during card access;
- one-operation transaction/row-lock pinning between registry lookup and
  physical card access;
- an integration lifecycle against the migrated candidate database.

An SDK failure does not corrupt the durable SQL model, but a release carrying
the SDK is not green while these checks fail.

## Compatibility policy

Candidate identity uses all four coordinates: standard, profile, version, and
revision. Equality is the only implicit compatibility rule in this release.
Capabilities can narrow behavior but cannot make an unknown identity safe by
themselves.

The original unversioned v0.1 shape has one explicit upgrade path. No promise
is made for arbitrary forks, reordered migrations, hand-edited system tables,
or downgrade from a later revision. A future candidate must provide a new
migration and preservation fixture rather than silently changing an existing
revision.

## Threat and non-guarantee boundary

Conformance checks syntax and the tested database semantics. It does not
certify:

- claimant identity, truth, source authority, consent, or field-level
  provenance;
- endpoint existence after a table owner or superuser bypasses the maintained
  card guard pair;
- access-control policy, tenant isolation, or safe grants;
- cryptographic signatures, key custody, replay protection, transport, or
  cross-device synchronization;
- resistance to a malicious database owner, superuser, migration, dependency,
  or CI runner;
- backup restoration, disaster recovery, availability, performance, or
  production operations;
- any external AgentTool, IPFS, Cloudflare, GitHub, or sister service.

`yu.standard_meta.capabilities` describes installed behavior. It does not grant
permissions. A passing heartbeat or HTTP response is not a conformance result;
the candidate workflow must pass for the exact commit being evaluated.

## Evidence

The repository's candidate-conformance GitHub Actions workflow is the
executable reference. A release claim should link to a completed run for the
release commit and retain its PostgreSQL 16 and 17 job results. Local results
are useful during development but should state the exact database major and
commands actually run.
