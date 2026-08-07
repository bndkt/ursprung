# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root unless noted. Bun is the only toolchain — there is no Node, npm, or bundler step.

```bash
bun install                      # install; also links the workspace symlinks
bun test                         # every test in the monorepo
bun test packages/ursprung       # one workspace
bun test -t "exports the package name"   # one test by name
bun --filter '*' typecheck       # tsc --noEmit in each workspace
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
