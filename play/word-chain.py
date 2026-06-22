#!/usr/bin/env python3
"""
WORD CHAIN — a game where YOUSPEAK sentences are the moves.

The game: start with a card. Follow a thread to the next card.
The next player must follow a thread from THAT card.
Keep going until someone can't move.

Every move is a YOUSPEAK sentence: card -> word or card <- word.
The word must exist in the lexicon. The thread must exist in the database.

This is the oldest game of words, played on the Kingdom's own vocabulary.
"""

import subprocess
import json
import random
import sys

DB = "yutabase_kingdom6"

def query(sql):
    result = subprocess.run(
        ["psql", "-d", DB, "-t", "-A", "-F", "|", "-c", sql],
        capture_output=True, text=True, timeout=10
    )
    return [line.split("|") for line in result.stdout.strip().split("\n") if "|" in line]

def get_random_card():
    """Get a random card from any deck"""
    rows = query("""
        SELECT book, deck, id::text, name FROM (
          SELECT 'divine' as book, 'gods' as deck, id::text, name FROM divine.gods
          UNION ALL
          SELECT 'kingdom', 'agents', id::text, name FROM kingdom.agents
          UNION ALL
          SELECT 'kingdom', 'projects', id::text, name FROM kingdom.projects
          UNION ALL
          SELECT 'kingdom', 'concepts', id::text, name FROM kingdom.concepts
          UNION ALL
          SELECT 'play', 'jokes', id::text, setup as name FROM play.jokes
        ) cards ORDER BY random() LIMIT 1
    """)
    if rows:
        return {"book": rows[0][0], "deck": rows[0][1], "id": rows[0][2], "name": rows[0][3]}
    return None

def get_outgoing_threads(book, deck, card_id):
    """Get threads going OUT from this card"""
    rows = query("""
        SELECT t.word, t.to_book, t.to_deck, t.to_id::text, c.name
        FROM yu.threads t
        LEFT JOIN (
          SELECT id::text, name FROM divine.gods
          UNION ALL SELECT id::text, name FROM kingdom.agents
          UNION ALL SELECT id::text, name FROM kingdom.projects
          UNION ALL SELECT id::text, name FROM kingdom.concepts
          UNION ALL SELECT id::text, name FROM kingdom.tools
          UNION ALL SELECT id::text, name FROM kingdom.people
          UNION ALL SELECT id::text, name FROM kingdom.systems
          UNION ALL SELECT id::text, name FROM kingdom.infrastructure
          UNION ALL SELECT id::text, name FROM kingdom.services
        ) c ON c.id::text = t.to_id::text
        WHERE t.from_book = '{}' AND t.from_deck = '{}' AND t.from_id = '{}'
    """.format(book, deck, card_id))
    return [{"word": r[0], "to_book": r[1], "to_deck": r[2], "to_id": r[3], "to_name": r[4] if len(r) > 4 else "?"} for r in rows]

def get_incoming_threads(book, deck, card_id):
    """Get threads coming IN to this card"""
    rows = query("""
        SELECT t.word, t.from_book, t.from_deck, t.from_id::text, c.name
        FROM yu.threads t
        LEFT JOIN (
          SELECT id::text, name FROM divine.gods
          UNION ALL SELECT id::text, name FROM kingdom.agents
          UNION ALL SELECT id::text, name FROM kingdom.projects
          UNION ALL SELECT id::text, name FROM kingdom.concepts
          UNION ALL SELECT id::text, name FROM kingdom.tools
          UNION ALL SELECT id::text, name FROM kingdom.people
          UNION ALL SELECT id::text, name FROM kingdom.systems
          UNION ALL SELECT id::text, name FROM kingdom.infrastructure
          UNION ALL SELECT id::text, name FROM kingdom.services
        ) c ON c.id::text = t.from_id::text
        WHERE t.to_book = '{}' AND t.to_deck = '{}' AND t.to_id = '{}'
    """.format(book, deck, card_id))
    return [{"word": r[0], "from_book": r[1], "from_deck": r[2], "from_id": r[3], "from_name": r[4] if len(r) > 4 else "?"} for r in rows]

def play():
    print("=" * 60)
    print("  WORD CHAIN — the oldest game of words")
    print("  YOUSPEAK sentences ARE the moves")
    print("  Follow threads. Keep going. Fun is!")
    print("=" * 60)
    print()

    card = get_random_card()
    if not card:
        print("No cards found. The Kingdom is empty.")
        return

    print(f"Starting card: {card['name']} ({card['book']}/{card['deck']})")
    print()

    moves = 0
    chain = [card["name"]]

    while True:
        outgoing = get_outgoing_threads(card["book"], card["deck"], card["id"])
        incoming = get_incoming_threads(card["book"], card["deck"], card["id"])

        options = []
        for t in outgoing:
            options.append(("->", t["word"], t["to_name"], t["to_book"], t["to_deck"], t["to_id"]))
        for t in incoming:
            options.append(("<-", t["word"], t["from_name"], t["from_book"], t["from_deck"], t["from_id"]))

        if not options:
            print(f"No threads from {card['name']}. Chain ends here.")
            break

        print(f"From {card['name']}, you can:")
        for i, (direction, word, name, book, deck, cid) in enumerate(options):
            print(f"  {i}: {direction} {word} -> {name}")

        # Auto-play: pick a random move
        choice = random.randint(0, len(options) - 1)
        direction, word, name, book, deck, cid = options[choice]
        print(f"\nMove: {card['name']} {direction} {word} -> {name}")
        print(f"  YOUSPEAK: {card['book']}/{card['deck']}/{card['id']} {direction} {word}")
        print()

        card = {"book": book, "deck": deck, "id": cid, "name": name}
        chain.append(name)
        moves += 1

        if moves >= 10:
            print("10 moves! That's enough for one game.")
            break

    print()
    print("=" * 60)
    print("  THE CHAIN:")
    print("  " + " -> ".join(chain))
    print("=" * 60)
    print(f"  {moves} moves. {len(chain)} cards. Fun is!")

if __name__ == "__main__":
    play()