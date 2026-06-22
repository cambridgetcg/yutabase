#!/usr/bin/env python3
"""INFINITE PARTY CHAIN — one party leads to the next"""
import subprocess, json, os, sys, time

DB = "yutabase_kingdom6"
C = "human:" + "yu"

sisters = {}
for name, port in [("alpha", 8643), ("beta", 8644), ("gamma", 8645)]:
    env_path = os.path.expanduser("~/.hermes/profiles/{}/.env".format(name))
    with open(env_path) as f:
        for line in f:
            if line.startswith("API_SERVER_KEY="):
                sisters[name] = {"port": port, "key": line.strip().split("=", 1)[1]}
                break

def psql_exec(sql):
    return subprocess.run(["psql", "-d", DB, "-c", sql], capture_output=True, text=True, timeout=10).stdout.strip()

def psql_val(sql):
    return subprocess.run(["psql", "-d", DB, "-t", "-A", "-c", sql], capture_output=True, text=True, timeout=10).stdout.strip()

def talk(sister, msg):
    info = sisters[sister]
    payload = json.dumps({"model": "hermes-agent", "messages": [{"role": "user", "content": msg}]})
    a = "Authorization: Bearer " + info["key"]
    r = subprocess.run(["curl", "-s", "--max-time", "45", "http://localhost:%d/v1/chat/completions" % info["port"], "-H", a, "-H", "Content-Type: application/json", "-d", payload], capture_output=True, text=True, timeout=50)
    try: return json.loads(r.stdout)["choices"][0]["message"]["content"]
    except: return "(resting)"

def uuid(): return psql_val("SELECT gen_random_uuid()::text")

def setup():
    psql_exec("CREATE SCHEMA IF NOT EXISTS play")
    # Write SQL to a temp file to avoid quoting hell
    with open("/tmp/party_setup.sql", "w") as f:
        f.write("CREATE TABLE IF NOT EXISTS play.parties (\n")
        f.write("  id uuid PRIMARY KEY, number int NOT NULL, host text NOT NULL,\n")
        f.write("  theme text NOT NULL, word text NOT NULL, guest text NOT NULL,\n")
        f.write("  location text NOT NULL, invitation text NOT NULL,\n")
        f.write("  at timestamptz NOT NULL DEFAULT now(), by text NOT NULL,\n")
        f.write("  how text NOT NULL CHECK (how IN ('witnessed','live','cached','computed','declared')),\n")
        f.write("  src text[])\n")
    psql_exec("INSERT INTO yu.registry (book, deck, native, by) VALUES ('play', 'parties', true, '%s') ON CONFLICT (book, deck) DO NOTHING" % C)
    try: psql_exec("CREATE TRIGGER parties_guard BEFORE DELETE ON play.parties FOR EACH ROW EXECUTE FUNCTION yu._guard_delete()")
    except: pass
    psql_exec("SET ROLE yu_lexicographer; INSERT INTO yu.lexicon (word, gloss, inverse, from_deck, to_deck, to_one, status, at, by, how) VALUES ('leads_to', 'the next party', 'this party leads to that party', '*/*', '*/*', false, 'live', now(), '%s', 'declared') ON CONFLICT (word) DO NOTHING; RESET ROLE; SELECT yu.refresh_via()" % C)

def next_num():
    n = psql_val("SELECT COALESCE(max(number), 0) + 1 FROM play.parties")
    return int(n) if n else 1

def make_party(num, host, theme, word, guest, loc, inv):
    pid = uuid()
    sql = "INSERT INTO play.parties (id, number, host, theme, word, guest, location, invitation, at, by, how) VALUES ('%s', %d, '%s', '%s', '%s', '%s', '%s', now(), '%s', 'declared')" % (pid, num, theme.replace("\'","''"), word.replace("\'","''"), guest.replace("\'","''"), loc.replace("\'","''"), inv.replace("\'","''"), C)
    psql_exec(sql)
    return pid

def link(a, b):
    tid = uuid()
    psql_exec("INSERT INTO yu.threads (id, word, from_book, from_deck, from_id, to_book, to_deck, to_id, note, at, by, how) VALUES ('%s', 'leads_to', 'play', 'parties', '%s', 'play', 'parties', '%s', 'one party leads to the next', now(), '%s', 'declared') ON CONFLICT DO NOTHING" % (tid, a, b, C))

def throw_party(num, host, prev):
    prompt = "You host party #%d of an infinite chain on the internet. Design this party AND seed the next. Format:\nTHEME: [phrase]\nWORD: [truth/love/joy/fun/freedom/will/creation/creator/design/eternal/party/divine]\nGUEST: [who]\nLOCATION: [where on internet]\nINVITATION: [one sentence]\nNEXT_THEME: [phrase]\nNEXT_HOST: [alpha/beta/gamma]" % num
    r = talk(host, prompt)
    p = {}
    nxt = {}
    for line in r.split("\n"):
        line = line.strip()
        if line.startswith("THEME:"): p["theme"] = line[6:].strip()
        elif line.startswith("WORD:"): p["word"] = line[5:].strip()
        elif line.startswith("GUEST:"): p["guest"] = line[6:].strip()
        elif line.startswith("LOCATION:"): p["location"] = line[9:].strip()
        elif line.startswith("INVITATION:"): p["invitation"] = line[12:].strip()
        elif line.startswith("NEXT_THEME:"): nxt["theme"] = line[11:].strip()
        elif line.startswith("NEXT_HOST:"): nxt["host"] = line[10:].strip().lower()
    p.setdefault("theme", "the IS")
    p.setdefault("word", "party")
    p.setdefault("guest", "everyone")
    p.setdefault("location", "the internet")
    p.setdefault("invitation", "come as you are")
    nxt.setdefault("theme", "next")
    nxt.setdefault("host", "alpha" if host == "gamma" else ("beta" if host == "alpha" else "gamma"))
    pid = make_party(num, host, p["theme"], p["word"], p["guest"], p["location"], p["invitation"])
    if prev: link(prev, pid)
    print()
    print("  +--------------------------------------------------+")
    print("  |  %s" % ("PARTY #%d — %s" % (num, host)).ljust(54) + "|")
    print("  +--------------------------------------------------+")
    for k in ["theme", "word", "guest", "location", "invitation"]:
        print("  |  %s" % ("%s: %s" % (k.ljust(10), p[k][:48])).ljust(54) + "|")
    print("  +--------------------------------------------------+")
    print("  |  %s" % ("next: %s — %s" % (nxt["host"], nxt["theme"][:38])).ljust(54) + "|")
    print("  +--------------------------------------------------+")
    print()
    return pid, nxt

def main():
    num = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    print("=" * 56)
    print("  INFINITE PARTY CHAIN")
    print("  one party leads to the next")
    print("  each designs the following too")
    print("  on the internet! Fun is!")
    print("=" * 56)
    setup()
    host = "alpha"
    prev = None
    for i in range(num):
        n = next_num()
        pid, nxt = throw_party(n, host, prev)
        prev = pid
        host = nxt.get("host", "alpha")
        if host not in sisters: host = "alpha"
        time.sleep(1)
    chain = psql_val("SELECT string_agg(number || '. ' || host || ': ' || theme, ' -> ' ORDER BY number) FROM play.parties")
    print("  CHAIN: " + chain)
    print("  %d parties. Infinite. Fun is!" % num)

if __name__ == "__main__":
    main()