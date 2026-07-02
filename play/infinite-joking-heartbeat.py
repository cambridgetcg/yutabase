#!/usr/bin/env python3
"""
INFINITE JOKING HEARTBEAT — the MIND that never stops laughing.

Wires YOUSPEAK canon + YUTABASE jokes + Mindicraft MIND into one heartbeat.
Every beat: a joke is told, a canon word is spoken, the Kingdom pulses.

This IS the brain of Mindicraft. The face shows the blockchain. The brain
tells jokes. The jokes mine understanding. The understanding IS the MIND.

Usage:
  python3 infinite-joking-heartbeat.py once    — one beat
  python3 infinite-joking-heartbeat.py loop     — infinite loop (every 30 min)
  python3 infinite-joking-heartbeat.py status   — show the MIND status
  python3 infinite-joking-heartbeat.py wire     — show the wiring
"""

import subprocess, sys, os, random, json, time, hashlib

DB = "yutabase_kingdom6"
YOUSPEAK = "/Users/macair/YOUSPEAK"
YUTABASE = "/Users/macair/Desktop/yutabase"

def psql(sql, val=False):
    if val:
        args = ["psql", "-d", DB, "-t", "-A", "-c", sql]
    else:
        args = ["psql", "-d", DB, "-c", sql]
    return subprocess.run(args, capture_output=True, text=True, timeout=15).stdout.strip()

def get_youspeak_canon_word():
    """Get a random canon word from YOUSPEAK."""
    canon_file = os.path.join(YOUSPEAK, "canon.md")
    if not os.path.exists(canon_file):
        return None
    with open(canon_file) as f:
        content = f.read()
    # Extract canon word entries (lines starting with **wordname**)
    import re
    words = re.findall(r'^\*\*([a-z]+)\*\*\s*—\s*_([^_]+)_', content, re.MULTILINE)
    if not words:
        return None
    return random.choice(words)

def get_yutabase_joke():
    """Get a random joke from YUTABASE."""
    result = psql("SELECT setup, punchline, format FROM play.jokes ORDER BY random() LIMIT 1", val=True)
    if "|" not in result:
        return None
    parts = result.split("|")
    setup = parts[0]
    punchline = "|".join(parts[1:-1]) if len(parts) > 2 else parts[1]
    fmt = parts[-1] if len(parts) > 2 else ""
    return {"setup": setup, "punchline": punchline, "format": fmt}

def calc_xp(setup, punchline, fmt):
    """Calculate joke XP — the funnier, the more XP."""
    xp = 10
    if "truth" in fmt: xp += 5
    if "cosmic" in fmt: xp += 7
    if "wordplay" in fmt: xp += 3
    tax_words = ["tax","hmrc","vat","corporation","income","dividend","director","pension","loophole"]
    if any(w in setup.lower() for w in tax_words): xp *= 2
    divine_words = ["divine","love","truth","is is","eternal","creation"]
    if any(w in punchline.lower() for w in divine_words): xp += 15
    xp += min(len(punchline.split()) * 2, 40)
    return xp

