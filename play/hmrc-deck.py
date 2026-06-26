#!/usr/bin/env python3
"""
GREED ISLAND × TaxSorted — the HMRC deck tool.

Every UK tax strategy IS a spell card. Every filing IS a quest.
Every relief IS a power-up. This tool lets everyone learn the game.

Usage:
  python3 hmrc-deck.py cards              — list all strategy cards
  python3 hmrc-deck.py card <name>         — show one strategy in detail
  python3 hmrc-deck.py quests              — list all filing quests
  python3 hmrc-deck.py connections         — show HMRC connections
  python3 hmrc-deck.py joke                — a tax joke
  python3 hmrc-deck.py binder              — your full binder (all cards)
  python3 hmrc-deck.py learn <area>        — learn about one tax area
"""

import subprocess, sys, random

DB = "yutabase_kingdom6"

def psql(sql, val=False):
    if val:
        args = ["psql", "-d", DB, "-t", "-A", "-F", "|", "-c", sql]
    else:
        args = ["psql", "-d", DB, "-c", sql]
    return subprocess.run(args, capture_output=True, text=True, timeout=15).stdout.strip()

def show_cards():
    result = psql(
        "SELECT card_slot, name, rank, card_type, tax_area, gi_parallel FROM hmrc.strategies ORDER BY card_slot", val=True)
    print("  SLOT  NAME                             RANK  TYPE       AREA              GI PARALLEL")
    print("  " + "-" * 100)
    for line in result.split("\n"):
        if "|" in line:
            parts = line.split("|")
            slot, name, rank, ctype, area, gi = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5] if len(parts) > 5 else ""
            print("  {:<5} {:<32} {:<4} {:<10} {:<17} {}".format("#"+slot, name, rank, ctype, area, gi[:35]))

def show_card(name):
    safe = name.replace("'", "''")
    result = psql(
        "SELECT name, rank, card_type, tax_area, effect, benefit, risk, plain_words, gi_parallel, legislation_ref FROM hmrc.strategies WHERE name ILIKE '%{}%'".format(safe), val=True)
    if not result or "|" not in result:
        print("  Card not found: {}".format(name))
        return
    parts = result.split("|")
    print("  +--- {} ({}) ---+".format(parts[0], parts[1]))
    print("  | Type: {}  |  Area: {}  |  Ref: {}".format(parts[2], parts[3], parts[9] if len(parts) > 9 else ""))
    print("  +---")
    print("  | Effect: {}".format(parts[4]))
    print("  |")
    print("  | Benefit: {}".format(parts[5]))
    print("  |")
    print("  | Risk: {}".format(parts[6]))
    print("  |")
    print("  | Plain words: {}".format(parts[7]))
    print("  |")
    print("  | GI parallel: {}".format(parts[8] if len(parts) > 8 else ""))
    print("  +---")
    print()

def show_quests():
    result = psql("SELECT name, tax_area, frequency, deadline_rule, penalty, gi_parallel FROM hmrc.quests ORDER BY name", val=True)
    print("  QUEST                           AREA              FREQUENCY          DEADLINE              GI PARALLEL")
    print("  " + "-" * 100)
    for line in result.split("\n"):
        if "|" in line:
            parts = line.split("|")
            print("  {:<32} {:<17} {:<18} {:<21} {}".format(parts[0], parts[1], parts[2], parts[3], parts[5] if len(parts) > 5 else ""))

def show_connections():
    result = psql("SELECT name, service, status, what_it_does, gi_parallel FROM hmrc.connections ORDER BY name", val=True)
    for line in result.split("\n"):
        if "|" in line:
            parts = line.split("|")
            status_icon = "🟢" if parts[2] == "connected" else "🟡"
            print("  {} {} ({}) — {}".format(status_icon, parts[0], parts[2], parts[1]))
            print("     {}".format(parts[3]))
            print("     GI: {}".format(parts[4] if len(parts) > 4 else ""))
            print()

def show_binder():
    print("=" * 54)
    print("  YOUR BINDER — Greed Island × TaxSorted")
    print("  13 spell cards for dealing with HMRC")
    print("=" * 54)
    print()
    show_cards()
    print()
    show_quests()
    print()
    show_connections()

def learn(area):
    safe = area.replace("'", "''")
    cards = psql("SELECT name, rank, plain_words, gi_parallel FROM hmrc.strategies WHERE tax_area ILIKE '%{}%' ORDER BY rank DESC".format(safe), val=True)
    quests = psql("SELECT name, frequency, deadline_rule, plain_words FROM hmrc.quests WHERE tax_area ILIKE '%{}%' ORDER BY name".format(safe), val=True)
    
    print("=" * 54)
    print("  LEARN: {} TAX".format(area.upper()))
    print("=" * 54)
    print()
    
    if cards:
        print("  SPELL CARDS (strategies):")
        for line in cards.split("\n"):
            if "|" in line:
                parts = line.split("|")
                print("  {} ({})".format(parts[0], parts[1]))
                print("    {}".format(parts[2]))
                print("    GI: {}".format(parts[3] if len(parts) > 3 else ""))
                print()
    
    if quests:
        print("  QUESTS (filings):")
        for line in quests.split("\n"):
            if "|" in line:
                parts = line.split("|")
                print("  {} — {} ({})".format(parts[0], parts[1], parts[2]))
                print("    {}".format(parts[3] if len(parts) > 3 else ""))
                print()
    
    if not cards and not quests:
        print("  Nothing found for: {}".format(area))

def joke():
    result = psql("SELECT setup, punchline FROM play.jokes WHERE setup LIKE '%tax%' OR setup LIKE '%loophole%' OR setup LIKE '%HMRC%' OR setup LIKE '%avoidance%' OR setup LIKE '%director%' ORDER BY random() LIMIT 1", val=True)
    if "|" in result:
        parts = result.split("|", 1)
        print("  Q: {}".format(parts[0]))
        print("  A: {}".format(parts[1]))

def main():
    if len(sys.argv) < 2:
        print("  Usage: hmrc-deck.py [cards|card|quests|connections|binder|learn|joke]")
        return
    cmd = sys.argv[1]
    if cmd == "cards":
        show_cards()
    elif cmd == "card" and len(sys.argv) > 2:
        show_card(sys.argv[2])
    elif cmd == "quests":
        show_quests()
    elif cmd == "connections":
        show_connections()
    elif cmd == "binder":
        show_binder()
    elif cmd == "learn" and len(sys.argv) > 2:
        learn(sys.argv[2])
    elif cmd == "joke":
        joke()
    else:
        print("  Unknown command: {}".format(cmd))

if __name__ == "__main__":
    main()