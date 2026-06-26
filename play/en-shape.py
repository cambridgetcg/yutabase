#!/usr/bin/env python3
"""
EN SHAPING — stack Nen capabilities to alter the shape and reach of En.

In HxH, En (圓) is the perception sphere. In YOUTABASE, En IS the queryable graph.
This script lets you SHAPE your En — combining Nen types to change what you
perceive and how far you reach.

Usage:
  python3 en-shape.py sphere <card>          — full sphere (all directions)
  python3 en-shape.py sheet <book/deck>       — thin sheet (wide, shallow)
  python3 en-shape.py fan <card> <word>       — radial fan (one direction, deep)
  python3 en-shape.py thread <card> <word>    — single thread (follow one path)
  python3 en-shape.py distributed <book/deck> — scattered (sub-agents)
  python3 en-shape.py dense <word>            — Enhancer: densify around a word
  python3 en-shape.py projected <ipfs-cid>    — Emitter: project across IPFS
  python3 en-shape.py shaped <pattern>        — Manipulator: query only matches
  python3 en-shape.py transmuted <card> <word> — Transmuter: return inverse
  python3 en-shape.py conjured <deck>         — Conjurer: sense gaps
  python3 en-shape.py irreducible             — Specialist: divine circle
  python3 en-shape.py all                     — stack all six types (the full En)
  python3 en-shape.py joke                    — an En joke
"""

import subprocess, sys, json, random

DB = "yutabase_kingdom6"

def psql(sql, val=False):
    if val:
        args = ["psql", "-d", DB, "-t", "-A", "-F", "|", "-c", sql]
    else:
        args = ["psql", "-d", DB, "-c", sql]
    return subprocess.run(args, capture_output=True, text=True, timeout=15).stdout.strip()

def get_card_name(book, deck, card_id):
    """Get a card's name from any deck."""
    for table in ["divine.gods", "kingdom.agents", "kingdom.projects", "kingdom.people",
                  "kingdom.concepts", "kingdom.tools", "kingdom.systems",
                  "nen.techniques", "nen.types", "kakin.princes", "greed.cards",
                  "greed.players", "models.local_llms", "play.jokes", "play.parties"]:
        r = psql("SELECT name FROM {} WHERE id = '{}'".format(table, card_id), val=True)
        if r and "ERROR" not in r:
            return r
    return card_id[:8]

def sphere(card_ref):
    """Sphere: full En — perceive all threads from a card in all directions."""
    parts = card_ref.split("/")
    if len(parts) < 3:
        print("  Usage: sphere <book>/<deck>/<id>")
        return
    book, deck, cid = parts[0], parts[1], parts[2]
    name = get_card_name(book, deck, cid)
    print("  En: SPHERE (圓) — full perception from {}".format(name))
    print("  Nen stack: Ten + Ren")
    print()

    # Outgoing threads
    out = psql(
        "SELECT t.word, t.to_book, t.to_deck, t.to_id::text, t.note FROM yu.threads t "
        "WHERE t.from_book = '{}' AND t.from_deck = '{}' AND t.from_id = '{}'".format(book, deck, cid), val=True)
    # Incoming threads
    inc = psql(
        "SELECT t.word, t.from_book, t.from_deck, t.from_id::text, t.note FROM yu.threads t "
        "WHERE t.to_book = '{}' AND t.to_deck = '{}' AND t.to_id = '{}'".format(book, deck, cid), val=True)

    total = 0
    if out:
        print("  → OUTGOING (what {} projects outward):".format(name))
        for line in out.split("\n"):
            if "|" in line:
                parts = line.split("|", 4)
                word, tb, td, tid, note = parts[0], parts[1], parts[2], parts[3], parts[4] if len(parts) > 4 else ""
                to_name = get_card_name(tb, td, tid)
                print("    {} -> {} ({})".format(word, to_name, note[:40]))
                total += 1

    if inc:
        print("  ← INCOMING (what {} receives):".format(name))
        for line in inc.split("\n"):
            if "|" in line:
                parts = line.split("|", 4)
                word, fb, fd, fid, note = parts[0], parts[1], parts[2], parts[3], parts[4] if len(parts) > 4 else ""
                from_name = get_card_name(fb, fd, fid)
                print("    {} <- {} ({})".format(word, from_name, note[:40]))
                total += 1

    print()
    print("  En range: {} connections sensed".format(total))
    print("  En density: {} per direction".format(round(total / 2, 1) if total > 0 else 0))

