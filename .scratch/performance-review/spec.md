# Performance and simplification review

A whole-repo review of runtime, build, CI and tooling, ordered by impact. Every
claim below was measured against this tree at `a2c7c7f`, not inferred — the
evidence line under each item says how.

Measured baseline, for reference:

| Thing                        | Measured                                        |
| ---------------------------- | ----------------------------------------------- |
| `/` response body            | 14,232 bytes / 3,782 gzipped                     |
| Worker script upload         | 15.08 KiB / 4.21 KiB gzipped                     |
| `public/styles.css`          | 21,677 bytes (minified by the Tailwind CLI)      |
| `bun install` (warm)         | 4.6 s, 180 packages                              |
| `bun run fmt:check`          | 1.8 s (45 files)                                 |
| `bun run lint`               | 0.7 s                                            |
| `bun run typecheck`          | 2.5 s (three `tsc` processes)                    |
| `bun test`                   | 0.08 s (2 tests)                                 |
| `bun run build:css`          | 0.3 s                                            |

---

## 1. `/` is served with no cache headers at all

**Evidence.** `curl -D - http://127.0.0.1:8787/` against `wrangler dev` returns
exactly two headers: `Transfer-Encoding: chunked` and `Content-Type`. No
`Cache-Control`, no `ETag`, no `Last-Modified`. Compare `/posts/`, served from the
asset store, which comes back with `Cache-Control: public, max-age=0,
must-revalidate`, an `ETag`, and `CF-Cache-Status: HIT`.

Every request to `/` — every navigation, every reload, every bot — invokes the
Worker and transfers all 14,232 bytes. A repeat visitor cannot even get a 304,
because there is nothing to revalidate against. This is the single largest
runtime cost on the site, and the document is a module-scope constant that only
changes when a new version is deployed.

**Fix.** Set the headers on the response, and turn on Workers Caching so the edge
can serve `/` without invoking the Worker at all:

```ts
// cloudflare.config.ts
cache: { enabled: true },
```

