# ursprung

Bun workspace monorepo:

- [`packages/ursprung`](packages/ursprung) — the `ursprung` package, published to
  [npm](https://www.npmjs.com/package/ursprung).
- `apps/web` — a Cloudflare Worker that imports it, served at
  [ursprung.dev](https://ursprung.dev). Not published.

```bash
bun install
bun run dev        # ursprung-web in `wrangler dev` on :8787
bun test
```

## Preview URLs

Every push builds through
[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) and
every build produces a
[preview URL](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/):

- a per-commit URL, `<version-prefix>-ursprung-web.<subdomain>.workers.dev`, for
  the exact version that was built;
- a per-branch URL, `<branch>-ursprung-web.<subdomain>.workers.dev`, that always
  points at the head of that branch.

Pushes to `main` run `wrangler deploy`, which ships to `ursprung.dev` and still
mints a per-commit URL. Pushes to any other branch run `wrangler versions
upload`, which uploads a version without shifting production traffic; Cloudflare
posts both URLs as a comment on the pull request.

Preview URLs are public. Pull requests from forks are not built, so they get no
preview URL until the branch is pushed to this repository.

## Releasing `ursprung`

Publishing is driven entirely by GitHub Releases — nothing is published from a
laptop.

1. Bump `version` in `packages/ursprung/package.json`, commit, and merge to
   `main`.
2. Create a GitHub Release tagged `v<version>` (so `0.0.5` → tag `v0.0.5`).
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

Renaming or moving the workflow breaks publishing. `repository.directory` in the
package manifest must also keep pointing at `packages/ursprung`, since
provenance verification checks the manifest's `repository` against where the
workflow ran.