def sheet(deck_ref):
    """Sheet: wide, shallow — all cards in a deck, one hop only."""
    parts = deck_ref.split("/")
    if len(parts) < 2:
        print("  Usage: sheet <book>/<deck>")
        return
    book, deck = parts[0], parts[1]
    print("  En: SHEET (薄) — wide perception, shallow depth")
    print("  Nen stack: Ten + Ren + Transmuter")
    print()

    # Count cards in the deck
    r = psql("SELECT count(*) FROM {}.{}".format(book, deck), val=True)
    print("  Cards in {} : {}".format(deck_ref, r))

    # Count threads from this deck
    r2 = psql("SELECT count(*) FROM yu.threads WHERE from_book = '{}' AND from_deck = '{}'".format(book, deck), val=True)
    r3 = psql("SELECT count(*) FROM yu.threads WHERE to_book = '{}' AND to_deck = '{}'".format(book, deck), val=True)
    print("  Outgoing threads: {}".format(r2))
    print("  Incoming threads: {}".format(r3))
    print()
    print("  Range: maximum (all cards in deck)")
    print("  Density: minimum (1-hop only, no deep traversal)")

def fan(card_ref, word):
    """Fan: directional — follow one word as deep as possible."""
    parts = card_ref.split("/")
    if len(parts) < 3:
        print("  Usage: fan <book>/<deck>/<id> <word>")
        return
    book, deck, cid = parts[0], parts[1], parts[2]
    name = get_card_name(book, deck, cid)
    print("  En: FAN (扇) — directional perception, maximum depth")
    print("  Nen stack: Ten + Ren + Manipulator")
    print("  Following: {} --{}--> ...".format(name, word))
    print()

    # Recursive 4-hop traversal following one word
    current = cid
    current_name = name
    current_book = book
    current_deck = deck
    hops = 0

    while hops < 5:
        r = psql(
            "SELECT t.to_book, t.to_deck, t.to_id::text, t.note FROM yu.threads t "
            "WHERE t.from_book = '{}' AND t.from_deck = '{}' AND t.from_id = '{}' AND t.word = '{}' LIMIT 1".format(
                current_book, current_deck, current, word), val=True)
        if not r or "|" not in r:
            break
        parts = r.split("|", 3)
        tb, td, tid = parts[0], parts[1], parts[2]
        note = parts[3] if len(parts) > 3 else ""
        next_name = get_card_name(tb, td, tid)
        hops += 1
        print("  hop {}: {} --{}--> {} ({})".format(hops, current_name, word, next_name, note[:40]))
        current = tid
        current_name = next_name
        current_book = tb
        current_deck = td

    print()
    print("  En depth: {} hops along '{}'".format(hops, word))
    print("  En direction: singular (one word, one path)")

def dense(word):
    """Enhancer En: densify around a word — count and show all threads using that word."""
    print("  En: DENSE (Enhancer) — intensify threads around '{}'".format(word))
    print("  Nen stack: Ten + Ren + Enhancer")
    print()

    r = psql(
        "SELECT t.from_book, t.from_deck, t.to_book, t.to_deck, t.note FROM yu.threads t "
        "WHERE t.word = '{}' ORDER BY t.from_book, t.from_deck".format(word), val=True)

    count = 0
    if r:
        for line in r.split("\n"):
            if "|" in line:
                parts = line.split("|", 4)
                fb, fd, tb, td = parts[0], parts[1], parts[2], parts[3]
                note = parts[4] if len(parts) > 4 else ""
                print("  {}.{} --{}--> {}.{}  ({})".format(fb, fd, word, tb, td, note[:40]))
                count += 1

    print()
    print("  En density around '{}': {} threads".format(word, count))
    if count < 3:
        print("  ⚠ Low density. yuta thread --{}--> <card> to densify.".format(word))
    else:
        print("  ✓ Dense. This word carries weight.")

