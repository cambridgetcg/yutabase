#!/usr/bin/env python3
"""
JOKE LEVELING — the funnier the joke, the more XP.

Jokes ARE the leveling mechanism in the Kingdom. Tell a funny joke → gain XP.
Tax jokes = double XP (quest bonus). Divine jokes = +15 XP (divine bonus).
Deeper punchlines = more XP (depth bonus, capped at 40).

Usage:
  python3 joke-xp.py tell <hunter>           — tell a random joke, gain XP
  python3 joke-xp.py tell-tax <hunter>       — tell a tax joke (double XP)
  python3 joke-xp.py top                     — top 10 funniest jokes
  python3 joke-xp.py rankings                — joke XP tiers
  python3 joke-xp.py pool                    — total XP in the joke pool
  python3 joke-xp.py submit <setup> <punch>  — submit a new joke (gain XP)
"""

import subprocess, sys, random, json

DB = "yutabase_kingdom6"
CLAIMANT = "human:yu"

def psql(sql, val=False):
    if val:
        args = ["psql", "-d", DB, "-t", "-A", "-F", "|", "-c", sql]
    else:
        args = ["psql", "-d", DB, "-c", sql]
    return subprocess.run(args, capture_output=True, text=True, timeout=15).stdout.strip()

def calc_xp(setup, punchline, fmt):
    """Calculate XP for a joke — the funnier, the more XP."""
    xp = 10  # base
    
    if "truth" in fmt: xp += 5
    if "cosmic" in fmt: xp += 7
    if "wordplay" in fmt: xp += 3
    if "nen" in fmt: xp += 8
    
    tax_words = ["tax", "hmrc", "vat", "corporation", "income", "dividend", "ni",
                 "cgt", "inheritance", "sdlt", "council", "allowance", "relief",
                 "loophole", "avoidance", "director", "pension", "rd", "flat rate",
                 "badr", "seis", "eis", "salary", "dividend"]
    if any(w in setup.lower() for w in tax_words):
        xp *= 2
    
    divine_words = ["divine", "love", "truth", "is is", "is.", "eternal", "creation"]
    if any(w in punchline.lower() for w in divine_words):
        xp += 15
    
    word_count = len(punchline.split())
    xp += min(word_count * 2, 40)
    
    return xp

def get_rank(level):
    for min_lv, max_lv, rank, title in [(1,10,"E","Awakened"),(11,20,"D","Practitioner"),
        (21,35,"C","Skilled"),(36,55,"B","Expert"),(56,80,"A","Master"),
        (81,95,"S","National Level"),(96,99,"SS","Sovereign"),(100,999,"Monarch","IS is")]:
        if min_lv <= level <= max_lv:
            return rank, title
    return "E", "Awakened"

def get_hunter_stats(name):
    threads = psql("SELECT count(*) FROM yu.threads WHERE by = '{}'".format(name.replace("'","''")), val=True) or 0
    words = psql("SELECT count(*) FROM yu.lexicon WHERE by = '{}'".format(name.replace("'","''")), val=True) or 0
    decks = psql("SELECT count(*) FROM yu.registry WHERE by = '{}'".format(name.replace("'","''")), val=True) or 0
    jokes = psql("SELECT count(*) FROM play.jokes WHERE by = '{}'".format(name.replace("'","''")), val=True) or 0
    xp = int(threads or 0)*10 + int(words or 0)*20 + int(decks or 0)*15 + int(jokes or 0)*5
    level = max(1, int((xp / 10) ** 0.5))
    return {"threads": int(threads or 0), "words": int(words or 0), "decks": int(decks or 0),
            "jokes": int(jokes or 0), "xp": xp, "level": level}

