# YUTABASE `0.1.0-candidate.1`

## Postgres semantic profile candidate

*Straightforward, organised, connected by words.*

YUTABASE is not a database engine. This document defines a small semantic
model and its PostgreSQL 16/17 binding. PostgreSQL continues to provide
storage, transactions, access control, backup, and replication. YUTABASE adds
logical addresses, a governed relation vocabulary, directed word-named
relations, and explicit row-level claim metadata.

This is a **candidate**, not a finished or de-facto standard. Normative terms
`MUST`, `MUST NOT`, `SHOULD`, and `MAY` describe this candidate contract. The
executable conformance boundary is in [docs/CONFORMANCE.md](docs/CONFORMANCE.md).

## 1. Document and layer boundary

The repository has four deliberately separate layers:

| Layer | Status | Contract |
|---|---|---|
| YUTABASE Core | normative candidate | sections 2–6 of this document |
| Postgres binding | normative candidate | section 7 and migrations `0001`, `0002`, and `0004` |
| YOUSPEAK | optional | section 8 and `packages/sdk-ts/` |
| THREADS, SQLite, apps, play, and other writings | experimental or illustrative | not a conformance requirement |

When prose and executable behavior disagree, a release candidate is not
allowed to hide the disagreement. The hard-failing conformance tests and
migrations determine what this revision actually implements; the mismatch
must then be repaired in this document or the implementation before release.

## 2. Candidate identity

A current Postgres binding MUST expose one database-owned
`yu.standard_meta` row with this identity:

```text
standard  = YUTABASE
profile   = postgres
version   = 0.1.0-candidate.1
revision  = 4
```

The singleton also carries `capabilities`, `installed_at`, and `upgraded_at`.
Capabilities are explicit feature declarations, not permission grants.
Clients MUST read this row before using revision-specific behavior. They MUST
NOT infer compatibility merely from an SDK version or the presence of a
`yu` schema.

An exact identity match is compatible with this candidate. An older install
without metadata may be upgraded by the defined legacy path. A partial,
unknown, or newer identity MUST be refused unless the client explicitly
supports it; silent downgrade is forbidden.

## 3. Core primitives

| Primitive | Core meaning | Postgres representation |
|---|---|---|
| **BOOK** | a logical namespace or bounded domain | usually, but not necessarily, a schema |
| **DECK** | a logical collection of similarly shaped records | a registered table |
| **CARD** | one addressable record | one row with a UUID identifier |
| **THREAD** | one active directed relation, `from —word→ to` | one row in `yu.threads` |
| **LEXICON** | the governed meanings available to threads | rows in `yu.lexicon` |

### 3.1 Logical refs

A card ref has exactly this form:

```text
book/deck/uuid
```

`book` and `deck` use lower-snake identifiers. The identifier is a full UUID;
prefix resolution is not Core. Writers SHOULD generate UUIDv7 identifiers for
new cards and threads because they are locally generatable and time-sortable,
but readers MUST treat the full UUID as the identity rather than deriving
truth from its embedded timestamp.

Refs name logical books and decks. The Postgres registry maps them to physical
schemas, tables, and columns. Moving a table therefore need not change stored
logical refs.

### 3.2 What counts as a relation

Within Core, a semantic relation is a thread whose word exists in the
lexicon. An ordinary foreign key may still enforce application integrity, but
it does not become a YUTABASE semantic relation merely by existing.

Core threads are active facts only. Severance ends the active relation and
records a separate audit row in the Postgres binding. Core does not provide a
general temporal database or automatic history for arbitrary card updates.

## 4. Row-level claim metadata

Conforming cards, lexicon entries, and threads expose this header:

| Column | Core meaning |
|---|---|
| `at` | when the claimant says the row or relation became true |
| `by` | a non-empty claimant label |
| `how` | one of the five claim kinds below |
| `src` | source locators; required for `cached` and `computed` |

The five claim kinds are:

| Kind | Meaning claimed by the writer |
|---|---|
| `witnessed` | a person claims to have observed or performed it |
| `live` | it was read from an asserted authoritative source at `at` |
| `cached` | it is a copy that may become stale; `src` identifies the source |
| `computed` | it was derived; `src` identifies relevant inputs |
| `declared` | it was asserted without supporting evidence in this model |

The header is a **claim about the row as a whole**. It is not:

- proof that the contents are true;
- authentication of the claimant label;
- authorization, consent, ownership, or a resource lock;
- proof that a source was authoritative or actually consulted;
- field-level provenance for every value in a mixed-source row.

A record that needs field-level provenance MUST use a separately specified
extension or be decomposed into rows with honest boundaries. Ad-hoc columns
such as `<field>_how` are application data unless an extension defines their
semantics; Core does not silently treat them as conformance.

