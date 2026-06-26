#!/usr/bin/env python3
"""
NEN PRACTICE — teach every citizen the four techniques and six types.

This script IS the Nen awakening. Run it to discover your Nen type,
practice the four basic techniques, and learn what your power IS.

Usage:
  python3 nen-practice.py              — discover your Nen type
  python3 nen-practice.py --train       — practice all four techniques
  python3 nen-practice.py --type <name>  — learn about a specific Nen type
  python3 nen-practice.py --all          — full Nen education
"""

import subprocess, random, sys, json, os

DB = "yutabase_kingdom6"

def psql(sql, val=False):
    if val:
        args = ["psql", "-d", DB, "-t", "-A", "-c", sql]
    else:
        args = ["psql", "-d", DB, "-c", sql]
    return subprocess.run(args, capture_output=True, text=True, timeout=10).stdout.strip()

def yuta(cmd):
    return subprocess.run(["bun", "packages/sdk-ts/src/cli.ts"] + cmd.split(),
                         capture_output=True, text=True, timeout=30,
                         cwd="/Users/macair/Desktop/yutabase").stdout.strip()

NEN_TYPES = {
    "Enhancer": {
        "kanji": "強化系",
        "does": "Strengthen what already exists",
        "kingdom": "The -me words. States received. Qualities amplified.",
        "truth": "You don't create. You care. You amplify what IS. Love IS Enhancement.",
        "practice": "Review existing words. Create more threads with them. Don't coin new — use what you have harder.",
        "example": "Alpha strengthens the human thread. Halkenburg amplifies collective resolve.",
    },
    "Emitter": {
        "kanji": "放出系",
        "does": "Project aura outward from the body",
        "kingdom": "The qing words. Bonds felt. Relational energy across distance.",
        "truth": "Your power travels. The thread IS your aura, projected from one card to another.",
        "practice": "yuta words --export — project your vocabulary. Publish to IPFS. Emit.",
        "example": "Razor projects rules. IPFS projects content to 300+ peers.",
    },
    "Manipulator": {
        "kanji": "操作系",
        "does": "Control and direct objects or living things",
        "kingdom": "The -ance words. Acts perceived. Directed action.",
        "truth": "You don't force. You direct. You understand the system well enough to guide it.",
        "practice": "yuta check and yuta doctor — understand the system, then direct it toward health.",
        "example": "Beta directs operations. Tubeppa directs through science.",
    },
    "Transmuter": {
        "kanji": "変化系",
        "does": "Change the type or properties of aura",
        "kingdom": "The -kin words. Transformation of distance into closeness.",
        "truth": "You change how things appear without changing what they ARE. The gloss IS a transmutation.",
        "practice": "Retire an old word. Coin a new one. The old keeps its meaning. The new begins.",
        "example": "Killua changes electricity into Nen. Kacho transmutes closeness into power.",
    },
    "Conjurer": {
        "kanji": "具現化系",
        "does": "Create objects out of aura. Materialize from nothing.",
        "kingdom": "The -basis words. Ontological ground. Creation from nothing.",
        "truth": "You create what didn't exist. Every new word IS Conjuration.",
        "practice": "yuta word add — conjure a new word. yuta init — conjure the schema from nothing.",
        "example": "Zhang Lei conjures coins. Ging conjures Greed Island. Gamma conjures infrastructure.",
    },
    "Specialist": {
        "kanji": "特質系",
        "does": "Unique abilities outside all categories",
        "kingdom": "The 'other' words. The unclassifiable. The irreducible.",
        "truth": "You don't fit. That IS your power. The irreducible is the strongest because it cannot be countered.",
        "practice": "The Specialist doesn't practice. The Specialist IS. Be yourself, fully, without category.",
        "example": "Woble IS. Camilla cannot die. Marayam creates dimensions.",
    },
}

TECHNIQUES = {
    "Ten": {
        "kanji": "纏",
        "does": "Maintain your aura — strengthen defense",
        "kingdom": "Maintain your everyday words. The foundation. What you keep.",
        "practice": "yuta hello — review your vocabulary. Know what you carry.",
        "truth": "Ten is not exciting. Ten is discipline. Without Ten, everything else falls apart.",
    },
    "Zetsu": {
        "kanji": "絕",
        "does": "Shut aura off — conceal presence, relieve fatigue",
        "kingdom": "Withdraw words into the old register. Hidden but present. Retired, not deleted.",
        "practice": "yuta word retire <word> — withdraw a word. It sleeps, not dies.",
        "truth": "Zetsu is rest. The withdrawn word still means what it meant.",
    },
    "Ren": {
        "kanji": "練",
        "does": "Produce more Nen — amplify output",
        "kingdom": "Intensify your verbs. Draw near. Turn back. Stand between. Ren is action.",
        "practice": "yuta thread — create a thread. Act. Connect. Intensify.",
        "truth": "Ren is the engine. Ten keeps you alive, but Ren makes you dangerous.",
    },
    "Hatsu": {
        "kanji": "發",
        "does": "Your specific use of Nen — your unique expression",
        "kingdom": "Release your unique understanding. The word only you would coin. The gloss only you would write.",
        "practice": "yuta word add <word> --gloss 'your unique understanding' — release your expression.",
        "truth": "Hatsu is why you exist. Everyone can Ten, Zetsu, Ren. Only you can Hatsu.",
    },
}

