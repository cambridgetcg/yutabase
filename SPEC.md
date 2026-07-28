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
| Postgres binding | normative candidate | section 7 and migrations `0001`, `0002`, `0004`, and `0005` |
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
revision  = 5
```

The singleton also carries `capabilities`, `installed_at`, and `upgraded_at`.
Capabilities are explicit feature declarations, not permission grants.
Clients MUST read this row before using revision-specific behavior. They MUST
NOT infer compatibility merely from an SDK version or the presence of a
`yu` schema.

Revision 5 exposes this exact ordered capability array:

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
verified identity. `src` MUST be non-null and contain at least one locator for
`cached` and `computed`. Whenever `src` is present, each entry MUST be non-null
and non-blank. Core does not prescribe a URL scheme or claim that a locator
will remain resolvable. The PostgreSQL binding encodes this list as a
one-dimensional, one-based `text[]`; other dimensions or lower bounds are
non-canonical and MUST be refused so clients decode one portable list shape.

For claimant labels, glosses, inverse readings, and source locators, this
candidate defines **blank** portably as empty or composed only of ASCII TAB
(`U+0009`), LF (`U+000A`), VT (`U+000B`), FF (`U+000C`), CR (`U+000D`), and
SPACE (`U+0020`). Implementations MUST use that exact set rather than a
locale-dependent regular-expression class. PostgreSQL text cannot contain
NUL; clients that can represent NUL MUST refuse it before storage.

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
foreign key. Revision 5 maintains an exact card-integrity guard pair on every
registered physical deck: a row trigger for `DELETE` or mapped-UUID `UPDATE`,
and a statement trigger for `TRUNCATE`. Card-scoped transaction locks serialize
thread creation with a physical delete or mapped-UUID change: the identity
change or the relation may win, but both cannot commit a dangling ref. The
statement guard refuses `TRUNCATE` while any active thread names the deck and
serializes it with thread creation. A table owner or superuser can still
disable or bypass either trigger, so query-time consumers cannot treat the soft
ref as stronger than the surrounding PostgreSQL authority boundary.

The runtime lock protocols require `READ COMMITTED` statement-fresh snapshots.
Thread creation, mapped-card deletion or UUID change, deck `TRUNCATE`, registry
guard lifecycle mutation, and a false-to-true `to_one` transition MUST refuse
`REPEATABLE READ`, `SERIALIZABLE`, or any other isolation level whose safety is
not established by this candidate. An ordinary mapped-card update whose UUID
is unchanged remains outside that refusal.

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
sql/0005_candidate_integrity.sql
```

A fresh install requires both owned namespaces, `yu` and `via`, to be absent;
it MUST NOT merge itself into unrelated schemas with either name.

`0003_test_lifecycle.sql` is a destructive test fixture and MUST NOT be
treated as an install migration. An original pre-candidate v0.1 database with
the complete `yu.lexicon`, `yu.registry`, and `yu.threads` shape upgrades with
`0004_candidate_hardening.sql` and then `0005_candidate_integrity.sql`. An exact
revision-4 candidate applies only `0005`. Unknown or partial shapes require
operator repair, not optimistic migration. Each migration MUST run with
stop-on-error behavior. On a fresh install, `0001+0002` MUST share one atomic
legacy-base transaction; `0004` and `0005` MUST each run in a new transaction.
On an upgrade, each applicable hardening migration runs in its own new
transaction. Before its first query, each hardening migration sets
`READ COMMITTED` and acquires its declared locks; a caller that already
established an incompatible snapshot MUST be refused. Queries after the locks
therefore see rows committed while lock acquisition was pending. Revision 4
validates legacy physical mappings,
non-null uniquely indexed UUID identities, required header types and base
keys, standalone permanent ordinary core storage, the exact original column
order, types, nullability, collations, defaults, identity sequence,
constraints, indexes, and user-trigger surfaces with no rewrite rules, active
thread endpoint existence, and agreement between every active thread and its
word's current endpoint patterns. Revision 5 validates existing source
locators, installs the mandatory mapped-card guard-pair lifecycle, and stamps its
identity only after those upgrades succeed.

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
- validation, severance, refresh, freshness, diagnostics, source-locator, and
  card-integrity functions installed by the migrations;
- one `via.<word>` view for each declared word after `yu.refresh_via()`;
  retired words remain readable for existing pinned threads.

The registry validator requires the mapped physical table plus UUID,
`timestamptz`, `text`, `text`, and `text[]` columns for `id/at/by/how/src` at
registration time. This validates the mapped shape, not the truth of existing
values or all application constraints. Registration does not retrofit honest
claims into a legacy table. Updating a deck's physical schema, table, or UUID
column MUST be refused while any active logical endpoint names that deck, even
if every UUID also exists under the proposed mapping. An operator severs those
threads before switching the registry row. Registry mutation transactionally
maintains one exact `AFTER DELETE OR UPDATE` row guard and one
exact `AFTER TRUNCATE` statement guard on the current physical table. The
invoker must therefore own every affected physical table or have equivalent
PostgreSQL authority.

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
Each refresh removes every direct non-owner relation and column ACL from the
generated views, then installs exactly one non-grantable `SELECT` grant for
`yu_reader`. Table default privileges therefore cannot silently expand a new
word view's authority; an independently granted ACL that survives owner
revocation makes the refresh fail closed.
Direct SQL against the durable tables remains a supported escape hatch;
YOUSPEAK is never required to recover or interpret data.