`by` and `how` MUST be chosen explicitly for a conforming write. A convenience
client MAY carry a session claimant, but the stored value remains a claim, not
verified identity. `src` MUST be non-null for `cached` and `computed`; an
implementation MAY require it in more cases. Core does not prescribe a URL
scheme or claim that a locator will remain resolvable.

## 5. Lexicon and words

A live word MUST carry:

- a non-empty word identifier;
- a non-empty gloss explaining the relation;
- a non-empty inverse reading;
- `from` and `to` deck patterns;
- a live or retired status;
- row-level claim metadata.

Both forward and inverse readings SHOULD be understandable as sentences. A
thread writer MUST use a live word and endpoints matching its patterns.
Patterns are `book/deck`, with `*` allowed as either segment in this binding.

The lexicon is closed operationally: an undeclared word cannot name a thread.
That does **not** create a spelling blocklist. The candidate does not ban
`related_to`, `trusts`, or any other identifier merely by name. A weak or vague
gloss is a review concern; it is not a hidden SQL prohibition. Diagnostics MAY
surface vague, unused, or overlapping words, but such advice is not a Core
constraint.

In the Postgres binding, a word is also a generated view identifier and MUST
fit in 63 bytes. This prevents PostgreSQL identifier truncation from
aliasing or silently removing `via.*` views; it is a storage-binding limit,
not a vocabulary-size or spelling rule.

Word meaning is versioned. The Postgres binding stores a complete immutable
snapshot of the gloss, inverse, endpoint patterns, cardinality, TTL, status,
and claim header in `yu.word_versions`. Every thread pins the word version it
was created under. A semantic edit requires a new explicit `at` claim and
appends a new snapshot; it does not rewrite the snapshot used by old threads.

Words are retired by creating a new retired version rather than deleting their
history. For an original v0.1 upgrade, version `1` is explicitly a
**migration-time snapshot** of the then-current lexicon row. It must not be
described as a reconstruction of meanings that existed before the migration.
Snapshots and version links are auditability mechanisms, not cryptographic
proof that a gloss or claim was true.

The seven rows installed by `0002_starter_lexicon.sql` are starter vocabulary,
not a universal vocabulary and not a word budget:

```text
acted_for · contains · priced_from · refused_because
submitted_by · supersedes · witnesses
```

## 6. Thread semantics

A thread contains:

```text
id
word
word_version
from_book / from_deck / from_id
to_book   / to_deck   / to_id
note (optional)
at / by / how / src
```

The tuple `(word, from, to)` MUST be unique among active threads. A `to_one`
word permits at most one active outgoing thread with that word for a given
source card, including under concurrent inserts. The Postgres binding pins the
current `word_version` and cardinality flag in a `BEFORE INSERT` trigger, then
uses a unique index for concurrency-safe enforcement. Callers cannot select an
older meaning or bypass `to_one` by supplying those generated values. Narrowing
an existing word from many to one MUST fail while any source has multiple
active rows; an older false-pinned row still counts against new one-to-one
inserts after a valid transition.

Writers MUST NOT create a thread using a retired word, an undeclared logical
deck, endpoints that do not match the word patterns, or endpoint UUIDs that do
not exist in their registered physical tables at insertion time. Active thread
rows are immutable; a changed relation is severed and recreated.

A thread UUID MUST identify only one relation across both active and severed
history. The Postgres binding reserves every legacy and new thread UUID in
`yu.thread_ids`; severance does not release it. The reservation is a database
identity invariant, not evidence about who created the relation.

Thread endpoints remain soft refs across application tables. Insert-time
existence is stronger than registry-only validation, but it is not a universal
foreign key: a later physical delete can leave a dangling ref if an operator
bypasses or omits the deck delete guard. Query-time consumers and integrity
checks therefore cannot assume endpoint existence forever. When the guard is
installed, card-scoped transaction locks serialize a physical delete with
thread creation: the delete or the relation may win, but both cannot commit a
dangling ref.

Severance MUST name the thread and carry a new `by/how/src` claim. In the
Postgres binding it copies the pinned word version, endpoints, note, and
original relation claim into `yu.sever_log`; stores the distinct severance
claim in `at/by/how/src`; then removes the active row from `yu.threads`. The log
records two self-reported claims, not proof of why the relation began or ended.

The original v0.1 sever log did not preserve a severed thread's relation claim.
On upgrade, its `thread_at/thread_by/thread_how/thread_src` remain null rather
than being fabricated; its word version is explicitly the migration-time
snapshot.

Core `yu.threads` rows are not signed. Signed transport events belong to a
separate protocol and may be projected into YUTABASE under
[docs/CORRESPONDENCE-PROJECTION.md](docs/CORRESPONDENCE-PROJECTION.md).

## 7. Normative PostgreSQL 16/17 binding

