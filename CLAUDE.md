# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root unless noted. Bun is the only toolchain for
installing, testing and typechecking — there is no npm step. The one bundler in
the repo is Wrangler's, and it only runs when the Worker is served or deployed.

```bash
bun install                      # install; also links the workspace symlinks
bun test                         # every test in the monorepo
bun test packages/ursprung       # one workspace
bun test -t "exports the package name"   # one test by name
bun run typecheck                # tsc --noEmit at the root, then in each workspace
bun run lint                     # oxlint
bun run lint:fix                 # oxlint with autofix
bun run fmt                      # oxfmt, rewrites files in place
bun run fmt:check                # oxfmt in check-only mode (use in CI)
bun run dev                      # ursprung-web in `wrangler dev` on :8787
bun run deploy                   # deploy ursprung-web to Cloudflare
bun run deploy:preview           # upload a version, no production traffic shift
bun run skills:update            # update .agents/skills from skills-lock.json sources
```

`bun --filter <workspace-name> <script>` targets a single workspace by its
`package.json` name (`ursprung`, `ursprung-web`), not by directory path.

## Architecture

Bun workspace monorepo, two members declared in the root `package.json`
(`apps/*`, `packages/*`):

- **`packages/ursprung`** — the library. Currently re-exports only `name` and
  `version`, read from its own `package.json` via a JSON import
  (`import pkg from "../package.json" with { type: "json" }`). The manifest is
  the single source of truth for both values; do not hardcode them in `src/`.
- **`apps/web`** (`ursprung-web`) — a Cloudflare Worker. `src/index.ts` is the
  whole thing: it imports `ursprung` and default-exports a module Worker whose
  `fetch` handler answers every request with `${name} v${version}`.

### The Worker is configured in TypeScript, not JSON

`apps/web/cloudflare.config.ts` is Wrangler's **experimental** TypeScript config
format — a `defineWorker({ ... })` default export from `@cloudflare/config`,
replacing `wrangler.jsonc`. It is opt-in per invocation: every Wrangler command
needs `--experimental-new-config` (alias `--x-new-config`), which is what the
`dev` and `deploy` scripts in `apps/web/package.json` pass. Without the flag
Wrangler looks for `wrangler.jsonc`/`wrangler.toml`, finds nothing, and fails.

Two consequences of it being experimental:

- The format is unstable and undocumented on the Cloudflare docs site; the
  schema lives in `@cloudflare/config`'s type definitions and Wrangler's
  `src/experimental-config`. Field names are camelCase (`compatibilityDate`,
  `entrypoint`), not the snake_case of the JSON format.
- `wrangler types` does **not** accept `--experimental-new-config`. The only
  thing that regenerates `apps/web/worker-configuration.d.ts` is starting
  `wrangler dev`, which rewrites it on boot. It is committed so that
  typechecking works from a clean clone.

A sibling `wrangler.config.ts` is also read when present; it takes only the
build/dev tooling keys (`minify`, `alias`, `define`, `dev`, …). Worker-shaped
settings — name, compatibility date, bindings, triggers — belong in
`cloudflare.config.ts`, and Wrangler errors if they appear in the other file.

The schema is a Zod `strictObject`, so a misspelled key is a hard error rather
than a silently ignored setting. A dry-run deploy from `apps/web` is the
cheapest way to validate a config change without shipping it:

```bash
bun run wrangler deploy --dry-run --experimental-new-config
```

### Deployment

The Worker is deployed by [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/),
Cloudflare's Git integration, not from a developer machine. It builds on push to
`main` with these dashboard settings:

| Setting                              | Value                     |
| ------------------------------------ | ------------------------- |
| Root directory                       | `apps/web`                |
| Build command                        | _(empty — no build step)_ |
| Deploy command                       | `bun run deploy`          |
| Non-production branch deploy command | `bun run deploy:preview`  |
| Non-production branch builds         | enabled (all branches)    |
| `BUN_VERSION`                        | `1.3.11` (build variable) |

