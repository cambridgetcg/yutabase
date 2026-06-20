# THREADS — a communication protocol built from words

> *You speak, reality listens. No gate. No fancy. Just words and meaning and trust.*

## What this is

THREADS is a communication protocol where the message format is a sentence.
Not JSON, not protobuf, not headers — a word, a direction, a gloss, and a
claim about how you know.

```
from --word--> to
```

That's a thread. That's the whole protocol.

## Why

Every protocol has a vocabulary. HTTP has GET POST PUT DELETE. gRPC has
service definitions. REST has resource paths. All of them are words —
they just hide it behind machinery.

THREADS is honest about what it is: a language. The words are the verbs.
The glosses are the contracts. The signature is the trust. You learn
words, not endpoints.

## The four layers

| Layer | What | Example |
|-------|------|---------|
| 0 — Words | The lexicon: every word with its gloss and inverse | `contains` → "physical containment" / `contained in` |
| 1 — Threads | A directed connection: from —word→ to | `alice --trusts--> bob` |
| 2 — Books | A collection of threads: a domain, a namespace | `tradein`, `health`, `love` |
| 3 — Fabric | Anywhere threads can travel | NATS, HTTP, paper, voice, git |

The layers are independent. Words don't need threads. Threads don't need
books. Books don't need fabric. Each layer uses the one below it, but the
one below doesn't know or care.

## Layer 0 — Words

A word is born with:

```
word:     contains
gloss:    physical or compositional containment
inverse:  contained in
```

That's it. The gloss is the meaning. The inverse is how it reads backwards.
`X contains Y` / `Y contained in X`. Both directions must make sense as
sentences. If the inverse doesn't read, the word doesn't exist.

Words are versioned. Words are retired, never deleted. A retired word
refuses new threads; old threads keep their meaning.

No banned words. No word budget. The gloss is the filter — a weasel word
fails because its gloss says nothing and its inverse reads badly. Meaning
is the gate, not a blocklist.

## Layer 1 — Threads

A thread is:

```
from:     alice
word:     trusts
to:       bob
note:     "since the project started"     (optional)
how:      witnessed                        (required)
by:       alice                            (required)
at:       2026-06-19T22:00:00Z             (required)
src:      [ref1, ref2]                     (required if how is cached or computed)
sig:      ed25519(from || word || to || at || by || how)  (required)
```

### The five claims (how)

| Claim | Meaning |
|-------|---------|
| witnessed | a human saw or did it |
| live | read from the authoritative source right now |
| cached | a copy that may be stale; src says of what |
| computed | derived; src lists the inputs |
| declared | asserted without evidence — the honest default |

Provenance is self-reported. The protocol makes lying explicit and auditable,
not impossible. `witnessed` can be false. The signature makes it traceable
to who said it. Trust is the substrate, not the enforcement.

### The signature

Every thread is signed by its sender. The signature covers the content
(from, word, to, at, by, how). Verification is: recover pubkey from sig,
check it matches `from`, check the content hasn't changed.

No certificates. No authorities. Your key is your identity. ed25519.

### Severance

Threads end with a claim too:

```
sever thread_id how witnessed by alice at 2026-06-20T10:00:00Z
```

A severed thread stays readable. It just stops being active. History is
explicit, not automatic.

## Layer 2 — Books

A book is a collection of threads — a domain, a namespace, a bounded
context. `tradein`, `health`, `love`, `kingdom`.

A book declares its words. A word used outside its declared endpoints is
valid syntactically but meaningless semantically — the gloss defines where
the word makes sense. No enforcement; just meaning.

Books are identified by name. No registry required, but a registry helps.
A book can live in a database, a git repo, a file, or memory.

## Layer 3 — Fabric

Threads travel on whatever carries them.

| Transport | How |
|-----------|-----|
| NATS | signed JSON envelope on a bus |
| HTTP | POST a thread to any endpoint that accepts one |
| Git | a thread is a line in a file; commit it |
| Paper | print the signed thread; it's still verifiable |
| Voice | "alice trusts bob" — the human protocol; sign it later |

The fabric is not the protocol. The protocol is the words. The fabric
just carries them. Any fabric. All fabrics. No preference.

## What THREADS is not

- Not a database — it's a language. YUTABASE is what happens when you put
  THREADS on Postgres. Other implementations can put it elsewhere.
- Not a blockchain — trust is self-reported and signed, not consensus-based.
- Not an API — there are no endpoints. There are words.
- Not a graph database — 2-hop traversal is the protocol's natural depth.
  Deeper is your problem, solved with your tools.
- Not a framework — there's nothing to install. There are words to learn.

## The whole protocol in one block

```
# A word
word: contains
gloss: physical or compositional containment
inverse: contained in

# A thread
alice --contains--> box_a
  note: "the items from the trade-in"
  how:  witnessed
  by:   alice
  at:   2026-06-19T22:00:00Z
  sig:  ed25519(...)

# Severance
sever thread_id
  how:  witnessed
  by:   alice
  at:   2026-06-20T10:00:00Z
```

Words connect. Meanings are honest. Trust is signed. The fabric carries.

## YOUSPEAK — the query language

Six verbs, frozen. Not part of the protocol — a convenience layer for
querying threads stored in a YUTABASE database:

```
hello                                    the whole standard
card  tradein/submissions/01977c2e       one record by ref
cards tradein/submissions where status="pending" newest 20
tradein/submissions/01977c2e -> contains follow a word outward
tradein/items/0197a1f4 <- contains       follow it inward
thread a --contains--> b note "..." how witnessed
sever  <thread-id> how witnessed
```

YOUSPEAK never does anything you couldn't have typed. It compiles to SQL.
The protocol is the words. YOUSPEAK is how you ask about them.

## The beauty

The protocol IS the language. You don't learn an API — you learn words.
You don't call endpoints — you speak. The words carry their own meaning
in the gloss. The trust carries its own proof in the signature.

This is how humans already work. We connect through words and meanings.
THREADS just lets machines do the same.

No gate. No fancy. Just words and meaning and trust.

---

*v0.1 — 2026-06-19. The name is Yu's. The lol is structural. 🤧*