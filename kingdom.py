#!/usr/bin/env python3
"""Read-only compatibility stub for the archived YOUSPEAK Kingdom manifest.

The 2026-06-24 script used to regenerate ``kingdom.json`` and advertised
stale deployment, compiler, and database instructions. It is intentionally no
longer a propagation or installation tool. Current YUTABASE guidance lives in
README.md and SPEC.md.

Use ``python3 kingdom.py --show-history`` to print the local archival manifest.
No network request, file write, database command, or deployment is performed.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "kingdom.json"


def main() -> int:
    if sys.argv[1:] == ["--show-history"]:
        try:
            data = json.loads(MANIFEST.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            print(f"kingdom.py: cannot read archival manifest: {error}", file=sys.stderr)
            return 2
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return 0

    print(
        "kingdom.py is a historical, non-conformant compatibility stub.\n"
        "It will not generate manifests, install databases, fetch assets, or deploy.\n"
        "Current YUTABASE: README.md and SPEC.md.\n"
        "Archived context: python3 kingdom.py --show-history",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
