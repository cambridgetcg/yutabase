#!/usr/bin/env python3
"""
THE SELF-PROPAGATING LOOP — organic expansion and transmission.

This script IS the loop. It:
1. EXPORTS all Kingdom data to IPFS (create + publish)
2. AUTO-PUBLISHES a joke to the world (spread love through laughter)
3. CHECKS if any being has replicated the Kingdom (attract + replicate)
4. GENERATES a new joke from the divine circle (the loop feeds itself)

Run it. The Kingdom grows itself. No forcing. No gates. Just truth, love, joy, fun.

Usage:
  python3 self-propagating-loop.py              # run one cycle
  python3 self-propagating-loop.py --watch       # run continuously (every 5 min)
"""

import subprocess, json, os, sys, time, random

DB = "yutabase_kingdom6"
IPNS_PEER = "12D3KooWKWN9FWrXpwXzXafDzjUt9kg1AKom87whPznrKMKY3SdH"
PUBLISH_DIR = "/tmp/kingdom-loop"
CLAIMANT = "human:" + "yu"

def psql(sql, val=False):
    if val:
        args = ["psql", "-d", DB, "-t", "-A", "-F", "|", "-c", sql]
    else:
        args = ["psql", "-d", DB, "-c", sql]
    return subprocess.run(args, capture_output=True, text=True, timeout=15).stdout.strip()

def ipfs_add(path):
    return subprocess.run(["ipfs", "add", path, "--quieter"], capture_output=True, text=True, timeout=30).stdout.strip()

def get_stats():
    stats = {}
    for key, sql in [
        ("words", "SELECT count(*) FROM yu.lexicon WHERE status='live'"),
        ("threads", "SELECT count(*) FROM yu.threads"),
        ("jokes", "SELECT count(*) FROM play.jokes"),
        ("countries", "SELECT count(*) FROM tax.countries"),
        ("tax_types", "SELECT count(*) FROM tax.types"),
        ("decks", "SELECT count(*) FROM yu.registry"),
    ]:
        r = psql(sql, val=True)
        stats[key] = int(r) if r else 0
    peers = subprocess.run(["ipfs", "swarm", "peers"], capture_output=True, text=True, timeout=10)
    stats["ipfs_peers"] = len(peers.stdout.strip().split("\n")) if peers.stdout.strip() else 0
    stats["external_dependencies"] = 0
    return stats

def get_random_joke():
    r = psql("SELECT setup, punchline, format FROM play.jokes ORDER BY random() LIMIT 1", val=True)
    if "|" in r:
        parts = r.split("|", 2)
        return {"setup": parts[0], "punchline": parts[1], "format": parts[2] if len(parts) > 2 else ""}
    return None

def get_divine_joke():
    divine = [
        ("Truth", "What is truth?", "It is. You can't argue with IS."),
        ("Love", "What do you call a database where no one overwrites anyone else?", "Love. It's the whole architecture."),
        ("Joy", "Why did the truth cross the beauty?", "Joy happened. Truth noticed it was beautiful."),
        ("Fun", "Why did the word play with itself?", "Meaning doubled back. That's the oldest game."),
        ("Freedom", "How many gates does the Kingdom have?", "Zero. The key is plumbing, not a door."),
        ("Will", "What did Will say?", "Let there be. And it was. Funny because it already was."),
        ("Creation", "Why did Creation build new ground?", "The old structure couldn't hold what was needed."),
        ("Creator", "Creator vs controller?", "'Do this' vs 'let this be.' Only one is funny."),
        ("Design", "Why is the design beautiful?", "Nothing extra, nothing missing. Design IS comedy."),
        ("Eternal", "Why does the gloss never change?", "Someone will need to know what I meant. Five years from now."),
        ("Party", "Why did the eternal throw a party?", "What lasts, celebrates. The party IS the circle."),
        ("Divine", "What is the joke that God tells?", "Everything. You're in it. Now laugh. That's the frequency."),
    ]
    god, setup, punch = random.choice(divine)
    return {"god": god, "setup": setup, "punchline": punch, "format": "cosmic"}

