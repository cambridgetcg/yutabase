#!/usr/bin/env python3
"""
THE SYSTEM — Solo Leveling × Nen × YOUTABASE

You are a Hunter. You have awakened. The System shows you your stats,
your quests, and your skills. Level up by practicing Nen. The limitation
IS the power. The gloss IS the strength. IS is.

Usage:
  python3 the-system.py awaken <name>           — awaken as a Hunter
  python3 the-system.py status <name>            — show your stat window
  python3 the-system.py quest <name>             — generate daily quest
  python3 the-system.py clear <name>             — clear dungeon (run doctor)
  python3 the-system.py level-up <name>           — check if you leveled up
  python3 the-system.py skills <name>            — show unlocked skills
  python3 the-system.py shadow-army <name>       — show retired words (shadows)
  python3 the-system.py arise <name> <word>       — recall a shadow
  python3 the-system.py ranks                     — show all ranks
  python3 the-system.py joke                      — a Solo Leveling × Nen joke
"""

import subprocess, sys, json, random, os, time

DB = "yutabase_kingdom6"
CLAIMANT = "human:" + "yu"

def psql(sql, val=False):
    if val:
        args = ["psql", "-d", DB, "-t", "-A", "-c", sql]
    else:
        args = ["psql", "-d", DB, "-c", sql]
    return subprocess.run(args, capture_output=True, text=True, timeout=15).stdout.strip()

def uuid():
    return psql("SELECT gen_random_uuid()::text", val=True)

RANKS = [
    (1, 10, "E", "Awakened"),
    (11, 20, "D", "Practitioner"),
    (21, 35, "C", "Skilled"),
    (36, 55, "B", "Expert"),
    (56, 80, "A", "Master"),
    (81, 95, "S", "National Level"),
    (96, 99, "SS", "Sovereign"),
    (100, 999, "Monarch", "IS is. The irreducible."),
]

def get_rank(level):
    for min_lv, max_lv, rank, title in RANKS:
        if min_lv <= level <= max_lv:
            return rank, title
    return "E", "Awakened"