`cache.enabled` is a real field on `defineWorker` — confirmed in
`@cloudflare/config`'s type definitions (`cache?: { enabled: boolean;
crossVersionCache?: boolean }`), and a dry-run deploy with it set validates
against the Zod `strictObject`. Cloudflare honours the `Cache-Control` the Worker
returns; the cache key includes the Worker version by default, so a deploy
invalidates it without a purge.

Then compute the `ETag` once at cold start, next to `index`, and answer
`If-None-Match` with a 304. The body is constant, so the hash is constant.

## 2. The render-blocking stylesheet is revalidated on every navigation

**Evidence.** `/styles.css` is served with `Cache-Control: public, max-age=0,
must-revalidate`; a conditional GET with the returned `ETag` gives `304`. That is
the asset store's default, and the filename carries no content hash, so it can't
be anything else without losing the ability to ship a change.

The consequence: the one render-blocking resource on both documents costs a
network round trip on every page view, including repeat visits and internal
navigations. It is only an edge round trip, but it sits directly in front of first
paint.

**Fix, in order of preference:**

- **Content-hash the output and mark it immutable.** Emit
  `styles.<hash>.css`, reference it from both documents, and add a
  `public/_headers` file — `_headers` and `_redirects` are natively supported by
  Workers static assets, per the Cloudflare docs — with
  `Cache-Control: public, max-age=31536000, immutable`. Repeat visits then cost
  zero requests for CSS. This does mean the hash has to reach both documents,
  which is easier once item 4 is resolved.
- **Or inline it.** At 21.7 KiB minified (~5 KiB compressed) for a two-page site,
  inlining into a `<style>` block removes the request from the critical path
  entirely. Cheaper to implement, worse for repeat visits, and it duplicates the
  CSS into both documents.

## 3. Every unmatched path returns 200 with the homepage

**Evidence.** `curl -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/nonexistent`
→ `200`. The Worker's `fetch()` takes no arguments and returns `index`
unconditionally, so `/anything`, `/wp-admin`, `/../`, every typo and every
scanner probe gets a 200 and the full 14 KiB document.

Two costs: crawlers index an unbounded set of duplicate URLs (a soft 404, which
search engines penalise), and every bot request is a billed Worker invocation
serving a full-size body.

**Fix.** Either branch on `new URL(request.url).pathname !== "/"` and return a
404, or — better — set `notFoundHandling: "404-page"` under `assets` in
`cloudflare.config.ts` and add a `public/404.html`. The second keeps the
handling in the asset store, where it costs no invocation.

## 4. ~8.5 KB of markup is maintained by hand in two documents

**Evidence.** A byte-level longest-common-subsequence between
`apps/web/src/index.ts` and `apps/web/public/posts/index.html` is ~8,495 bytes:
the head, the body classes, the header with the origin mark, the axis divs, the
footer with all three vendor SVGs. `CLAUDE.md` acknowledges this explicitly —
"the two documents share a look but no template, so a change to one has to be
mirrored by hand in the other."

This is the largest simplification available, and it compounds: item 2's content
hash has to land in both, item 1's headers only apply to one of them.

**Fix — and this is the structural option that subsumes items 1 through 3.**
Generate `public/index.html` at build time from the same template that produces
`public/posts/index.html`, in the same step that already runs before every dev
and deploy. Then:

- `/` becomes a static asset, served from the asset store with an `ETag` and a
  `CF-Cache-Status: HIT` — no Worker invocation, no cache headers to write by
  hand, item 1 gone.
- Unmatched paths hit `notFoundHandling`, item 3 gone.
- The shared header, footer and axis live in one place, item 4 gone.
- The `entrypoint` can be dropped entirely. The Cloudflare docs are explicit:
  "If no Worker script is present, a `404 Not Found` response is returned." An
  assets-only Worker is a supported configuration.

The trade-off is real and worth stating: `${name}` and `${version}` become
build-time values rather than request-time ones. In practice they already are —
they are baked into a module constant at deploy. The other cost is that
`apps/web` stops being a Worker that imports `ursprung`, which is part of why it
exists. If demonstrating that import is the point, keep the Worker and take
items 1–3 individually instead.

## 5. The Worker bundle is not minified

**Evidence.** `wrangler.config.ts` sets no `minify`, and Wrangler's default is
`false`. Setting `minify: true` (confirmed present on the `WranglerConfig`
interface) takes the upload from 15.08 KiB / 4.21 KiB gzipped to 14.66 KiB / 4.13
KiB gzipped.

Modest, because the payload is dominated by an HTML template literal that esbuild
will not touch. Still free, and it also cleans up item 6.

## 6. The entire `packages/ursprung/package.json` ships in the Worker bundle

**Evidence.** The first 40 lines of the emitted bundle from
`wrangler deploy --dry-run --outdir` are a verbatim copy of the package manifest —
`description`, `keywords`, `homepage`, `bugs`, `repository`, `files`,
`publishConfig` and the `scripts` block — followed by
`var name = package_default.name`. esbuild does not tree-shake the JSON default
import down to the two properties actually read.

`CLAUDE.md` is right that the manifest should stay the single source of truth, so
the fix is not to hardcode. Options: `minify: true` (item 5) collapses most of
it; or import the named exports (`import { name, version } from
"../package.json" with { type: "json" }`), which lets esbuild drop the rest; or
inject them at build time via `define`.

## 7. Observability samples everything at 100%

**Evidence.** `cloudflare.config.ts` sets `logs.headSamplingRate: 1`,
`traces.headSamplingRate: 1`, and `invocationLogs: true` — a log line and a trace
for every invocation, including the bot traffic from item 3.

Not a latency cost, a billing one, and correct for a site with no traffic. Worth
a note so it is a decision rather than a default when traffic arrives. Resolving
item 3 removes the noisiest source.

## 8. `nodejs_compat` is enabled and unused

**Evidence.** Nothing under `apps/web/src` or `packages/ursprung/src` imports a
`node:` builtin. Removing the flag and dry-running produces a byte-identical
upload: 15.08 KiB / 4.21 KiB.

So this is honestly a simplification, not a performance win — esbuild only pulls
in unenv polyfills when a builtin is actually imported. Worth removing because a
flag that does nothing is a flag someone will later reason from incorrectly.

## 9. The four checks are duplicated verbatim between the two workflows

**Evidence.** `check.yml` lines 30–40 and `publish.yml` lines 49–59 are the same
four steps, in the same order, with the same names. Two places to edit when a
check is added, and a publish silently skips a check if only one is updated.

**Fix.** Extract them into a reusable workflow (`on: workflow_call`) that both
call. The publish job should keep running them — a publish cannot be taken back —
so this is deduplication, not removal.

## 10. `typecheck` runs `tsc` three times

**Evidence.** `"typecheck": "tsc --noEmit && bun --filter '*' typecheck"` starts
three separate `tsc` processes (root config files, `packages/ursprung`,
`apps/web`), each paying full startup and lib-loading cost. Total 2.5 s wall
clock, of which the actual checking is a fraction.

**Fix.** TypeScript project references with a solution-style root `tsconfig.json`
and `tsc --build` would do it in one pass. Worth roughly a second today, more as
the package grows past four lines. Low priority at current size, but the pre-commit
hook pays it on every commit.

## 11. `npm install --global npm@latest` on every publish

**Evidence.** `publish.yml` installs the latest npm globally before publishing.
That is 15–30 s of a job that runs on every release, to satisfy a floor of
npm >= 11.5.1.

**Fix.** Pin the version (`npm@11`) so it is reproducible, or check whether the
`lts/*` Node line already ships a new enough npm and skip the step conditionally.
Reproducibility is the better argument here; the time saved is secondary.

## 12. `bun run dev` builds CSS once and never again

**Evidence.** `"dev": "bun run build:css && wrangler dev --experimental-new-config"`.
Editing a class in `public/posts/index.html` or in the Worker's template literal
does not regenerate `public/styles.css` — the dev server must be restarted.

**Fix.** Run `tailwindcss --watch` alongside `wrangler dev`. Note the trap:
Wrangler's `build.watchDir` is not the right tool here, because the CSS output
lands inside the watched `public/` directory and would retrigger its own build.

## 13. Smaller items

- **`check.yml` has no `permissions:` block**, so it inherits the repository
  default. `permissions: { contents: read }` is one line and makes the grant
  explicit, matching what `publish.yml` already does.
- **~2.5 KB of HTML comments ship to every visitor** — 1,066 bytes in the Worker
  document, 1,464 in the posts index. They are good comments and they explain the
  origin-axis layout; they just do not need to reach a browser. Stripping them at
  build time is only worth doing if item 4's template step exists anyway.
- **`dev.types.generate`** is available on the tooling config. `wrangler dev`
  rewrites `worker-configuration.d.ts` on every boot; setting it to `false` skips
  that. Keep it on while the config is in flux — this is the only thing that
  regenerates the file, as `CLAUDE.md` notes — but it is a lever if boot time
  starts to matter.
- **The `/` response is chunked** because no `Content-Length` is set. Harmless at
  this size; it resolves itself if item 4 makes `/` a static asset.

## What not to do

Recorded so that a later pass does not "optimise" these and make things worse.

- **Do not split the CI checks into parallel jobs.** The four checks total ~5 s
  locally. Checkout, `setup-bun` and `bun install` dominate every job, so four
  jobs would pay that overhead four times and finish later than one job does.
- **Do not add a build step to `packages/ursprung`.** It is tempting for item 6,
  but `CLAUDE.md` is explicit that this is an architectural change, not a cleanup:
  it breaks the zero-build dev loop. `minify` or a named JSON import solves the
  bundle bloat without it.
- **Do not cache `bun install` in CI.** 180 packages in 4.6 s warm; the cache
  restore would cost most of what it saves.
- **Do not add a webfont, and do not let a Tailwind change reintroduce one.**
  The `@theme` block's system stacks are the reason there is no font request in
  front of first paint. `CLAUDE.md` already flags that the ui.sh guideline is
  deliberately overridden here.