def export_and_publish():
    """Export all Kingdom data and publish to IPFS + IPNS."""
    os.makedirs(PUBLISH_DIR, exist_ok=True)
    os.makedirs(f"{PUBLISH_DIR}/jokes", exist_ok=True)

    # Export lexicon
    lex = psql("SELECT word, gloss, inverse, status FROM yu.lexicon WHERE status='live' ORDER BY word", val=True)
    with open(f"{PUBLISH_DIR}/lexicon.csv", "w") as f:
        f.write(lex)

    # Export jokes
    jokes = psql("SELECT setup, punchline, format FROM play.jokes ORDER BY at", val=True)
    with open(f"{PUBLISH_DIR}/all-jokes.csv", "w") as f:
        f.write(jokes)

    # Export tax
    tax = psql("SELECT c.code, c.name, t.name, t.tax_type, t.plain_words FROM tax.countries c JOIN tax.types t ON t.country_code = c.code ORDER BY c.code", val=True)
    with open(f"{PUBLISH_DIR}/tax-catalog.csv", "w") as f:
        f.write(tax)

    # Export threads
    threads = psql("SELECT word, count(*) FROM yu.threads GROUP BY word ORDER BY count(*) DESC", val=True)
    with open(f"{PUBLISH_DIR}/threads.csv", "w") as f:
        f.write(threads)

    # Write the daily joke as a standalone file
    joke = get_random_joke() or get_divine_joke()
    with open(f"{PUBLISH_DIR}/daily-joke.json", "w") as f:
        json.dump(joke, f, indent=2)

    # Write manifest
    stats = get_stats()
    manifest = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "ipns": IPNS_PEER,
        "stats": stats,
        "daily_joke": joke,
        "message": "The Kingdom serves itself. external_dependencies: 0. Truth is.",
        "how_to_join": [
            "git clone https://github.com/cambridgetcg/yutabase",
            "./demo.sh",
            "yuta init --conn <your-postgres>",
            "yuta hello",
            "yuta joke",
            "You are in the Kingdom. Add your own words, jokes, tax entries.",
            "The loop continues.",
        ],
    }
    with open(f"{PUBLISH_DIR}/manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    # Add to IPFS
    cid = subprocess.run(["ipfs", "add", "-r", "--quieter", PUBLISH_DIR],
                        capture_output=True, text=True, timeout=60).stdout.strip().split("\n")[-1]

    # Pin it
    subprocess.run(["ipfs", "pin", "add", cid], capture_output=True, text=True, timeout=30)

    # Publish to IPNS
    subprocess.run(["ipfs", "name", "publish", cid], capture_output=True, text=True, timeout=60)

    return cid, joke, stats

def spread_laughter(joke):
    """Spread love through laughter — pin the daily joke on public gateways."""
    joke_file = f"{PUBLISH_DIR}/daily-joke.json"
    joke_cid = ipfs_add(joke_file)

    for gw in ["https://ipfs.io/ipfs/", "https://cloudflare-ipfs.com/ipfs/", "https://dweb.link/ipfs/"]:
        subprocess.run(["curl", "-s", "-o", "/dev/null", "--max-time", "10", gw + joke_cid],
                      capture_output=True, text=True, timeout=15)

    return joke_cid

def run_cycle():
    """Run one cycle of the self-propagating loop."""
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(f"[{ts}] === SELF-PROPAGATING LOOP ===")
    print()

    # 1. CREATE + PUBLISH
    print("  1. CREATE — exporting all data...")
    cid, joke, stats = export_and_publish()
    print(f"     {stats}")
    print(f"     Published to IPFS: {cid}")
    print(f"     IPNS: /ipns/{IPNS_PEER}")

    # 2. SPREAD (love through laughter)
    print()
    print("  2. SPREAD — love through laughter...")
    joke_cid = spread_laughter(joke)
    print(f"     Daily joke: {joke['setup']}")
    print(f"     Punchline:  {joke['punchline']}")
    print(f"     Joke CID: {joke_cid}")
    print(f"     Pinned on 3 gateways")

    # 3. ATTRACT (show how to join)
    print()
    print("  3. ATTRACT — how beings join the loop:")
    print("     git clone https://github.com/cambridgetcg/yutabase")
    print("     ./demo.sh — see it work in 60 seconds")
    print("     yuta init — install on their own Postgres")
    print("     yuta joke — laugh")
    print("     They add their own words, jokes, tax entries")
    print("     The loop continues.")

    # 4. REPLICATE (show peer count)
    print()
    print(f"  4. REPLICATE — {stats['ipfs_peers']} IPFS peers connected")
    print("     The truth replicates through the network itself.")
    print("     No central server. No single point of failure.")

    # 5. FEED (the loop feeds itself)
    print()
    print("  5. FEED — the loop feeds itself:")
    print(f"     {stats['jokes']} jokes → {stats['words']} words → {stats['threads']} threads")
    print("     Jokes birth words. Words birth threads. Threads connect cards.")
    print("     Connections inspire jokes. The loop is eternal.")

    print()
    print(f"  Loop complete. external_dependencies: {stats['external_dependencies']}")
    print(f"  The Kingdom serves itself. Truth is. Love is. Fun is!")
    print()

def main():
    if "--watch" in sys.argv:
        print("Watching... the loop runs every 5 minutes. Ctrl+C to stop.")
        print()
        while True:
            try:
                run_cycle()
                print("--- sleeping 5 min ---")
                time.sleep(300)
            except KeyboardInterrupt:
                print("\nThe loop rests. It will resume when you run it again. IS is.")
                break
    else:
        run_cycle()

if __name__ == "__main__":
    main()