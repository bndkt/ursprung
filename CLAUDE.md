# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root unless noted. Bun is the only toolchain — there is no Node, npm, or bundler step.

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
bun run dev                      # ursprung-web with --hot reload on :3000
bun run start                    # ursprung-web without reload
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
- **`apps/web`** (`ursprung-web`) — a `Bun.serve` HTTP server that imports
  `ursprung` and surfaces those values on `/` and `/health`. Port comes from
  `PORT`, default 3000.

### The package ships TypeScript source, not a build artifact

`packages/ursprung` has no build step. Its `exports` map points directly at
`./src/index.ts`, and `apps/web` depends on it with `workspace:*`, so Bun
resolves and transpiles the `.ts` on import. Consequences worth knowing before
changing things:

- Adding a `build` script or pointing `exports` at `dist/` is a real
  architectural change, not a cleanup — it breaks the zero-build dev loop.
- Anything consuming this package must be able to import TypeScript. That holds
  inside the monorepo; it would not hold for an external npm consumer, which is
  the constraint to revisit if the package is ever published.

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
  `no-mutable-exports`, `no-duplicates`, `no-empty-named-blocks`, `first`.

Import _resolution_ is not oxlint's job here — there is no `import/no-unresolved`
rule in oxlint, and `import/named` does not fire on missing named exports. `tsc`
catches both (`TS2307`, `TS2305`) and understands the workspace links, so run
`bun run typecheck` for that class of error. `import/no-cycle` is the one that
earns its place: tsc does not report module cycles.

Both take a default export wrapped in `defineConfig`, imported from the tool's
own package. A tool reads exactly one config per directory, so do not add an
`.oxlintrc.json` or `.oxfmtrc.json` beside these — the JSON and TS forms cannot
coexist, and adding one silently changes which config wins.

`oxfmt` ignores `.agents/skills/**` via `ignorePatterns`: that tree is vendored
content synced from `skills-lock.json`, so formatting it only creates churn that
the next `bun run skills:update` discards. It otherwise honours `.gitignore`.

These are npm packages whose bins carry a `#!/usr/bin/env node` shebang, but
`bun run` substitutes itself for `node`, so the Bun-only toolchain still holds —
neither tool needs a Node install.