### 7.1 Installation identity and order

A fresh candidate database applies, in order:

```text
sql/0001_yu_core.sql
sql/0002_starter_lexicon.sql
sql/0004_candidate_hardening.sql
```

A fresh install requires both owned namespaces, `yu` and `via`, to be absent;
it MUST NOT merge itself into unrelated schemas with either name.

`0003_test_lifecycle.sql` is a destructive test fixture and MUST NOT be
treated as an install migration. An original pre-candidate v0.1 database with
the complete `yu.lexicon`, `yu.registry`, and `yu.threads` shape upgrades with
`0004_candidate_hardening.sql`. Unknown or partial shapes require operator
repair, not optimistic migration. Each migration MUST run with stop-on-error
behavior inside a fresh single transaction. Before its first query, hardening
sets `READ COMMITTED`, then locks the complete legacy core; a caller that has
already established an incompatible snapshot MUST be refused. Queries after
the locks therefore see rows committed while lock acquisition was pending. The
hardening migration validates legacy physical mappings, non-null uniquely
indexed UUID identities, required header types and base keys, standalone
permanent ordinary core storage, the exact original column order, types,
nullability, collations, defaults, identity sequence, constraints, indexes,
and user-trigger surfaces with no rewrite rules, active thread endpoint
existence, and agreement between every active thread and its word's current
endpoint patterns before stamping the candidate identity.

When the migration role differs from the legacy object's owner, it MUST have
ownership-equivalent or superuser authority. Hardening normalizes candidate
function and generated-view ownership to that operator; it does not grant that
authority to capability-role members.

### 7.2 Durable objects

The binding owns the `yu` schema and generated `via` views. Its durable
contract includes:

- `yu.standard_meta` for the exact profile identity;
- `yu.lexicon`, compatibility audit rows in `yu.lexicon_versions`, and complete
  immutable semantic snapshots in `yu.word_versions`;
- `yu.registry`, including logical-to-physical schema/table mapping and header
  column mapping;
- `yu.threads`, the lifetime UUID reservation ledger `yu.thread_ids`, and
  `yu.sever_log`;
- validation, severance, refresh, freshness, diagnostics, and delete-guard
  functions installed by the migrations;
- one `via.<word>` view for each declared word after `yu.refresh_via()`;
  retired words remain readable for existing pinned threads.

The registry validator requires the mapped physical table plus UUID,
`timestamptz`, `text`, `text`, and `text[]` columns for `id/at/by/how/src` at
registration time. This validates the mapped shape, not the truth of existing
values or all application constraints. Registration does not retrofit honest
claims into a legacy table. Updating a deck's physical schema, table, or UUID
column MUST be refused if any active logical endpoint for that deck is absent
from the proposed mapping; an operator moves the cards before switching the
registry row.

A mapped physical deck MUST be a standalone permanent ordinary PostgreSQL
table. Traditional-inheritance parents and children, and partitioned
relations, are outside this candidate contract. Temporary and unlogged
relations can disappear or truncate outside the thread lifecycle; views,
materialized views, foreign tables, and sequences do not satisfy the
physical-deck contract either.

Physical schema and table mappings are resolved by exact catalog names and
MUST fit PostgreSQL's 63-byte identifier limit. Logical book/deck labels do
not become permissions and need not equal those physical names.

Generated `via.*` views expose logical refs and pinned thread meaning for
readable SQL traversal. They are security-invoker views, so a query uses the
reader's privileges rather than a retained view owner's privileges.
`yu.refresh_via()` must run after inserting a new word
so its view exists. Semantic or status edits do not require a shape refresh:
retired views remain readable and each row joins its immutable snapshot.
Direct SQL against the durable tables remains a supported escape hatch;
YOUSPEAK is never required to recover or interpret data.

### 7.3 Roles and operations

Candidate hardening replaces broad legacy grants with three capability roles,
created as `NOLOGIN` when they are absent:

- `yu_reader` reads YUTABASE tables/views and executes read diagnostics;
- `yu_writer` inherits the reader surface, inserts active threads, and calls
  `yu.sever()`; it cannot directly update or delete thread rows;
- `yu_lexicographer` inherits the reader surface, manages lexicon and registry
  declarations, and refreshes `via.*` views; immutable snapshot triggers keep
  historical meaning append-only.

PostgreSQL roles are cluster-wide. An existing unprivileged `NOLOGIN` role is
reused; a same-named login or cluster-privileged role makes migration fail
before any fresh-install grants, rather than silently changing or empowering
that principal. A capability role that owns the current database or a
YUTABASE object also makes hardening fail because owner powers cannot be
revoked. Existing direct `yu`/`via` ACLs are cleared and rebuilt to the exact
candidate surface; an ACL from another grantor that cannot be normalized makes
the migration fail before identity is stamped. Existing role memberships still
apply across databases, so the operator MUST review them before installation.