Both deploy commands are `apps/web` package scripts rather than inline
`wrangler` invocations, so the `--experimental-new-config` flag lives in one
place — the manifest — instead of being duplicated into dashboard fields nobody
diffs. `deploy` runs `wrangler deploy` (production branch); `deploy:preview`
runs `wrangler versions upload`, which uploads a version and hands back a
preview URL without shifting production traffic. Changing either script changes
what CI does; the dashboard fields should not need editing again.

Non-production branch builds are what make every branch — and so every pull
request — build at all. With them off, only `main` ever produces a version and
`deploy:preview` never runs.

The root directory has to be `apps/web` rather than the repo root, because
Wrangler's bin is linked into `apps/web/node_modules/.bin` (Bun links workspace
member bins there, not at the root) and the scripts resolve it from there.
Running `bun install` from `apps/web` is still correct — Bun walks up to the
workspace root, so `ursprung` resolves through the `workspace:*` link.

Three Worker-level settings in `cloudflare.config.ts` back this:

- `domains: ["ursprung.dev"]` becomes a `custom_domain` route. Wrangler creates
  the domain record on deploy but **not** the zone — `ursprung.dev` must already
  be an active zone on the account or the deploy fails.
- `workersDev: false` / `previewUrls: true` — see below.
- `observability` turns on Workers Logs and Traces. `enabled: true` alone only
  covers logs; tracing is separately opt-in via `traces.enabled`, and stays that
  way until Cloudflare ships automatic tracing behind a future compatibility
  date. Both sample at `1` (100%) — worth lowering if traffic ever justifies it.

### Preview URLs

Every version of the Worker is reachable at a
[preview URL](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)
on `workers.dev`, in two flavours:

- **Per commit** — `<version-prefix>-ursprung-web.<subdomain>.workers.dev`,
  minted for every version, whether it came from `wrangler deploy` (a `main`
  build) or `wrangler versions upload` (a branch build).
- **Per branch** — `<branch>-ursprung-web.<subdomain>.workers.dev`, a stable
  alias that follows the head of the branch, so a link posted on a pull request
  keeps working as commits land on it.

Three things have to line up, and they are easy to get wrong independently:

- `previewUrls: true` in `cloudflare.config.ts`. This is not the default: when
  the field is absent Cloudflare mirrors the `workers.dev` setting, and
  `workersDev` itself defaults to `false` as soon as a route or custom domain
  exists — which `domains: ["ursprung.dev"]` does. So the config that serves
  production from a custom domain silently turns preview URLs off unless they
  are asked for by name. `workersDev: false` is spelled out for the same
  reason: keeping production on `ursprung.dev` only, while previews still get
  their `workers.dev` hostnames.
- Only `wrangler deploy` writes that setting — `wrangler versions upload` just
  reads it to decide whether to print the preview URL. Flipping `previewUrls`
  therefore takes effect on the next **production** build, not on the branch
  build that changes the line.
- `WRANGLER_CI_GENERATE_PREVIEW_ALIAS=true` in `deploy:preview` is what creates
  the branch alias. Wrangler derives it from `WORKERS_CI_BRANCH` (falling back
  to `git rev-parse --abbrev-ref HEAD` locally), lowercases it, replaces every
  character outside `[a-z0-9-]` with a dash, and — if `<alias>-ursprung-web`
  would exceed the 63-character DNS label limit — truncates and appends a hash
  of the branch name. Workers Builds sets this variable itself, but the flag
  defaults to `false` in Wrangler, so setting it in the script keeps branch
  aliases working if the build ever runs somewhere else.

Cloudflare's GitHub integration posts both URLs as a pull request comment, one
comment per build. That is a property of `versions upload` runs, which is why
the non-production deploy command must stay `versions upload` and not `deploy`.

