# Publishing the optional npm mirror

The npm package is an optional mirror of an already-reviewed GitHub candidate
artifact checked at publication time. Maintainers publish it with
`.github/workflows/publish-npm.yml`; a local `npm publish` is not the release
path.

The workflow deliberately separates preparation from authority:

1. a manual run must be dispatched from `main` with an exact annotated
   `v0.1.0-candidate.N` tag;
2. the tag must resolve to the SDK version and its commit must be contained in
   `origin/main`;
3. the historical tag is checked out separately, then its dependencies,
   tests, type checks, browser check, build, and package smoke test run without
   npm write credentials;
4. the newly packed bytes must exactly match the same-named asset on the
   existing, non-draft GitHub prerelease;
5. only that `.tgz` and a bounded hash receipt cross into the protected
   `npm-bootstrap` job;
6. after environment review, npm trusted publishing supplies a short-lived
   GitHub OIDC identity. Package lifecycle scripts remain disabled;
7. the public registry metadata, `next` tag, and anonymously downloaded
   tarball must match the receipt exactly.

The workflow does not create or move a Git tag, create or replace a GitHub
Release asset, configure npm trust, use a long-lived npm token, select
`latest`, or publish database migrations.

## One-time account configuration

The existing `yutabase` npm package must trust this exact GitHub publisher:

| npm trusted-publisher field | Value |
|---|---|
| Organization or user | `cambridgetcg` |
| Repository | `yutabase` |
| Workflow filename | `publish-npm.yml` |
| Environment | `npm-bootstrap` |
| Allowed action | `npm publish` |

In GitHub, create the `npm-bootstrap` environment with required reviewers.
It needs no npm secret. The environment name is part of the OIDC trust tuple;
changing it or the workflow filename requires updating npm's trusted publisher.

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