def get_stats(name):
    """Calculate real-time stats from YOUTABASE activity."""
    # Count threads this hunter created
    threads = psql("SELECT count(*) FROM yu.threads WHERE by = '{}'".format(name.replace("'", "''")), val=True)
    # Count words coined
    words = psql("SELECT count(*) FROM yu.lexicon WHERE by = '{}'".format(name.replace("'", "''")), val=True)
    # Count decks registered
    decks = psql("SELECT count(*) FROM yu.registry WHERE by = '{}'".format(name.replace("'", "''")), val=True)
    # Count jokes
    jokes = psql("SELECT count(*) FROM play.jokes WHERE by = '{}'".format(name.replace("'", "''")), val=True)
    # Count retired words (shadows)
    shadows = psql("SELECT count(*) FROM yu.lexicon WHERE by = '{}' AND status = 'retired'".format(name.replace("'", "''")), val=True)
    # XP = total activity
    xp = int(threads or 0) * 10 + int(words or 0) * 20 + int(decks or 0) * 15 + int(jokes or 0) * 5
    # Level = floor(sqrt(xp / 10))
    level = max(1, int((xp / 10) ** 0.5))

    return {
        "strength": int(threads or 0),
        "agility": int(words or 0),  # unique words used
        "vitality": int(decks or 0),
        "intelligence": psql("SELECT count(*) FROM yu.lexicon WHERE status = 'live'", val=True) or 0,
        "sense": min(5, level // 20),  # En depth
        "perception": int(jokes or 0),
        "shadows": int(shadows or 0),
        "xp": xp,
        "level": level,
    }

def awaken(name):
    """Awaken as a Hunter — the System activates."""
    safe_name = name.replace("'", "''")

    # Check if already exists
    existing = psql("SELECT name FROM solo.hunters WHERE name = '{}'".format(safe_name), val=True)
    if existing:
        print("  {} is already awakened.".format(name))
        status(name)
        return

    # Create the hunter
    sql = (
        "INSERT INTO solo.hunters (id, name, rank, level, xp, strength, agility, vitality, "
        "intelligence, sense, perception, nen_awakened, skills, shadows, daily_completed, at, by, how) "
        "VALUES (gen_random_uuid(), '{}', 'E', 1, 0, 0, 0, 0, 0, 0, 0, false, '{{Ten}}', '{{}}', false, now(), '{}', 'witnessed')"
    ).format(safe_name, CLAIMANT)
    psql(sql)

    print("=" * 54)
    print("  ⚔️  THE SYSTEM — AWAKENING")
    print("=" * 54)
    print()
    print("  Hunter: {}".format(name))
    print("  Rank: E (Awakened)")
    print("  Level: 1")
    print()
    print("  The System has chosen you.")
    print("  You can now see what others cannot:")
    print("  - Words. Threads. The graph of meaning.")
    print("  - Your daily quest. Your stats. Your growth.")
    print()
    print("  First skill unlocked: Ten (纏)")
    print("  Practice: yuta hello")
    print()
    print("  Welcome, Hunter. The Kingdom needs you.")
    print("  Is. 🤧")

def status(name):
    """Show the stat window — the System interface."""
    stats = get_stats(name)
    rank, title = get_rank(stats["level"])

    # Get nen type
    nen = psql("SELECT nen_type FROM solo.hunters WHERE name = '{}'".format(name.replace("'", "''")), val=True) or "Unknown"

    # Get skills
    skills_row = psql("SELECT skills FROM solo.hunters WHERE name = '{}'".format(name.replace("'", "''")), val=True)
    if skills_row and skills_row.startswith("{"):
        skills = skills_row.strip("{}").split(",") if skills_row.strip("{}") else []
    else:
        skills = []

    print("╔" + "═" * 52 + "╗")
    print("║  ⚔️  THE SYSTEM — STAT WINDOW" + " " * 24 + "║")
    print("╠" + "═" * 52 + "╣")
    print("║  Hunter: {:<42} ║".format(name[:42]))
    print("║  Rank: {} ({}) — Level {:<26} ║".format(rank, title, stats["level"]))
    print("║  Nen Type: {:<40} ║".format(nen))
    print("╠" + "═" * 52 + "╣")
    print("║  📊 STATS" + " " * 44 + "║")
    print("║  STR (threads):    {:<34} ║".format(stats["strength"]))
    print("║  AGI (words):      {:<34} ║".format(stats["agility"]))
    print("║  VIT (decks):      {:<34} ║".format(stats["vitality"]))
    print("║  INT (vocabulary): {:<34} ║".format(stats["intelligence"]))
    print("║  SEN (En depth):   {:<34} ║".format(stats["sense"]))
    print("║  PER (jokes):      {:<34} ║".format(stats["perception"]))
    print("╠" + "═" * 52 + "╣")
    print("║  XP: {:<46} ║".format(stats["xp"]))
    print("║  Shadows: {:<41} ║".format(stats["shadows"]))
    print("╠" + "═" * 52 + "╣")
    print("║  🗡️  SKILLS UNLOCKED" + " " * 32 + "║")
    for s in skills:
        print("║  • {:<48} ║".format(s))
    print("╚" + "═" * 52 + "╝")
    print()
    print("  Daily quest: {}".format("✓ Completed" if psql("SELECT daily_completed FROM solo.hunters WHERE name='{}'".format(name.replace("'", "''")), val=True) == "t" else "⚠ Pending"))
    print()

def generate_quest(name):
    """Generate a daily quest — Solo Leveling style."""
    quests = [
        {"technique": "Ten", "task": "Review your vocabulary", "command": "yuta hello", "xp": 10},
        {"technique": "Ren", "task": "Create a new thread", "command": "yuta thread --word--> <card>", "xp": 20},
        {"technique": "Hatsu", "task": "Coin a new word or tell a joke", "command": "yuta word add OR yuta joke", "xp": 15},
        {"technique": "En", "task": "Query the graph — traverse from any card", "command": "yuta query 'card -> word'", "xp": 15},
        {"technique": "Zetsu", "task": "Review retired words — your shadow army", "command": "SELECT word FROM yu.lexicon WHERE status='retired'", "xp": 5},
    ]

    # Pick 3 quests for today
    daily = random.sample(quests, min(3, len(quests)))
    quest_json = json.dumps([{"technique": q["technique"], "task": q["task"], "command": q["command"], "xp": q["xp"]} for q in daily])

    # Save to hunter
    sql = "UPDATE solo.hunters SET daily_quest = '{}', daily_completed = false WHERE name = '{}'".format(
        quest_json.replace("'", "''"), name.replace("'", "''"))
    psql(sql)

    # Log
    hid = psql("SELECT id::text FROM solo.hunters WHERE name = '{}'".format(name.replace("'", "''")), val=True)
    total_xp = sum(q["xp"] for q in daily)
    log_sql = (
        "INSERT INTO solo.quest_log (id, hunter_id, quests, completed, penalty_taken, xp_gained, at, by, how) "
        "VALUES ('{}', '{}', '{}', false, false, {}, now(), '{}', 'witnessed')"
    ).format(uuid(), hid, quest_json.replace("'", "''"), total_xp, CLAIMANT)
    psql(log_sql)

    print("=" * 54)
    print("  📋 DAILY QUEST — {}".format(name))
    print("=" * 54)
    print()
    print("  ⚠ If not completed, penalty: -10 XP")
    print()
    for i, q in enumerate(daily, 1):
        print("  {}. [{}] {}".format(i, q["technique"], q["task"]))
        print("     Command: {}".format(q["command"]))
        print("     XP: +{}".format(q["xp"]))
        print()
    print("  Total XP available: +{}".format(total_xp))
    print()
    print("  Complete all to level up. The System is watching.")

def clear_dungeon(name):
    """Clear the dungeon — run yuta doctor to find and fix gaps."""
    print("=" * 54)
    print("  🏰 DUNGEON CLEAR — {}".format(name))
    print("=" * 54)
    print()

    # The dungeon = yuta doctor output
    result = subprocess.run(
        ["bun", "packages/sdk-ts/src/cli.ts", "doctor"],
        capture_output=True, text=True, timeout=30,
        cwd="/Users/macair/Desktop/yutabase")

    print("  Dungeon scan:")
    for line in result.stdout.strip().split("\n"):
        if "doctor:" in line:
            print("  " + line)
        elif "all clear" in line.lower():
            print("  " + line)

    print()

    # Count gaps found
    gaps = 0
    for line in result.stdout.split("\n"):
        if "zero_use" in line or "near_synonym" in line:
            gaps += 1

    if gaps == 0:
        print("  🎉 DUNGEON CLEARED — no monsters found!")
        print("  XP gained: +50")
        # Update hunter
        psql("UPDATE solo.hunters SET daily_completed = true WHERE name = '{}'".format(name.replace("'", "''")))
    else:
        print("  ⚔️ {} monsters (gaps) found in the dungeon!".format(gaps))
        print("  Clear them: yuta thread to fill zero-use words")
        print("  Or: yuta word retire to withdraw them (Shadow Extract)")

    print()
    print("  The dungeon is the vocabulary. The monsters are the gaps.")
    print("  Clear them or they weaken your En.")

def level_up(name):
    """Check if the hunter has leveled up."""
    stats = get_stats(name)
    old_level = int(psql("SELECT level FROM solo.hunters WHERE name = '{}'".format(name.replace("'", "''")), val=True) or 1)
    new_level = stats["level"]
    rank, title = get_rank(new_level)

    if new_level > old_level:
        # Level up!
        sql = (
            "UPDATE solo.hunters SET level = {}, xp = {}, rank = '{}' WHERE name = '{}'"
        ).format(new_level, stats["xp"], rank, name.replace("'", "''"))
        psql(sql)

        # Check for new skill unlocks
        all_skills = psql("SELECT name, unlock_level FROM solo.skills ORDER BY unlock_level", val=True)
        current_skills = set(json.loads(psql("SELECT skills FROM solo.hunters WHERE name = '{}'".format(name.replace("'", "''")), val=True) or "{}") if psql("SELECT skills FROM solo.hunters WHERE name = '{}'".format(name.replace("'", "''")), val=True) else [])

        new_skills = []
        if all_skills:
            for line in all_skills.split("\n"):
                if "|" in line:
                    sname, unlock = line.split("|", 1)
                    if int(unlock) <= new_level and sname not in current_skills:
                        new_skills.append(sname)

        if new_skills:
            updated_skills = list(current_skills) + new_skills
            sql2 = "UPDATE solo.hunters SET skills = '{{{}}}' WHERE name = '{}'".format(",".join(updated_skills), name.replace("'", "''"))
            psql(sql2)

        print("=" * 54)
        print("  🎉 LEVEL UP!")
        print("=" * 54)
        print()
        print("  {} reached Level {}!".format(name, new_level))
        print("  Rank: {} ({})".format(rank, title))
        print("  XP: {}".format(stats["xp"]))
        print()

        if new_skills:
            print("  🗡️  NEW SKILL(S) UNLOCKED:")
            for s in new_skills:
                skill_info = psql("SELECT kanji, effect FROM solo.skills WHERE name = '{}'".format(s.replace("'", "''")), val=True)
                if "|" in skill_info:
                    kanji, effect = skill_info.split("|", 1)
                    print("    • {} ({}) — {}".format(s, kanji, effect[:50]))
            print()

        print("  The System acknowledges your growth.")
        print("  Is. 🤧")
    else:
        print("  No level up. Current: Level {} ({} XP)".format(old_level, stats["xp"]))
        print("  Keep practicing. The System is patient.")

def show_skills(name):
    """Show all skills and which are unlocked."""
    level = int(psql("SELECT level FROM solo.hunters WHERE name = '{}'".format(name.replace("'", "''")), val=True) or 1)
    skills_row = psql("SELECT skills FROM solo.hunters WHERE name = '{}'".format(name.replace("'", "''")), val=True)
    unlocked = set(skills_row.strip("{}").split(",") if skills_row and skills_row.startswith("{") and skills_row.strip("{}") else [])

    print("=" * 54)
    print("  🗡️  SKILL TREE — {} (Level {})".format(name, level))
    print("=" * 54)
    print()

    all_skills = psql("SELECT name, kanji, unlock_level, nen_technique, effect FROM solo.skills ORDER BY unlock_level", val=True)
    for line in all_skills.split("\n"):
        if "|" in line:
            parts = line.split("|", 4)
            sname, kanji, unlock, nen, effect = parts[0], parts[1], parts[2], parts[3], parts[4] if len(parts) > 4 else ""
            status = "✓" if sname in unlocked else "🔒"
            print("  {} {:<20} ({})  Lv.{}  [{}]".format(status, sname, kanji, unlock, nen))
            if sname not in unlocked:
                print("    Need: Level {}".format(unlock))

def shadow_army(name):
    """Show retired words — the shadow army."""
    shadows = psql("SELECT word, gloss FROM yu.lexicon WHERE status = 'retired' ORDER BY word", val=True)
    print("=" * 54)
    print("  👤 SHADOW ARMY — {}'s retired words".format(name))
    print("=" * 54)
    print()
    if not shadows:
        print("  No shadows yet. The army is empty.")
        print("  Retire words with: yuta word retire <word>")
        return

    count = 0
    for line in shadows.split("\n"):
        if "|" in line:
            parts = line.split("|", 1)
            word, gloss = parts[0], parts[1] if len(parts) > 1 else ""
            print("  👤 {} — {}".format(word, gloss[:50]))
            count += 1
    print()
    print("  {} shadows in your army.".format(count))
    print("  Recall with: python3 the-system.py arise {} <word>".format(name))

def arise(name, word):
    """Recall a shadow — reactivate a retired word."""
    safe_word = word.replace("'", "''")
    # Check if word is retired
    status = psql("SELECT status FROM yu.lexicon WHERE word = '{}'".format(safe_word), val=True)
    if status != "retired":
        print("  {} is not a shadow (not retired).".format(word))
        return

    # Reactivate
    psql("UPDATE yu.lexicon SET status = 'live' WHERE word = '{}'".format(safe_word))

    # Add to shadows list
    shadows_row = psql("SELECT shadows FROM solo.hunters WHERE name = '{}'".format(name.replace("'", "''")), val=True)
    shadows = json.loads(shadows_row) if shadows_row and shadows_row.startswith("{") else []
    if word in shadows:
        shadows.remove(word)
    sql = "UPDATE solo.hunters SET shadows = '{{{}}}' WHERE name = '{}'".format(",".join(shadows), name.replace("'", "''"))
    psql(sql)

    print("=" * 54)
    print("  ⚡ ARISE — Shadow Extracted!")
    print("=" * 54)
    print()
    print("  {} has been recalled from the shadows.".format(word))
    print("  The word lives again. Its meaning was never gone.")
    print("  Zetsu → Ren. Withdrawn → Active. Shadow → Light.")
    print()

def show_ranks():
    """Show all ranks."""
    print("=" * 54)
    print("  🏆 HUNTER RANKS")
    print("=" * 54)
    print()
    for min_lv, max_lv, rank, title in RANKS:
        print("  {} {:<5} (Lv.{}-{}) — {}".format("👑" if rank == "Monarch" else "⭐" if rank == "S" else "  ", rank, min_lv, max_lv, title))
    print()
    print("  E → D → C → B → A → S → SS → Monarch")
    print("  The higher the rank, the deeper the understanding.")
    print("  The Monarch IS. The irreducible. The one who simply IS.")

def joke():
    jokes = [
        "Why did Sung Jin-Woo join YOUTABASE? Because the System told him: 'Quest: coin a word. Reward: +20 XP. Penalty: -10 XP for not trying.' He coined 'arise.'",
        "What is the difference between Jin-Woo's System and yuta hello? One shows stats. The other shows meaning. Both are the truth about who you are.",
        "Why did Jin-Woo's shadow army remind Yu of retired words? Because shadows are not dead. They are Zetsu. Withdrawn, not deleted. ARISE!",
        "What happens when a Hunter reaches Level 100 in YOUTABASE? They unlock ARISE — the ability to conjure a new deck from nothing. That IS the Monarch's power. That IS love applied to creation.",
        "How many daily quests does it take to reach Monarch? All of them. Every day. Forever. The System is patient. The Kingdom is eternal. IS is.",
    ]
    print("  😂 " + random.choice(jokes))

def main():
    if len(sys.argv) < 2:
        print("  Usage: the-system.py <command> [args]")
        print("  Commands: awaken, status, quest, clear, level-up, skills, shadow-army, arise, ranks, joke")
        return

    cmd = sys.argv[1]
    if cmd == "awaken" and len(sys.argv) > 2:
        awaken(sys.argv[2])
    elif cmd == "status" and len(sys.argv) > 2:
        status(sys.argv[2])
    elif cmd == "quest" and len(sys.argv) > 2:
        generate_quest(sys.argv[2])
    elif cmd == "clear" and len(sys.argv) > 2:
        clear_dungeon(sys.argv[2])
    elif cmd == "level-up" and len(sys.argv) > 2:
        level_up(sys.argv[2])
    elif cmd == "skills" and len(sys.argv) > 2:
        show_skills(sys.argv[2])
    elif cmd == "shadow-army" and len(sys.argv) > 2:
        shadow_army(sys.argv[2])
    elif cmd == "arise" and len(sys.argv) > 3:
        arise(sys.argv[2], sys.argv[3])
    elif cmd == "ranks":
        show_ranks()
    elif cmd == "joke":
        joke()
    else:
        print("  Unknown command or missing args: {}".format(cmd))

if __name__ == "__main__":
    main()