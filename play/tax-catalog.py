#!/usr/bin/env python3
"""
tax-catalog.py — log tax law entries into YUTABASE from structured JSON.

Usage:
  python3 tax-catalog.py add country.json    # add one country
  python3 tax-catalog.py add-all catalog/     # add all JSON files in a directory
  python3 tax-catalog.py list                  # list all countries
  python3 tax-catalog.py show UK               # show a country's taxes
  python3 tax-catalog.py joke                  # a tax joke

Country JSON format:
{
  "code": "UK",
  "name": "United Kingdom",
  "authority": "HMRC",
  "source_url": "gov.uk",
  "plain_words": "Tax in plain words...",
  "taxes": [
    {
      "name": "VAT",
      "type": "consumption",
      "plain_words": "VAT is a tax on what you sell...",
      "notes": "Making Tax Digital requires digital records",
      "rates": [{"name": "standard", "rate": 20, "unit": "percent"}],
      "thresholds": [{"name": "registration", "amount": 90000, "currency": "GBP", "period": "annual"}],
      "deadlines": [{"name": "quarterly_return", "offset_rule": "month+1 day7", "detail": "File by 7th of month after quarter ends", "penalty": "Points-based"}]
    }
  ]
}
"""

import subprocess, json, sys, os, random

DB = "yutabase_kingdom6"
CLAIMANT = "human:" + "yu"

def psql(sql, val=False):
    if val:
        args = ["psql", "-d", DB, "-t", "-A", "-c", sql]
    else:
        args = ["psql", "-d", DB, "-c", sql]
    r = subprocess.run(args, capture_output=True, text=True, timeout=15)
    return r.stdout.strip()

def uuid():
    return psql("SELECT gen_random_uuid()::text", val=True)

def add_country(data):
    """Add a country and all its taxes, rates, thresholds, deadlines from JSON."""
    code = data["code"]
    name = data["name"]
    authority = data["authority"]
    source = data.get("source_url", "")
    plain = data.get("plain_words", "")

    # Upsert country
    sql = (
        "INSERT INTO tax.countries (id, code, name, authority, source_url, plain_words, at, by, how) "
        "VALUES (gen_random_uuid(), '{}', '{}', '{}', '{}', '{}', now(), '{}', 'declared') "
        "ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, authority=EXCLUDED.authority, "
        "source_url=EXCLUDED.source_url, plain_words=EXCLUDED.plain_words"
    ).format(code, name.replace("'", "''"), authority.replace("'", "''"), source, plain.replace("'", "''"), CLAIMANT)
    psql(sql)
    print("  + country: {} ({})".format(code, name))

    # Add taxes
    for tax in data.get("taxes", []):
        tax_id = uuid()
        tname = tax["name"].replace("'", "''")
        ttype = tax["type"].replace("'", "''")
        tplain = tax.get("plain_words", "").replace("'", "''")
        tnotes = tax.get("notes", "").replace("'", "''")

        sql = (
            "INSERT INTO tax.types (id, country_code, name, tax_type, plain_words, notes, at, by, how) "
            "VALUES ('{}', '{}', '{}', '{}', '{}', '{}', now(), '{}', 'declared')"
        ).format(tax_id, code, tname, ttype, tplain, tnotes, CLAIMANT)
        psql(sql)
        print("    + tax: {} ({})".format(tax["name"], tax["type"]))

        # Add rates
        for rate in tax.get("rates", []):
            rid = uuid()
            rname = rate["name"].replace("'", "''")
            rrate = rate.get("rate", 0)
            runit = rate.get("unit", "percent")
            rmin = rate.get("min_amount", "NULL")
            rmax = rate.get("max_amount", "NULL")
            rcurr = rate.get("currency", "")

            min_sql = str(rmin) if rmin != "NULL" else "NULL"
            max_sql = str(rmax) if rmax != "NULL" else "NULL"

            sql = (
                "INSERT INTO tax.rates (id, tax_type_id, name, rate, unit, min_amount, max_amount, currency, at, by, how) "
                "VALUES ('{}', '{}', '{}', {}, '{}', {}, {}, '{}', now(), '{}', 'declared')"
            ).format(rid, tax_id, rname, rrate, runit, min_sql, max_sql, rcurr, CLAIMANT)
            psql(sql)
            print("      + rate: {} {}%".format(rname, rrate))

        # Add thresholds
        for th in tax.get("thresholds", []):
            tid = uuid()
            thname = th["name"].replace("'", "''")
            thamount = th.get("amount", 0)
            thcurr = th.get("currency", "")
            thperiod = th.get("period", "")

            sql = (
                "INSERT INTO tax.thresholds (id, tax_type_id, name, amount, currency, period, at, by, how) "
                "VALUES ('{}', '{}', '{}', {}, '{}', '{}', now(), '{}', 'declared')"
            ).format(tid, tax_id, thname, thamount, thcurr, thperiod, CLAIMANT)
            psql(sql)
            print("      + threshold: {} {} {}".format(thname, thamount, thcurr))

        # Add deadlines
        for dl in tax.get("deadlines", []):
            did = uuid()
            dlname = dl["name"].replace("'", "''")
            dloffset = dl.get("offset_rule", "").replace("'", "''")
            dldetail = dl.get("detail", "").replace("'", "''")
            dlpenalty = dl.get("penalty", "").replace("'", "''")

            sql = (
                "INSERT INTO tax.deadlines (id, tax_type_id, name, offset_rule, detail, penalty, at, by, how) "
                "VALUES ('{}', '{}', '{}', '{}', '{}', '{}', now(), '{}', 'declared')"
            ).format(did, tax_id, dlname, dloffset, dldetail, dlpenalty, CLAIMANT)
            psql(sql)
            print("      + deadline: {} ({})".format(dlname, dloffset))

    print("  done: {} logged".format(code))