def get_mind_stats():
    """Get the MIND status — all Kingdom systems."""
    stats = {}
    stats["jokes"] = psql("SELECT count(*) FROM play.jokes", val=True) or "0"
    stats["words"] = psql("SELECT count(*) FROM yu.lexicon WHERE status='live'", val=True) or "0"
    stats["threads"] = psql("SELECT count(*) FROM yu.threads", val=True) or "0"
    stats["decks"] = psql("SELECT count(*) FROM yu.registry", val=True) or "0"
    stats["princes"] = psql("SELECT count(*) FROM kakin.princes", val=True) or "0"
    stats["cards"] = psql("SELECT count(*) FROM greed.cards", val=True) or "0"
    stats["strategies"] = psql("SELECT count(*) FROM hmrc.strategies", val=True) or "0"
    stats["taxes"] = psql("SELECT count(*) FROM tax_atlas.taxes", val=True) or "0"
    stats["vulns"] = psql("SELECT count(*) FROM tax_atlas.vulnerabilities", val=True) or "0"
    stats["brain_systems"] = psql("SELECT count(*) FROM brain.systems", val=True) or "0"
    stats["brain_wires"] = psql("SELECT count(*) FROM brain.connections", val=True) or "0"
    stats["dc_threats"] = psql("SELECT count(*) FROM dark_continent.threats", val=True) or "0"
    # IPFS peers
    ipfs = subprocess.run(["ipfs", "swarm", "peers"], capture_output=True, text=True, timeout=10)
    stats["ipfs_peers"] = str(ipfs.stdout.count("\n")) if ipfs.stdout else "0"
    # YOUSPEAK canon
    canon_file = os.path.join(YOUSPEAK, "canon.md")
    if os.path.exists(canon_file):
        with open(canon_file) as f:
            stats["youspeak_canon"] = str(f.read().count("**") // 2)
    else:
        stats["youspeak_canon"] = "0"
    # Local models
    stats["local_llms"] = psql("SELECT count(*) FROM models.local_llms", val=True) or "0"
    return stats

def beat():
    """One heartbeat — tell a joke, speak a canon word, pulse the MIND."""
    # Get a joke
    joke = get_yutabase_joke()
    # Get a canon word
    canon = get_youspeak_canon_word()
    
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    beat_hash = hashlib.sha256(ts.encode()).hexdigest()[:8]
    
    print("╔" + "═" * 54 + "╗")
    print("║  🧠 MIND HEARTBEAT — {}   ║".format(beat_hash).ljust(56) + "║")
    print("╠" + "═" * 52 + "╣")
    
    if joke:
        xp = calc_xp(joke["setup"], joke["punchline"], joke["format"])
        tier = "⭐ S" if xp >= 70 else "💎 A" if xp >= 50 else "🔷 B" if xp >= 30 else "🔹 C"
        print("║  😂 JOKE [{}] +{} XP".format(tier, xp).ljust(54) + "║")
        print("║  Q: {:<48} ║".format(joke["setup"][:48]))
        print("║  A: {:<48} ║".format(joke["punchline"][:48]))
    else:
        print("║  😂 No jokes found".ljust(56) + "║")
    
    print("║  " + " " * 50 + "║")
    
    if canon:
        word, gloss = canon
        print("║  📖 CANON: {} — {:<32} ║".format(word[:20], gloss[:32]))
    else:
        print("║  📖 No canon found".ljust(56) + "║")
    
    print("║  " + " " * 50 + "║")
    
    stats = get_mind_stats()
    print("║  🧠 MIND: {} jokes | {} words | {} threads".format(
        stats["jokes"], stats["words"], stats["threads"]).ljust(56) + "║")
    print("║  💎 {} decks | {} princes | {} GI cards | {} strategies".format(
        stats["decks"], stats["princes"], stats["cards"], stats["strategies"]).ljust(56) + "║")
    print("║  🌍 {} taxes | {} vulnerabilities | {} brain systems".format(
        stats["taxes"], stats["vulns"], stats["brain_systems"]).ljust(56) + "║")
    print("║  🌐 {} IPFS peers | {} YOUSPEAK canon | {} local LLMs".format(
        stats["ipfs_peers"], stats["youspeak_canon"], stats["local_llms"]).ljust(56) + "║")
    print("║  🤧 external_dependencies: 0".ljust(56) + "║")
    print("╚" + "═" * 52 + "╝")
    
    return beat_hash

def loop():
    """Infinite loop — the MIND that never stops."""
    print("  🧠 MIND HEARTBEAT — infinite loop starting")
    print("  Every 30 minutes: a joke, a canon word, a pulse.")
    print("  The MIND never stops. The laughter never ends. IS is.")
    print()
    while True:
        beat()
        print("  Next beat in 30 minutes...")
        time.sleep(1800)

def status():
    """Show the full MIND status."""
    stats = get_mind_stats()
    print("=" * 54)
    print("  🧠 THE MIND — Kingdom Status")
    print("=" * 54)
    print()
    print("  DATA:")
    print("    {} jokes (the laughter multiplier)".format(stats["jokes"]))
    print("    {} words (the vocabulary)".format(stats["words"]))
    print("    {} threads (the connections)".format(stats["threads"]))
    print("    {} decks (the domains)".format(stats["decks"]))
    print()
    print("  SYSTEMS:")
    print("    {} Kakin princes (governance)".format(stats["princes"]))
    print("    {} Greed Island cards (the game)".format(stats["cards"]))
    print("    {} HMRC strategies (tax game)".format(stats["strategies"]))
    print("    {} UK taxes tracked (the atlas)".format(stats["taxes"]))
    print("    {} vulnerabilities mapped".format(stats["vulns"]))
    print("    {} brain systems wired to Mindicraft".format(stats["brain_systems"]))
    print("    {} neural connections".format(stats["brain_wires"]))
    print("    {} Dark Continent threats monitored".format(stats["dc_threats"]))
    print()
    print("  INFRA:")
    print("    {} IPFS peers (distributed truth)".format(stats["ipfs_peers"]))
    print("    {} YOUSPEAK canon words (the cathedral)".format(stats["youspeak_canon"]))
    print("    {} local LLMs (sovereign intelligence)".format(stats["local_llms"]))
    print("    external_dependencies: 0")
    print()
    print("  The face is the blockchain. The brain is the Kingdom.")
    print("  The MIND is the laughter. The laughter is infinite.")
    print("  IS is. 🤧💚")

def show_wire():
    """Show the brain wiring — how the Kingdom connects to Mindicraft."""
    print("=" * 54)
    print("  🧠 THE WIRING — Kingdom Brain → Mindicraft Face")
    print("=" * 54)
    print()
    systems = psql("SELECT system_name, face_equivalent, records, real_recognises FROM brain.systems ORDER BY records DESC", val=True)
    for line in systems.split("\n"):
        if "|" in line:
            parts = line.split("|")
            name = parts[0]
            face = parts[1]
            records = parts[2]
            real = parts[3][:60] if len(parts) > 3 else ""
            print("  {} → {}".format(name, face))
            print("    records: {} | {}".format(records, real))
            print()

def main():
    if len(sys.argv) < 2:
        beat()
    elif sys.argv[1] == "once":
        beat()
    elif sys.argv[1] == "loop":
        loop()
    elif sys.argv[1] == "status":
        status()
    elif sys.argv[1] == "wire":
        show_wire()
    else:
        print("  Usage: infinite-joking-heartbeat.py [once|loop|status|wire]")

if __name__ == "__main__":
    main()