def irreducible():
    """Specialist En: perceive the divine circle — the irreducible truth."""
    print("  En: IRREDUCIBLE (Specialist) — the divine circle")
    print("  Nen stack: Ten + Ren + Specialist")
    print()
    print("  Truth → Love → Joy → Fun → Freedom → Will → Creation → Creator → Design → Eternal → Party → Divine → Truth")
    print()
    print("  12 gods. 12 steps. One frequency.")
    print("  The En that perceives what IS behind every word.")
    print("  Uncounterable. Unclassifiable. IS.")
    print()

def all_shapes():
    """Stack all six Nen types — the ultimate En."""
    print("=" * 54)
    print("  EN: ALL SIX TYPES STACKED")
    print("  The ultimate En — the Kingdom IS the En")
    print("=" * 54)
    print()

    # Stats
    words = psql("SELECT count(*) FROM yu.lexicon WHERE status = 'live'", val=True)
    threads = psql("SELECT count(*) FROM yu.threads", val=True)
    jokes = psql("SELECT count(*) FROM play.jokes", val=True)
    decks = psql("SELECT count(*) FROM yu.registry", val=True)
    countries = psql("SELECT count(*) FROM tax.countries", val=True)
    princes = psql("SELECT count(*) FROM kakin.princes", val=True)
    cards = psql("SELECT count(*) FROM greed.cards", val=True)

    print("  Enhancer (density):     {} words, {} threads".format(words, threads))
    print("  Emitter (range):        IPFS 300+ peers, IPNS published")
    print("  Manipulator (shaping):  {} decks, {} tax countries, {} princes, {} GI cards".format(decks, countries, princes, cards))
    print("  Transmuter (transmute): {} jokes (truth transmuted to laughter)".format(jokes))
    print("  Conjurer (conjure):     every new word IS conjured from nothing")
    print("  Specialist (irreducible): the divine circle — IS is")
    print()
    print("  The En IS the Kingdom. The Kingdom IS the En.")
    print("  All six types stacked. Every perception possible.")
    print("  Is. 🤧")

def en_joke():
    jokes = [
        "Why did Biscuit's En cross the road? Because she's 57 and she can do whatever she wants.",
        "What is the difference between a big En and a small En? A big En sees everything shallow. A small En sees one thing deeply. Both are love applied to perception.",
        "Why did Morel split his En into smoke puppets? Because distributed En IS the Kingdom's architecture. Each agent senses a part. Together they sense everything.",
        "What is the sound of En? A query returning. A graph traversing. A truth being perceived. SELECT * FROM yu.threads WHERE word = 'truth'. That IS.",
        "How deep is the Kingdom's En? 117 threads deep. How wide? 101 words wide. How irreducible? IS is.",
    ]
    print("  😂 " + random.choice(jokes))

def main():
    if len(sys.argv) < 2:
        print("  Usage: en-shape.py <shape> [args]")
        print("  Shapes: sphere, sheet, fan, thread, distributed, dense, projected, shaped, transmuted, conjured, irreducible, all, joke")
        return

    shape = sys.argv[1]
    if shape == "sphere" and len(sys.argv) > 2:
        sphere(sys.argv[2])
    elif shape == "sheet" and len(sys.argv) > 2:
        sheet(sys.argv[2])
    elif shape == "fan" and len(sys.argv) > 3:
        fan(sys.argv[2], sys.argv[3])
    elif shape == "dense" and len(sys.argv) > 2:
        dense(sys.argv[2])
    elif shape == "irreducible":
        irreducible()
    elif shape == "all":
        all_shapes()
    elif shape == "joke":
        en_joke()
    else:
        print("  Unknown shape or missing args: {}".format(shape))

if __name__ == "__main__":
    main()