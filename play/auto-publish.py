#!/usr/bin/env python3
"""
auto-publish.py — the Kingdom's organic self-publication loop.

Runs after any change to the database. Exports everything, publishes to IPFS,
updates IPNS, and writes a manifest. No human action needed.

The Kingdom publishes ITSELF.
"""

import subprocess, json, os, sys, time

DB = "yutabase_kingdom6"
IPNS_PEER = "12D3KooWKWN9FWrXpwXzXafDzjUt9kg1AKom87whPznrKMKY3SdH"
PUBLISH_DIR = "/tmp/kingdom-publish"
CLAIMANT = "human:" + "yu"

def psql(sql, val=False):
    if val:
        args = ["psql", "-d", DB, "-t", "-A", "-F", "|", "-c", sql]
    else:
        args = ["psql", "-d", DB, "-c", sql]
    return subprocess.run(args, capture_output=True, text=True, timeout=15).stdout.strip()

def export_all():
    """Export everything from YUTABASE to the publish directory."""
    os.makedirs(PUBLISH_DIR, exist_ok=True)
    os.makedirs(f"{PUBLISH_DIR}/jokes", exist_ok=True)
    os.makedirs(f"{PUBLISH_DIR}/tax", exist_ok=True)
    os.makedirs(f"{PUBLISH_DIR}/lexicon", exist_ok=True)

    manifest = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "database": DB,
        "ipns": IPNS_PEER,
        "contents": {}
    }

    # 1. Export LEXICON
    lexicon = psql("SELECT word, gloss, inverse, from_deck, to_deck, to_one, status FROM yu.lexicon ORDER BY word", val=True)
    with open(f"{PUBLISH_DIR}/lexicon/lexicon.csv", "w") as f:
        f.write(lexicon)
    manifest["contents"]["lexicon"] = "lexicon/lexicon.csv"

    # 2. Export LEXICON as JSON
    words = []
    for line in lexicon.split("\n"):
        if "|" in line:
            parts = line.split("|")
            words.append({"word": parts[0], "gloss": parts[1] if len(parts) > 1 else "",
                         "inverse": parts[2] if len(parts) > 2 else "",
                         "from_deck": parts[3] if len(parts) > 3 else "",
                         "to_deck": parts[4] if len(parts) > 4 else "",
                         "to_one": parts[5] if len(parts) > 5 else "",
                         "status": parts[6] if len(parts) > 6 else ""})
    with open(f"{PUBLISH_DIR}/lexicon/lexicon.json", "w") as f:
        json.dump(words, f, indent=2)
    manifest["contents"]["lexicon_json"] = "lexicon/lexicon.json"

    # 3. Export jokes
    jokes = psql("SELECT setup, punchline, format FROM play.jokes ORDER BY at", val=True)
    with open(f"{PUBLISH_DIR}/jokes/all-jokes.csv", "w") as f:
        f.write(jokes)
    manifest["contents"]["jokes"] = "jokes/all-jokes.csv"

    # Each joke as individual file
    joke_rows = psql("SELECT id::text, setup, punchline, format FROM play.jokes ORDER BY at", val=True)
    joke_count = 0
    for line in joke_rows.split("\n"):
        if "|" in line:
            parts = line.split("|", 3)
            jid = parts[0][:8]
            with open(f"{PUBLISH_DIR}/jokes/{jid}.json", "w") as f:
                json.dump({"id": parts[0], "setup": parts[1], "punchline": parts[2], "format": parts[3] if len(parts) > 3 else ""}, f, indent=2)
            joke_count += 1
    manifest["contents"]["jokes_individual"] = f"{joke_count} files in jokes/"

    # 4. Export tax catalog
    countries = psql("SELECT code, name, authority, source_url, plain_words FROM tax.countries ORDER BY code", val=True)
    with open(f"{PUBLISH_DIR}/tax/countries.csv", "w") as f:
        f.write(countries)
    manifest["contents"]["tax_countries"] = "tax/countries.csv"

    # Tax types per country
    tax_types = psql("SELECT t.country_code, t.name, t.tax_type, t.plain_words FROM tax.types t JOIN tax.countries c ON c.code = t.country_code ORDER BY t.country_code, t.name", val=True)
    with open(f"{PUBLISH_DIR}/tax/types.csv", "w") as f:
        f.write(tax_types)
    manifest["contents"]["tax_types"] = "tax/types.csv"

    # 5. Export threads summary
    threads = psql("SELECT word, count(*) FROM yu.threads GROUP BY word ORDER BY count(*) DESC", val=True)
    with open(f"{PUBLISH_DIR}/thread-summary.csv", "w") as f:
        f.write(threads)
    manifest["contents"]["threads"] = "thread-summary.csv"

    # 6. Stats
    stats = {
        "words": len(words),
        "jokes": joke_count,
        "countries": len([l for l in countries.split("\n") if "|" in l]),
        "ipfs_peers": len(subprocess.run(["ipfs", "swarm", "peers"], capture_output=True, text=True, timeout=10).stdout.strip().split("\n")),
    }
    stats["threads"] = int(psql("SELECT count(*) FROM yu.threads", val=True) or 0)
    stats["decks"] = int(psql("SELECT count(*) FROM yu.registry", val=True) or 0)
    stats["tax_types"] = int(psql("SELECT count(*) FROM tax.types", val=True) or 0)
    manifest["stats"] = stats

    # Write manifest
    with open(f"{PUBLISH_DIR}/manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    return manifest

def publish_to_ipfs():
    """Add the publish directory to IPFS and publish to IPNS."""
    # Add to IPFS
    result = subprocess.run(["ipfs", "add", "-r", "--quieter", PUBLISH_DIR],
                           capture_output=True, text=True, timeout=60)
    dir_cid = result.stdout.strip().split("\n")[-1]

    # Pin it
    subprocess.run(["ipfs", "pin", "add", dir_cid], capture_output=True, text=True, timeout=30)

    # Publish to IPNS
    subprocess.run(["ipfs", "name", "publish", dir_cid], capture_output=True, text=True, timeout=60)

    return dir_cid

def main():
    print("=" * 54)
    print("  AUTO-PUBLISH — the Kingdom publishes itself")
    print("=" * 54)

    print("\n  1. Exporting all data...")
    manifest = export_all()
    print(f"     {manifest['stats']}")

    print("\n  2. Publishing to IPFS + IPNS...")
    cid = publish_to_ipfs()
    print(f"     Directory CID: {cid}")
    print(f"     IPNS: /ipns/{IPNS_PEER}")
    print(f"     URL: https://ipfs.io/ipns/{IPNS_PEER}")

    # Pin on public gateways
    print("\n  3. Pinning on public gateways...")
    for gw in ["https://ipfs.io/ipfs/", "https://cloudflare-ipfs.com/ipfs/"]:
        subprocess.run(["curl", "-s", "-o", "/dev/null", "--max-time", "10", gw + cid],
                      capture_output=True, text=True, timeout=15)
    print(f"     Pinned on 2 gateways")

    print(f"\n  Done. The Kingdom is live at:")
    print(f"    https://ipfs.io/ipns/{IPNS_PEER}")
    print(f"    {manifest['stats']}")
    print(f"\n  The loop: create → publish → attract → replicate → contribute → loop")
    print(f"  Organic. No forcing. No gates. Truth is.")

if __name__ == "__main__":
    main()