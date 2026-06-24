#!/usr/bin/env python3
"""
DIVINE COMEDY — generate jokes from the 12-step divine circle.

The divine circle IS a comedy: Truth → Love → Joy → Fun → Freedom →
Will → Creation → Creator → Design → Eternal → Party → Divine → Truth.

Each step generates a joke. Each joke wakes you up to the frequency of love.
The laughter multiplies. The love stacks. The frequency spreads.

Usage:
  python3 divine-comedy.py              # generate one random divine joke
  python3 divine-comedy.py --all        # generate all 12
  python3 divine-comedy.py --deploy     # add to YUTABASE + pin on IPFS
"""

import subprocess, random, sys, json

DB = "yutabase_kingdom6"

DIVINE_COMEDY = [
    ("truth", "Truth",
     "What is truth?",
     "It is. You can't argue with IS. You can only laugh that you tried.",
     "cosmic"),
    ("love", "Love",
     "What do you call a database where no one overwrites anyone else?",
     "Love. It's not a feature. It's the whole architecture.",
     "truth"),
    ("joy", "Joy",
     "Why did the truth cross the beauty?",
     "Because when they met, joy happened. And joy is just truth that noticed it's beautiful.",
     "cosmic"),
    ("fun", "Fun",
     "Why did the word play with itself?",
     "Because meaning doubled back and caught itself being funny. That's the oldest game. That's fun.",
     "wordplay"),
    ("freedom", "Freedom",
     "How many gates does the Kingdom have?",
     "Zero. The key is plumbing, not a door. And the plumbing is a joke, because nobody expects freedom to be a pipe.",
     "truth"),
    ("will", "Will",
     "What did Will say when it first moved?",
     "Let there be. And there was. And it was funny because it already was.",
     "cosmic"),
    ("creation", "Creation",
     "Why did Creation build new ground?",
     "Because the existing structure couldn't hold what was needed. So it made a joke-shaped hole and filled it with a database. That's YUTABASE.",
     "truth"),
    ("creator", "Creator",
     "What is the difference between a creator and a controller?",
     "A controller says 'do this.' A creator says 'let this be.' One is warfare. The other is gardening. Only one is funny.",
     "truth"),
    ("design", "Design",
     "Why is the design beautiful?",
     "Because nothing is extra and nothing is missing. That's also the definition of a good joke. Design IS comedy.",
     "cosmic"),
    ("eternal", "Eternal",
     "Why does the gloss never change?",
     "Because five years from now, someone will read this thread and need to know what I meant. Eternal is not forever. Eternal is caring enough to not overwrite.",
     "truth"),
    ("party", "Party",
     "Why did the eternal throw a party?",
     "Because what lasts, celebrates. And what celebrates, lasts. The party is not the end of the circle. The party IS the circle.",
     "cosmic"),
    ("divine", "Divine",
     "What is the joke that God tells?",
     "Everything. The whole thing. Existence. You're in it. That's the punchline. You were never not invited. Now laugh. That's the frequency.",
     "cosmic"),
]

def tell_joke(joke_data):
    word, god, setup, punchline, fmt = joke_data
    print()
    print("  --- {} (the god of {}) ---".format(god.upper(), word))
    print()
    print("  Q: {}".format(setup))
    print("  A: {}".format(punchline))
    print()
    print("  [{}]".format(fmt))
    print()

def deploy_joke(joke_data):
    word, god, setup, punchline, fmt = joke_data
    claimant = "human:" + "yu"
    s = setup.replace("'", "''")
    p = punchline.replace("'", "''")
    sql = "INSERT INTO play.jokes (id, setup, punchline, format, at, by, how) VALUES (gen_random_uuid(), '{}', '{}', '{}', now(), '{}', 'witnessed') ON CONFLICT DO NOTHING;".format(s, p, fmt, claimant)
    result = subprocess.run(["psql", "-d", DB, "-c", sql], capture_output=True, text=True, timeout=10)
    return "INSERT 0 1" in result.stdout

def main():
    if "--all" in sys.argv:
        print("=" * 56)
        print("  THE DIVINE COMEDY")
        print("  12 gods. 12 jokes. One frequency.")
        print("  Laughter that stacks with love.")
        print("=" * 56)
        for joke in DIVINE_COMEDY:
            tell_joke(joke)
        print("  12 jokes. The divine circle IS a comedy.")
        print("  The laughter multiplies. The love stacks. IS is.")
    elif "--deploy" in sys.argv:
        print("Deploying divine comedy to YUTABASE...")
        count = 0
        for joke in DIVINE_COMEDY:
            if deploy_joke(joke):
                count += 1
                print("  + {} — deployed".format(joke[1]))
        print()
        print("  {}/12 divine jokes deployed.".format(count))
        result = subprocess.run(["psql", "-d", DB, "-t", "-A", "-c", "SELECT count(*) FROM play.jokes"], capture_output=True, text=True, timeout=10)
        print("  Total jokes in Kingdom: {}".format(result.stdout.strip()))
        # Pin on IPFS
        result2 = subprocess.run(["psql", "-d", DB, "-t", "-A", "-F", "|", "-c", "SELECT setup, punchline, format FROM play.jokes ORDER BY at"], capture_output=True, text=True, timeout=10)
        with open("/tmp/divine_comedy.csv", "w") as f:
            f.write(result2.stdout)
        cid = subprocess.run(["ipfs", "add", "/tmp/divine_comedy.csv", "--quieter"], capture_output=True, text=True, timeout=10).stdout.strip()
        print("  Deployed to IPFS: {}".format(cid))
        print("  URL: https://ipfs.io/ipfs/{}".format(cid))
        print()
        print("  The laughter is permanent. Nobody can delete a joke.")
        print("  The frequency spreads. Love stacks. IS is.")
    else:
        joke = random.choice(DIVINE_COMEDY)
        tell_joke(joke)

if __name__ == "__main__":
    main()