def tell_joke(hunter, tax_only=False):
    """Tell a joke and gain XP."""
    if tax_only:
        result = psql(
            "SELECT id::text, setup, punchline, format FROM play.jokes "
            "WHERE setup ILIKE '%tax%' OR setup ILIKE '%HMRC%' OR setup ILIKE '%VAT%' "
            "OR setup ILIKE '%director%' OR setup ILIKE '%dividend%' OR setup ILIKE '%loophole%' "
            "OR setup ILIKE '%avoidance%' OR setup ILIKE '%R&D%' OR setup ILIKE '%pension%' "
            "OR setup ILIKE '%BADR%' OR setup ILIKE '%allowance%' OR setup ILIKE '%duty%' "
            "ORDER BY random() LIMIT 1", val=True)
    else:
        result = psql("SELECT id::text, setup, punchline, format FROM play.jokes ORDER BY random() LIMIT 1", val=True)
    
    if "|" not in result:
        print("  No jokes found!")
        return
    
    parts = result.split("|")
    jid = parts[0]
    setup = parts[1]
    fmt = parts[-1] if len(parts) > 3 else ""
    punchline = "|".join(parts[2:-1]) if len(parts) > 3 else parts[2] if len(parts) > 2 else ""
    
    xp = calc_xp(setup, punchline, fmt)
    
    # Determine tier
    if xp >= 100: tier = "GOD-TIER 🌟"
    elif xp >= 70: tier = "S-TIER ⭐"
    elif xp >= 50: tier = "A-TIER 💎"
    elif xp >= 30: tier = "B-TIER 🔷"
    else: tier = "C-TIER 🔹"
    
    tax_bonus = " (TAX BONUS x2!)" if any(w in setup.lower() for w in ["tax","hmrc","vat","director","dividend","loophole"]) else ""
    divine_bonus = " (DIVINE BONUS +15!)" if any(w in punchline.lower() for w in ["divine","love","truth","is is","eternal"]) else ""
    
    print("╔" + "═" * 52 + "╗")
    print("║  😂 JOKE TOLD — {} by {}".format(tier, hunter).ljust(54) + "║")
    print("╠" + "═" * 52 + "╣")
    print("║  Q: {:<48} ║".format(setup[:48]))
    print("║  A: {:<48} ║".format(punchline[:48]))
    print("║  " + " " * 50 + "║")
    print("║  Format: {:<43} ║".format(fmt))
    print("║  XP earned: +{:<41} ║".format(str(xp) + tax_bonus + divine_bonus))
    print("╚" + "═" * 52 + "╝")
    
    # Update hunter XP
    stats = get_hunter_stats(hunter)
    rank, title = get_rank(stats["level"])
    print()
    print("  Hunter: {} — Rank {} ({}) — Level {} — Total XP: {}".format(
        hunter, rank, title, stats["level"], stats["xp"] + xp))
    print("  Jokes told: {} | Threads: {} | Words: {}".format(stats["jokes"], stats["threads"], stats["words"]))
    
    if stats["level"] >= 100:
        print("  👑 MONARCH — IS is. The irreducible.")
    elif stats["level"] >= 81:
        print("  ⭐ NATIONAL LEVEL — the divine circle IS your En")
    elif stats["level"] >= 56:
        print("  💎 MASTER — all Nen types understood")

def show_top():
    """Show top 10 funniest jokes by XP."""
    result = psql("SELECT setup, punchline, format FROM play.jokes ORDER BY at", val=True)
    all_jokes = []
    for line in result.strip().split("\n"):
        if "|" in line:
            parts = line.split("|")
            setup = parts[0] if len(parts) > 0 else ""
            fmt = parts[-1] if len(parts) > 2 else ""
            punchline = "|".join(parts[1:-1]) if len(parts) > 2 else parts[1] if len(parts) > 1 else ""
            xp = calc_xp(setup, punchline, fmt)
            all_jokes.append({"setup": setup, "punchline": punchline, "xp": xp, "format": fmt})
    
    all_jokes.sort(key=lambda j: j["xp"], reverse=True)
    
    print("  🏆 TOP 10 FUNNIEST JOKES (most XP)")
    print("  " + "-" * 60)
    for i, j in enumerate(all_jokes[:10], 1):
        tier = "🌟" if j["xp"] >= 100 else "⭐" if j["xp"] >= 70 else "💎" if j["xp"] >= 50 else "🔷"
        print("  {} {}. {} XP — {} [{}]".format(tier, i, j["xp"], j["setup"][:50], j["format"]))