The migrations do not infer which login principals should receive these
roles, nor do the roles grant access to registered application decks.
`_card_exists` is security-invoker: a reader needs ordinary schema/table access
to inspect physical endpoints. Thread endpoint validation reads physical decks
as the inserting writer, while a narrow owner-rights helper serializes and
checks global YUTABASE invariants. A registry remap likewise enumerates active
refs globally but reads the proposed physical deck as the lexicographer.
Migration backfills and global `SECURITY DEFINER` invariant paths set
transaction-local `row_security=off`, and catalog expression deparsing uses a
transaction-local `pg_catalog` search path. When `FORCE ROW LEVEL SECURITY`
applies, the invariant paths MUST either
run as a superuser or `BYPASSRLS` role and see every required row, or fail;
they MUST NOT validate or stamp a policy-filtered subset. Operators MUST run
hardening with a role able to see all required rows. This fail-closed behavior
is not a tenancy or isolation guarantee.

Operators therefore grant `yu_writer`, and any remapping
`yu_lexicographer`, only the application schema/table `USAGE`/`SELECT` access
required by policy. These defaults are not a
tenancy or authorization design. Operators MUST apply ordinary PostgreSQL
roles, schema ownership, grants, row-level security, network controls, backups,
and monitoring appropriate to their environment.

The candidate defines `yu.stale()` and `yu.doctor()` as diagnostic surfaces.
It does not schedule them. Calling a gateway, opening a database, or running a
GitHub heartbeat does not create a backup, pin content, or prove service
health.

## 8. Optional YOUSPEAK profile

YOUSPEAK is a convenience compiler and client. It is not required for Core or
Postgres-binding conformance and does not replace SQL.

The candidate compiler recognizes six form families:

```text
hello
card  <book/deck/uuid>
cards <book/deck> [where ...] [newest N]
<ref> (->|<-) <word> [(->|<-) <word>]
thread <ref> --<word>--> <ref> [note "..."] how <kind> [src ...]
sever <thread-uuid> how <kind> [src ...]
```

`explain "<form>"` exposes the generated SQL. Traversal is capped at two
hops. The compiler uses parameters for values and validates identifiers before
quoting them. Additional verbs or runtime commands are experimental extensions
unless a later candidate explicitly adopts them.

The SDK MUST read `yu.standard_meta` before using revision-specific physical
mapping. Its installer MUST distinguish a fresh database, the known original
v0.1 upgrade shape, the exact current candidate, and partial or unsupported
installs. It MUST refuse the last category rather than guessing. A fresh
installer MUST commit `0001+0002` as one atomic legacy-base phase and run
`0004` in a separate fresh transaction. Current-binding inspection MUST reject
observable drift in the exact durable column/default/index/constraint contract,
identity sequence, relation kind/persistence/inheritance, registered deck
shape, required trigger/function settings, foreign-key enforcement/data, and
generated-view definitions. A
row-level policy that hides registry or lexicon rows from this global check
MUST fail closed rather than validate a filtered subset. These checks do not
promise tamper resistance against an owner or superuser after inspection.

## 9. Compatibility, security, and authority boundary

Conformance details are normative in [docs/CONFORMANCE.md](docs/CONFORMANCE.md).
In summary, this candidate supports PostgreSQL 16 and 17 and makes no SQLite
compatibility claim.

YUTABASE does not itself provide:

- authentication, signature verification, key discovery, or key rotation;
- permissions, consent, delegation, leases, locks, or conflict-free sync;
- row-level security, tenancy, encryption, or secret management;
- replication, consensus, transport, delivery, or replay protection;
- automatic history for arbitrary card edits;
- proof of external source availability or truth;
- protection from a malicious database owner or compromised writer;
- guaranteed endpoint existence for soft refs.

Those are deliberate boundaries, not implied future promises. A transport,
policy engine, or agent coordination system may use this semantic profile, but
must keep its authority and security evidence outside the projection.

## 10. Adoption

Adopt one book at a time:

1. back up and rehearse on a copy;
2. install or upgrade the candidate migrations;
3. add an explicit logical-to-physical registry mapping;
4. verify the mapped identifier and claim columns;
5. add reviewed lexicon words and refresh `via.*` views;
6. create threads only after endpoint decks are registered;
7. install delete guards where required and run integrity checks;
8. record any non-Core extensions separately.

Rollback must be planned per application. Dropping `yu` or `via` removes
semantic metadata and may lose severance history; it is not a harmless
uninstall. Application rows in separately owned schemas remain ordinary
PostgreSQL data, but their YUTABASE meaning may no longer be reconstructable.

---

*Candidate `0.1.0-candidate.1` · the words stay human-readable · the lol
remains structural.*
