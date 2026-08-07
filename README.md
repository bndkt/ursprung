# ursprung

Bun workspace monorepo:

- [`packages/ursprung`](packages/ursprung) — the `ursprung` package, published to
  [npm](https://www.npmjs.com/package/ursprung).
- `apps/web` — a `Bun.serve` HTTP server that imports it. Not published.

```bash
bun install
bun run dev        # ursprung-web on :3000
bun test
```

## Releasing `ursprung`

Publishing is driven entirely by GitHub Releases — nothing is published from a
laptop.

1. Bump `version` in `packages/ursprung/package.json`, commit, and merge to
   `main`.
2. Create a GitHub Release tagged `v<version>` (so `0.0.4` → tag `v0.0.4`).
3. `.github/workflows/publish.yml` runs on `release: published`: it reinstalls
   from the lockfile, runs format/lint/typecheck/test, asserts the tag matches
   the manifest version, and then `npm publish --provenance --access public`.

Authentication is [npm trusted
publishing](https://docs.npmjs.com/trusted-publishers) over GitHub's OIDC — the
job requests `id-token: write` and exchanges that token for a short-lived
credential, so there is **no `NPM_TOKEN` secret** in this repository. The same
token signs the
[provenance attestation](https://docs.npmjs.com/generating-provenance-statements/)
npm shows next to each version.

Three things are load-bearing for that to keep working, all configured on
npmjs.com under the package's _Settings → Trusted publisher_:

- the repository (`bndkt/ursprung`),
- the workflow file name (`publish.yml`),
- the environment (`npm`), matching `environment:` in the job.

Rename or move the workflow and publishing fails with an auth error, not a
provenance warning. `repository.directory` in the package manifest must also
keep pointing at `packages/ursprung`, since provenance verification checks the
manifest's `repository` against where the workflow ran.

### Retrying a failed publish

A publish that fails does not consume the version number — if the tarball never
reached the registry, the same version can still be published. Run the Publish
workflow manually from the Actions tab with the existing tag (`v0.0.4`) as the
`tag` input; there is no need to bump the version or cut a second release.

Read the failure before retrying. npm answers an unauthorised write with a bare
`404 Not Found - PUT https://registry.npmjs.org/ursprung`, the same code it uses
for a package that does not exist, because distinguishing the two would leak
which private names are taken. On a package that is demonstrably public, that
404 means **rejected credentials, not a missing package** — check the trusted
publisher settings above rather than the version number. The publish step runs
at `--loglevel verbose` so the log shows whether npm attempted the OIDC exchange
at all.
