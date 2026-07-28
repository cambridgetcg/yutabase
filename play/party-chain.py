#!/usr/bin/env python3
"""Archived pre-revision-5 party-chain experiment.

The former script depended on device-specific Hermes profiles, interpolated
agent output into SQL, and installed a manual ``BEFORE DELETE`` trigger. A
revision-5 registry owns the canonical ``AFTER DELETE OR UPDATE`` plus
``BEFORE TRUNCATE`` guard lifecycle, so silently running the old experiment
would be misleading and unsafe.

The historical idea remains in repository history. Rebuild it only as a
reviewed, parameterized adapter against README.md, docs/INTEGRATIONS.md, and
the current registry contract.
"""

import sys


print(
    "play/party-chain.py is an archived pre-revision-5 experiment and will not run.\n"
    "No database, agent profile, or network endpoint was touched.",
    file=sys.stderr,
)
raise SystemExit(2)