Two limits worth knowing: preview URLs are public — anyone with the link can
reach that version, and locking them down means putting
[Cloudflare Access](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/#manage-access-to-preview-urls)
in front — and Workers Builds does not build pull requests from forks, so a
fork PR gets no preview URL until its branch is pushed to this repository.

### The package ships TypeScript source, not a build artifact

`packages/ursprung` has no build step. Its `exports` map points directly at
`./src/index.ts`, and `apps/web` depends on it with `workspace:*`, so whatever
loads it — Bun for tests, Wrangler's esbuild bundler for the Worker — resolves
and transpiles the `.ts` on import. Consequences worth knowing before changing
things:

- Adding a `build` script or pointing `exports` at `dist/` is a real
  architectural change, not a cleanup — it breaks the zero-build dev loop.
- Anything consuming this package must be able to import TypeScript. That holds
  inside the monorepo; it does **not** hold for an arbitrary external consumer,
  and the package _is_ published — every version on npm so far ships
  `src/index.ts` as its entry point. External users therefore need Bun, a
  bundler that transpiles dependencies, or a Node new enough to strip types;
  CommonJS `require()` is out. Adding a build is the fix if that becomes a real
  complaint, and it is the architectural change described above, not a cleanup.
- `files` in the manifest is `["src", "!src/**/*.test.ts"]`, so the tarball is
  the entry point plus `package.json`, `README.md` and `LICENSE`. The `src/`
  layout is part of the public API — `exports` points into it, so moving files
  under `src/` is a breaking change for consumers.

## TypeScript setup

`tsconfig.base.json` at the root holds all compiler options; each workspace's
`tsconfig.json` only `extends` it and sets `include`. Put shared option changes
in the base file.

The config is `noEmit` with `module: "Preserve"` and
`allowImportingTsExtensions` — tsc is a type checker here, never a compiler, and
relative imports carry explicit `.ts` extensions (`from "./index.ts"`).
`strict` and `noUncheckedIndexedAccess` are on.

`packages/ursprung/tsconfig.json` includes `package.json` alongside `src` so the
JSON import typechecks; keep that in `include` if you touch it.

`apps/web/tsconfig.json` is the one workspace that overrides a compiler option:
`types: []`, because it runs on workerd rather than Bun and `@types/bun`'s
globals would collide with the Workers ones. Its ambient types — `Env`,
`ExportedHandler`, the whole runtime — come from `worker-configuration.d.ts`,
which is why that file and `cloudflare.config.ts` are both in `include`.

The root `tsconfig.json` exists only to typecheck the root-level `*.config.ts`
files — the workspaces do not `extend` it and it compiles no source.

## Linting and formatting

[oxlint](https://oxc.rs/docs/guide/usage/linter) and
[oxfmt](https://oxc.rs/docs/guide/usage/formatter) from the oxc toolchain, both
configured with **TypeScript config files, not JSON**:

- `oxlint.config.ts` — the `typescript`, `unicorn`, `oxc` and `import` plugins
  with the `correctness` category at `error`, plus six named `import/` rules.
- `oxfmt.config.ts` — default settings (printWidth 100, 2-space indent,
  semicolons, double quotes, trailing commas, `package.json` key sorting).

Two things about `oxlint.config.ts` are easy to get wrong:

- `plugins` **overwrites** the default set rather than extending it. Adding a
  plugin means listing every plugin you still want alongside it.
- The `import` plugin contributes **no rules to `correctness`**, so adding it to
  `plugins` is a no-op on its own. Every `import/` rule that should run has to be
  named in `rules`. Enabled today: `no-cycle`, `no-self-import`,
  `no-mutable-exports`, `no-duplicates`, `no-empty-named-blocks`, `first`,
  `consistent-type-specifier-style`.

Type imports use the **inline** form — `import { type Foo } from "./foo.ts"`,
not `import type { Foo }`. The mode is spelled out in the config on purpose:
oxlint defaults `consistent-type-specifier-style` to `prefer-top-level`, the
opposite of eslint-plugin-import upstream, so writing the rule bare would
silently enforce the other style. `oxlint --fix` converts existing imports, and
`oxfmt` tidies the spacing the fix leaves behind.

Import _resolution_ is not oxlint's job here — there is no `import/no-unresolved`
rule in oxlint, and `import/named` does not fire on missing named exports. `tsc`
catches both (`TS2307`, `TS2305`) and understands the workspace links, so run
`bun run typecheck` for that class of error. `import/no-cycle` is the one that
earns its place: tsc does not report module cycles.

Both take a default export wrapped in `defineConfig`, imported from the tool's
own package. A tool reads exactly one config per directory, so do not add an
`.oxlintrc.json` or `.oxfmtrc.json` beside these — the JSON and TS forms cannot
coexist, and adding one silently changes which config wins.

`oxfmt` ignores three paths via `ignorePatterns`, all for the same reason — something
other than a human writes them, so formatting produces a diff that the next write
throws away. `.agents/skills/**` is vendored content synced from `skills-lock.json`
by `bun run skills:update`; `**/worker-configuration.d.ts` is emitted by
`wrangler dev`; `.scratch/**` is the agent issue tracker, whose maps, tickets and
research notes are appended to mechanically and are neither rendered nor parsed. It
otherwise honours `.gitignore`.

Formatting markdown is otherwise on, and worth one warning: oxfmt reformats fenced
code blocks inside prose. A `ts` block written as four lines can come back as
thirteen, so a post that says "line 4" or "it takes four lines" will be wrong by the
time it lands. Refer to code by what it contains, never by position or count.

These are npm packages whose bins carry a `#!/usr/bin/env node` shebang, but
`bun run` substitutes itself for `node`, so the Bun-only toolchain still holds —
neither tool needs a Node install. The same is true of `wrangler`, which is why
`apps/web`'s `dev` and `deploy` scripts invoke it bare rather than through `npx`.

## Pre-commit hook

Husky runs `.husky/pre-commit` on every commit: `lint-staged`, then
`bun run typecheck`, then `bun test`. `bun install` runs the `prepare` script,
which is how a fresh clone gets `core.hooksPath` pointed at `.husky/_` — there is
no separate setup step.

`lint-staged.config.ts` formats staged files with `oxfmt` and lints staged source
with `oxlint`. Formatting is applied and re-staged automatically; a lint error
fails the commit, since most are not safely auto-fixable. Two details there are
load-bearing:

- The two globs are **disjoint**. lint-staged runs glob groups concurrently, so
  a file matching both would be rewritten by oxfmt while oxlint was reading it.
  Commands within one group run in order, which is what sequences format→lint.
- `oxfmt` is passed `--no-error-on-unmatched-pattern`. Without it, oxfmt exits
  non-zero when every path it receives is covered by `ignorePatterns`, so a
  commit touching only `.agents/skills/**` would fail the hook.

There is deliberately no Prettier here, despite it being the usual lint-staged
pairing — oxfmt is the formatter, and adding Prettier would mean two tools
formatting the same files.

Bypass with `git commit --no-verify` when you need to; CI still runs
`bun run fmt:check`, `bun run lint`, `bun run typecheck` and `bun test`, because
the hook only ever sees staged files.

## CI and publishing

Two workflows, both Bun-first:

- `.github/workflows/check.yml` — the four checks above, on pushes to `main` and
  on every PR. No `setup-node`: `bun run` substitutes itself for the `node`
  shebang on the oxlint, oxfmt and tsc bins.
- `.github/workflows/publish.yml` — publishes `packages/ursprung` to npm on
  `release: published`. It runs the same four checks, asserts the release tag
  equals `v$(version from the manifest)`, then `npm publish --provenance`.

To cut a release: bump `version` in `packages/ursprung/package.json`, merge to
`main`, then create a GitHub Release tagged `v<version>`. The tag assertion is
there to catch the common mistake of tagging without bumping.

The publish job is the one place Node and npm appear in this repo, and they earn
it: `bun publish` cannot mint npm provenance attestations. It installs with
`bun install --frozen-lockfile` and only shells out to `npm` for the publish
itself.

Auth is [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) over
GitHub OIDC — the job's `id-token: write` permission is exchanged for a
short-lived credential and also signs the provenance attestation. There is no
`NPM_TOKEN` secret, and adding one would be a step backwards. Four things must
agree or publishing fails, three of them configured on npmjs.com under the
package's _Settings → Trusted publisher_:

- the repository, `bndkt/ursprung`;
- the workflow file name, `publish.yml` — **renaming the file breaks publishing**;
- the environment name, `npm`, matching `environment:` on the job;
- `repository.directory` in the manifest, which provenance verification checks
  against the path the workflow published from.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this
repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as `Status:` values. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` and `docs/adr/` at the repo root. See
`docs/agents/domain.md`.