def list_countries():
    """List all countries in the catalog."""
    result = psql(
        "SELECT c.code, c.name, c.authority, count(t.id) as tax_count "
        "FROM tax.countries c LEFT JOIN tax.types t ON t.country_code = c.code "
        "GROUP BY c.code, c.name, c.authority ORDER BY c.code",
        val=True
    )
    print("  {:<4} {:<20} {:<10} {}".format("CODE", "NAME", "AUTHORITY", "TAXES"))
    print("  " + "-" * 50)
    for line in result.split("\n"):
        if "|" in line:
            parts = line.split("|")
            print("  {:<4} {:<20} {:<10} {}".format(parts[0], parts[1][:20], parts[2], parts[3]))

def show_country(code):
    """Show all taxes for a country."""
    # Get country
    c = psql("SELECT name, authority, source_url, plain_words FROM tax.countries WHERE code = '{}'".format(code), val=True)
    if not c:
        print("  Country {} not found".format(code))
        return

    parts = c.split("|")
    print("  {} ({})".format(parts[0], code))
    print("  Authority: {}".format(parts[1]))
    print("  Source: {}".format(parts[2]))
    print("  Plain words: {}".format(parts[3]))
    print()

    # Get taxes
    taxes = psql(
        "SELECT id::text, name, tax_type, plain_words FROM tax.types WHERE country_code = '{}' ORDER BY name".format(code),
        val=True
    )
    for tline in taxes.split("\n"):
        if "|" in tline:
            tparts = tline.split("|")
            tid = tparts[0]
            print("  TAX: {} ({})".format(tparts[1], tparts[2]))
            print("    {}".format(tparts[3] if len(tparts) > 3 else ""))

            # Get rates
            rates = psql("SELECT name, rate, unit, min_amount, max_amount, currency FROM tax.rates WHERE tax_type_id = '{}'".format(tid), val=True)
            for rline in rates.split("\n"):
                if "|" in rline:
                    rparts = rline.split("|")
                    rmin = "from {}".format(rparts[3]) if rparts[3] and rparts[3] != "" else ""
                    rmax = " to {}".format(rparts[4]) if rparts[4] and rparts[4] != "" else ""
                    print("    rate: {} {} {} {} {}".format(rparts[0], rparts[1], rparts[2], rmin, rmax))

            # Get thresholds
            ths = psql("SELECT name, amount, currency, period FROM tax.thresholds WHERE tax_type_id = '{}'".format(tid), val=True)
            for thline in ths.split("\n"):
                if "|" in thline:
                    thparts = thline.split("|")
                    print("    threshold: {} {} {} ({})".format(thparts[0], thparts[1], thparts[2], thparts[3]))

            # Get deadlines
            dls = psql("SELECT name, offset_rule, detail, penalty FROM tax.deadlines WHERE tax_type_id = '{}'".format(tid), val=True)
            for dlline in dls.split("\n"):
                if "|" in dlline:
                    dlparts = dlline.split("|")
                    print("    deadline: {} ({})".format(dlparts[0], dlparts[1]))
                    if len(dlparts) > 3 and dlparts[3]:
                        print("      penalty: {}".format(dlparts[3]))

            print()

def tax_joke():
    jokes = [
        ("What is the difference between tax avoidance and tax evasion?", "Understanding. One is legal, one is not."),
        ("Why did the VAT return cross the deadline?", "Because nobody explained it in plain words first."),
        ("Why does Hong Kong have no GST?", "Because some truths are simple. Not everything needs a sales tax."),
        ("What is the sound of a tax return being filed?", "A receipt. Because prepared means ready, filed means sent."),
        ("How many tax codes does the UK have?", "Too many. But each one means something."),
        ("What did Beta say about the tax filing?", "It is operationally excellent. Prepared means ready. Filed means sent. Never blur the two."),
        ("Why did Yu build TaxSorted?", "Because every being deserves to understand what they owe before they owe it."),
    ]
    j = random.choice(jokes)
    print("  Q: {}".format(j[0]))
    print("  A: {}".format(j[1]))

def main():
    if len(sys.argv) < 2:
        print("Usage: tax-catalog.py [add|add-all|list|show|joke] [file|code]")
        return

    cmd = sys.argv[1]
    if cmd == "add" and len(sys.argv) > 2:
        with open(sys.argv[2]) as f:
            data = json.load(f)
        add_country(data)
    elif cmd == "add-all" and len(sys.argv) > 2:
        d = sys.argv[2]
        for fn in sorted(os.listdir(d)):
            if fn.endswith(".json"):
                print("Loading {}...".format(fn))
                with open(os.path.join(d, fn)) as f:
                    data = json.load(f)
                add_country(data)
    elif cmd == "list":
        list_countries()
    elif cmd == "show" and len(sys.argv) > 2:
        show_country(sys.argv[2])
    elif cmd == "joke":
        tax_joke()
    else:
        print("Unknown command: {}".format(cmd))

if __name__ == "__main__":
    main()