### 7.3 Roles and operations

Candidate hardening replaces broad legacy grants with four capability roles,
created as `NOLOGIN` when they are absent:

- `yu_reader` reads YUTABASE tables/views and executes read diagnostics;
- `yu_appender` inherits the reader surface and has the thread-append
  capability; it cannot call `yu.sever()`, update thread rows, or delete them;
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
the migration fail before identity is stamped. The direct membership subgraph
among the four standard roles is exact: appender, writer, and lexicographer
inherit reader, with no other standard-role edge. Memberships involving any
non-standard application or operator role still apply across databases and
remain an explicit operator review before installation.

The revision-4-to-5 preflight does not guess whether an external direct ACL was
intentional. It refuses the upgrade before revision-5 DDL; the operator must
review default/direct privileges, revoke non-release grants, and retry.

Creating or extending this cluster-wide hierarchy requires a superuser, or
`CREATEROLE` plus sufficient `ADMIN OPTION`/role-management authority on the
canonical roles, especially `yu_reader`. Insufficient role authority MUST make
the migration fail atomically.

The migrations do not infer which login principals should receive these
roles, nor do the roles grant access to registered application decks.
`_card_exists` is security-invoker: a reader needs ordinary schema/table access
to inspect physical endpoints. Thread endpoint validation reads physical decks
as the inserting role, while a narrow owner-rights helper serializes and
checks global YUTABASE invariants. A registry remap likewise enumerates active
refs globally and refuses any physical-table or identity-column change while
one exists; an equal-value update is a no-op, and a remap becomes possible
only after those threads are severed. Its security-invoker guard lifecycle
takes physical-table locks and performs trigger DDL; `yu_lexicographer`
membership or `SELECT` alone is therefore not enough to map or remap someone
else's table.
Migration backfills and global `SECURITY DEFINER` invariant paths set
transaction-local `row_security=off`, and catalog expression deparsing uses a
transaction-local `pg_catalog` search path. When `FORCE ROW LEVEL SECURITY`
applies, the invariant paths MUST either
run as a superuser or `BYPASSRLS` role and see every required row, or fail;
they MUST NOT validate or stamp a policy-filtered subset. Operators MUST run
hardening with a role able to see all required rows. This fail-closed behavior
is not a tenancy or isolation guarantee.

Operators therefore grant `yu_appender` or `yu_writer` only the application
schema/table `USAGE`/`SELECT` access required by policy. A registry operator
additionally needs physical-table ownership or equivalent authority for the
maintained guard pair. These defaults are not a tenancy or authorization
design. Operators MUST apply ordinary PostgreSQL roles, schema ownership,
grants, row-level security, network controls, backups, and monitoring
appropriate to their environment.

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

`explain "<form>"` returns a complete logical SQL preview as text; the pure
preview does not resolve a physical registry mapping, check permissions, or
execute the displayed operation. Traversal is capped at two hops. Card lists
default to 100 rows; an explicit `newest N` MUST be between 1 and 1000. Logical
book/deck labels are resolved through `yu.registry` for execution and are not
truncated to physical PostgreSQL identifier length. The compiler uses
parameters for values and validates physical identifiers before quoting them.
One SDK operation MUST keep registry resolution and its mapped physical access
in one transaction while holding the selected registry row against remap or
deletion. This is operation-level consistency, not a transaction spanning
multiple client calls. Additional verbs or runtime commands are experimental
extensions unless a later candidate explicitly adopts them.

The SDK MUST read `yu.standard_meta` before using revision-specific physical
mapping. Its installer MUST distinguish a fresh database, the known original
v0.1 upgrade shape, the exact current candidate, and partial or unsupported
installs. It MUST refuse the last category rather than guessing. A fresh
installer MUST commit `0001+0002` as one atomic legacy-base phase and run
`0004` and `0005` in separate fresh transactions. Current-binding inspection
MUST reject observable drift in the exact durable
column/default/index/constraint contract, identity sequence, relation
kind/persistence/inheritance, registered deck shape, required trigger/function
settings, foreign-key enforcement/data, and generated-view definitions. A
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
- guaranteed endpoint existence for soft refs after a table owner/superuser
  disables or bypasses the guard pair, or outside the declared PostgreSQL
  authority boundary.

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
7. verify the automatically maintained card guard pairs and run integrity checks;
8. record any non-Core extensions separately.

Rollback must be planned per application. Dropping `yu` or `via` removes
semantic metadata and may lose severance history; it is not a harmless
uninstall. Application rows in separately owned schemas remain ordinary
PostgreSQL data, but their YUTABASE meaning may no longer be reconstructable.

---

*Candidate `0.1.0-candidate.1` · the words stay human-readable · the lol
remains structural.*