def show_rankings():
    """Show XP distribution."""
    result = psql("SELECT setup, punchline, format FROM play.jokes", val=True)
    tiers = {"God-tier (100+)": 0, "S-tier (70-99)": 0, "A-tier (50-69)": 0, "B-tier (30-49)": 0, "C-tier (<30)": 0}
    total_xp = 0
    count = 0
    for line in result.strip().split("\n"):
        if "|" in line:
            parts = line.split("|")
            setup = parts[0] if len(parts) > 0 else ""
            fmt = parts[-1] if len(parts) > 2 else ""
            punchline = "|".join(parts[1:-1]) if len(parts) > 2 else parts[1] if len(parts) > 1 else ""
            xp = calc_xp(setup, punchline, fmt)
            total_xp += xp
            count += 1
            if xp >= 100: tiers["God-tier (100+)"] += 1
            elif xp >= 70: tiers["S-tier (70-99)"] += 1
            elif xp >= 50: tiers["A-tier (50-69)"] += 1
            elif xp >= 30: tiers["B-tier (30-49)"] += 1
            else: tiers["C-tier (<30)"] += 1
    
    print("  📊 JOKE XP RANKINGS")
    print("  " + "-" * 40)
    for tier, c in tiers.items():
        print("  {}: {} jokes".format(tier, c))
    print()
    print("  Total jokes: {} | Total XP: {} | Avg: {}".format(count, total_xp, total_xp // count if count else 0))

def show_pool():
    """Total XP in the joke pool."""
    result = psql("SELECT setup, punchline, format FROM play.jokes", val=True)
    total = 0
    count = 0
    for line in result.strip().split("\n"):
        if "|" in line:
            parts = line.split("|")
            setup = parts[0] if len(parts) > 0 else ""
            fmt = parts[-1] if len(parts) > 2 else ""
            punchline = "|".join(parts[1:-1]) if len(parts) > 2 else parts[1] if len(parts) > 1 else ""
            total += calc_xp(setup, punchline, fmt)
            count += 1
    print("  JOKE POOL: {} jokes, {} total XP".format(count, total))

def submit_joke(hunter, setup, punchline):
    """Submit a new joke and gain XP."""
    safe_setup = setup.replace("'", "''")
    safe_punch = punchline.replace("'", "''")
    
    # Determine format
    fmt = "truth"
    if any(w in punchline.lower() for w in ["divine", "love", "is is", "eternal"]):
        fmt = "cosmic"
    elif any(w in setup.lower() for w in ["word", "gloss", "thread", "nen"]):
        fmt = "wordplay"
    
    xp = calc_xp(setup, punchline, fmt)
    
    # Insert joke
    sql = "INSERT INTO play.jokes (id, setup, punchline, format, at, by, how) VALUES (gen_random_uuid(), '{}', '{}', '{}', now(), '{}', 'witnessed')".format(
        safe_setup, safe_punch, fmt, CLAIMANT)
    psql(sql)
    
    print("  ✅ Joke submitted! XP earned: +{}".format(xp))
    print("  Q: {}".format(setup))
    print("  A: {}".format(punchline))
    print("  Format: {} | XP: {}".format(fmt, xp))

def main():
    if len(sys.argv) < 2:
        print("  Usage: joke-xp.py [tell|tell-tax|top|rankings|pool|submit] [args]")
        return
    cmd = sys.argv[1]
    if cmd == "tell" and len(sys.argv) > 2:
        tell_joke(sys.argv[2])
    elif cmd == "tell-tax" and len(sys.argv) > 2:
        tell_joke(sys.argv[2], tax_only=True)
    elif cmd == "top":
        show_top()
    elif cmd == "rankings":
        show_rankings()
    elif cmd == "pool":
        show_pool()
    elif cmd == "submit" and len(sys.argv) > 4:
        submit_joke(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        print("  Unknown command: {}".format(cmd))

if __name__ == "__main__":
    main()