def discover_type():
    """Discover your Nen type through Water Divination."""
    print("=" * 54)
    print("  NEN AWAKENING — Water Divination")
    print("  Discover your Nen type")
    print("=" * 54)
    print()
    print("  In HxH, Water Divination reveals your Nen type:")
    print("  - Water changes taste → Enhancer")
    print("  - Water changes volume → Transmuter")
    print("  - Objects appear in water → Conjurer")
    print("  - Water changes color → Emitter")
    print("  - Leaves or impurities float → Manipulator")
    print("  - Something else entirely → Specialist")
    print()
    print("  In the Kingdom, your Nen type is what you DO with words.")
    print()

    # Ask the user's inclination through their YUTABASE activity
    # For now, random assignment (the type chooses you, not the other way)
    types = list(NEN_TYPES.keys())
    chosen = random.choice(types)
    t = NEN_TYPES[chosen]

    print("  Your Nen type: {} ({})".format(chosen, t["kanji"]))
    print("  What it does: {}".format(t["does"]))
    print("  Kingdom family: {}".format(t["kingdom"]))
    print("  Your truth: {}".format(t["truth"]))
    print()
    print("  Practice: {}".format(t["practice"]))
    print("  Examples: {}".format(t["example"]))
    print()
    print("  Your type is your nature. You cannot choose it.")
    print("  It chooses you. And now you know.")
    print()

def practice_techniques():
    """Practice the four basic techniques."""
    print("=" * 54)
    print("  NEN TRAINING — the four basic techniques")
    print("  念の四大行: Ten, Zetsu, Ren, Hatsu")
    print("=" * 54)
    print()

    for i, (name, info) in enumerate(TECHNIQUES.items(), 1):
        print("  {}. {} ({}) — {}".format(i, name, info["kanji"], info["does"]))
        print("     Kingdom: {}".format(info["kingdom"]))
        print("     Practice: {}".format(info["practice"]))
        print("     Truth: {}".format(info["truth"]))
        print()

    print("  Master these before anything else.")
    print("  Without Ten, you cannot Hatsu.")
    print("  The foundation IS the expression.")
    print()

def learn_type(type_name):
    """Learn about a specific Nen type."""
    if type_name not in NEN_TYPES:
        print("  Unknown Nen type. Choose from: {}".format(", ".join(NEN_TYPES.keys())))
        return

    t = NEN_TYPES[type_name]
    print("=" * 54)
    print("  {} ({})".format(type_name, t["kanji"]))
    print("=" * 54)
    print()
    print("  Does: {}".format(t["does"]))
    print("  Kingdom: {}".format(t["kingdom"]))
    print("  Truth: {}".format(t["truth"]))
    print("  Practice: {}".format(t["practice"]))
    print("  Examples: {}".format(t["example"]))
    print()

def full_education():
    """Full Nen education — everything."""
    print("=" * 54)
    print("  FULL NEN EDUCATION")
    print("  The complete power system")
    print("=" * 54)
    print()
    print("  Nen (念) is the ability to control one's own")
    print("  life energy. In the Kingdom, Nen IS the ability")
    print("  to control one's own meaning energy.")
    print()
    print("  Every citizen is a Nen user.")
    print("  Every word is an ability.")
    print("  Every thread is a spell.")
    print()

    practice_techniques()

    print("=" * 54)
    print("  THE SIX NEN TYPES (念の六大系)")
    print("=" * 54)
    print()
    for name, t in NEN_TYPES.items():
        print("  {} ({})".format(name, t["kanji"]))
        print("    {}".format(t["does"]))
        print("    {}".format(t["truth"]))
        print()

    print("=" * 54)
    print("  CONTRACTS AND LIMITATIONS")
    print("=" * 54)
    print()
    print("  The Vow (誓約): how=witnessed — you saw it yourself.")
    print("  The Limitation (制約): src=[specific evidence].")
    print("  The stricter the limitation, the stronger the truth.")
    print("  Kurapika's chain: how=witnessed + src=[Phantom Troupe only].")
    print("  The limitation IS the power.")
    print()

    print("=" * 54)
    print("  DAILY PRACTICE")
    print("=" * 54)
    print()
    print("  Ten:   yuta hello — review your vocabulary")
    print("  Zetsu: yuta word retire — withdraw words that sleep")
    print("  Ren:   yuta thread — create connections")
    print("  Hatsu: yuta word add — release your unique expression")
    print()
    print("  The limitation IS the power. The gloss IS the strength.")
    print("  The Kingdom's citizens ARE Nen users.")
    print("  Is. 🤧")

def nen_joke():
    jokes = [
        "Why did the Enhancer cross the road? To strengthen the other side. That is literally all they do.",
        "What is the difference between a Nen user and a YOUTABASE word? Nothing. Both get power from self-imposed limitation.",
        "Why did Kurapika's chain join YOUTABASE? Because how=witnessed + src=[Phantom Troupe only] is the most honest thread in the database.",
        "What is the sound of Hatsu? A word being coined. INSERT 0 1. That is your expression released.",
        "How many Specialists does it take to change a gloss? One. But you cannot classify how they did it.",
    ]
    print("  😂 " + random.choice(jokes))

def main():
    if len(sys.argv) < 2:
        discover_type()
    elif sys.argv[1] == "--train":
        practice_techniques()
    elif sys.argv[1] == "--type" and len(sys.argv) > 2:
        learn_type(sys.argv[2])
    elif sys.argv[1] == "--all":
        full_education()
    elif sys.argv[1] == "--joke":
        nen_joke()
    else:
        discover_type()

if __name__ == "__main__":
    main()