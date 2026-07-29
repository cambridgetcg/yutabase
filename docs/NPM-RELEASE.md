# Publishing the optional npm mirror

The npm package is an optional mirror of an already-reviewed GitHub candidate
artifact checked at publication time. Maintainers publish it with
`.github/workflows/publish-npm.yml`; a local `npm publish` is not the release
path.

## Current verified mirror

`yutabase@0.1.0-candidate.3` is public as byte-identical GitHub and npm
archives:

- exact archive size: `127749` bytes
- exact archive SHA-256:
  `2a3d72d876e4dfd3bcae141a25730e4ebf428d31b7a701bcced9cb225e9f44ed`
- npm dist-tags: `next` is `0.1.0-candidate.3`; `latest` remains
  `0.1.0-candidate.1`
- protected OIDC publication:
  [workflow run, attempt 3](https://github.com/cambridgetcg/yutabase/actions/runs/30484373200/attempts/3)
- registry evidence:
  [npm package](https://www.npmjs.com/package/yutabase/v/0.1.0-candidate.3)
  ([agent-readable registry JSON](https://registry.npmjs.org/yutabase/0.1.0-candidate.3))
  and
  [SLSA provenance attestation](https://registry.npmjs.org/-/npm/v1/attestations/yutabase@0.1.0-candidate.3)

The published npm tarball was downloaded anonymously and compared with the
GitHub Release asset after publication. A clean exact-version install, package
import, registry signature check, and provenance check also passed. This
receipt concerns the optional SDK/CLI archive; it does not claim that a
database was migrated or prove the security of a PostgreSQL deployment.

The exact candidate.3 archive was assembled before its npm publication, so its
packaged README uses pre-publication wording. The registry state, protected
run, provenance, and exact-byte checks above are the later release evidence.
Future release preparation should use wording that remains accurate on both
sides of publication.

The workflow deliberately separates preparation from authority:

1. a manual run must be dispatched from `main` with an exact annotated
   `v0.1.0-candidate.N` tag;
2. the tag must resolve to the SDK version and its commit must be contained in
   `origin/main`;
3. the historical tag is checked out separately, then its dependencies,
   tests, type checks, browser check, build, and package smoke test run without
   npm write credentials;
4. the newly packed archive's bounded, decompressed npm tar stream must exactly
   match the same-named asset on the existing, non-draft GitHub prerelease;
5. only that `.tgz` and a bounded hash receipt cross into the protected
   `npm-bootstrap` job;
6. after environment review, the protected job anonymously re-downloads the
   exact public GitHub Release URL named by the validated receipt and compares
   its size, SHA-256, and bytes again;
7. npm trusted publishing supplies a short-lived GitHub OIDC identity. Package
   lifecycle scripts remain disabled;
8. the public registry metadata, `next` tag, and anonymously downloaded
   tarball must match the receipt exactly.

The decompressed comparison is deliberate. npm's gzip wrapper can differ
between Node/zlib toolchains and build environments even when the underlying
tar bytes, entries, metadata, and package content are identical. The workflow
never publishes its rebuilt wrapper: it transfers and publishes the exact
reviewed GitHub `.tgz`, whose compressed size and SHA-256 are carried in the
receipt and checked again after approval.

The second GitHub download matters because environment approval can wait after
preparation. Missing or changed release bytes stop the run immediately before
any npm observation or publication attempt; the job does not assume that an
asset checked earlier is permanently immutable.

The protected job is idempotent only for exact public state. If the version
already exists, or if `npm publish` exits without proving whether the registry
accepted it, the job succeeds only when anonymous registry reads show the same
size and SHA-256 and `next` points to that version. A mismatched version,
unexpected response, or different distribution tag fails closed. The final
readback independently downloads and verifies the public bytes again.

The workflow does not create or move a Git tag, create or replace a GitHub
Release asset, configure npm trust, use a long-lived npm token, select
`latest`, or apply database migrations.

## One-time account configuration

The existing `yutabase` npm package must trust this exact GitHub publisher:

| npm trusted-publisher field | Value |
|---|---|
| Organization or user | `cambridgetcg` |
| Repository | `yutabase` |
| Workflow filename | `publish-npm.yml` |
| Environment | `npm-bootstrap` |
| Allowed action | `npm publish` |

Before the first dispatch, deliberately create the `npm-bootstrap` environment
in GitHub and add required reviewers. This ordering matters: when a workflow
references an environment that does not exist, GitHub creates it without
protection rules. The environment needs no npm secret. Its name is part of the
OIDC trust tuple; changing it or the workflow filename requires updating npm's
trusted publisher.

## Release invocation

First verify that the annotated tag and exact GitHub prerelease asset already
exist. For candidate 3 the asset name is
`yutabase-0.1.0-candidate.3.tgz`. Then dispatch the workflow from `main`:

```sh
gh workflow run publish-npm.yml \
  --repo cambridgetcg/yutabase \
  --ref main \
  -f tag=v0.1.0-candidate.3
```

Review the credential-free `prepare` result before approving the protected
environment. A successful run publishes the candidate under `next`; it does
not promote it to `latest`. Treat a failed or interrupted publish as unknown
until the public registry version and tarball bytes have been inspected.
