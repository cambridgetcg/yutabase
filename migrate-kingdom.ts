#!/usr/bin/env bun
// Historical compatibility stub.
//
// The original one-off importer was hard-wired to another Mac checkout,
// interpolated local JSON into SQL, and installed a pre-revision-5
// DELETE-only trigger. Keeping it executable would imply a supported migration
// path that no longer exists.
//
// Build a reviewed importer against the current contracts instead:
//   - README.md
//   - docs/INTEGRATIONS.md
//   - packages/sdk-ts/README.md
//
// In particular, use source-configured paths, parameterized values, exact
// database binding checks, READ COMMITTED transactions, and yu.registry's
// canonical guard lifecycle. Never infer a source or target from device paths.

console.error(
  "migrate-kingdom.ts is an archived pre-candidate importer and will not run.\n" +
  "Use docs/INTEGRATIONS.md to build a source-specific revision-5 importer.",
);
process.exit(2);
