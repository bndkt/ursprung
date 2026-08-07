---
title: "Two workspaces, no build step"
description: "Ursprung's package ships TypeScript source straight to its consumer, which makes the dev loop instant and makes publishing to npm a problem for later."
date: "2026-08-07"
---

Most monorepos open with a build pipeline. Before the app can import the library, the library has to be compiled: a `dist/` folder appears, a watcher sits in a second terminal, and everyone learns the hard way which of the two processes they forgot to start when an import comes back `undefined`.

Ursprung does not have that step. `bun run dev` starts the web server, the server imports the `ursprung` package, and the TypeScript in `packages/ursprung/src/index.ts` is transpiled as it loads. There is no build script anywhere in the repo, because there is nothing to build.

## The shape of the thing

Two workspaces, declared in the root manifest as `apps/*` and `packages/*`, with exactly one member each so far. `packages/ursprung` is the library. `apps/web`, whose package name is `ursprung-web`, is a `Bun.serve` server that imports the library and surfaces its values on `/` and `/health`. That is the entire repo today, and saying so plainly is the point: this is a scaffold with a shape, not a framework with features.

The link between the two is one line in `apps/web/package.json`:

```json
"dependencies": { "ursprung": "workspace:*" }
```

`workspace:*` tells Bun to resolve `ursprung` to the local folder at whatever version it happens to be, rather than reaching for a registry. Bun symlinks it into `node_modules` at install time, so the import statement `apps/web` writes is the same one an outside consumer would write. No path aliases, no project references, nothing that works only because the files happen to sit near each other.

The other line that matters is in `packages/ursprung/package.json`:

```json
"exports": { ".": "./src/index.ts" }
```

That is the no-build decision, written down. The package's public entry point is a `.ts` file, so anything importing this package must be able to read TypeScript. Inside a Bun monorepo that is free. Outside one it is not, and that is the trade-off the repo has taken on: `ursprung` cannot be published to npm as it stands. The day it needs to be is the day a build step arrives. `CLAUDE.md` says as much in writing, so that nobody adds a `dist/` six months from now under the impression they are tidying up.

## One source of truth, one odd line

The library currently exports two things, its own name and version, and it reads both from its own manifest:

```ts
import pkg from "../package.json" with { type: "json" };
```

Bumping the version means editing `package.json` and nothing else, which is the whole reason for doing it this way. It costs one non-obvious line elsewhere, though. `packages/ursprung/tsconfig.json` has to include the manifest alongside the source, or the compiler will not typecheck that import:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "package.json"] }
```

That file is four lines long, and so is the web app's. Every compiler option lives in `tsconfig.base.json` at the root; the workspaces only extend it and say what to look at. The config is `noEmit`, with `module: "Preserve"` and `allowImportingTsExtensions` switched on, which is a long way of saying that tsc is a type checker here and never a compiler. Relative imports carry their extensions (`from "./index.ts"`), which looks wrong if you learned TypeScript a few years ago and is exactly right when the runtime is the thing resolving the file.

`strict` and `noUncheckedIndexedAccess` were both on in the first commit. Cheap now, miserable to retrofit.

## What it costs

The install is small. The lockfile resolves five external packages: TypeScript, `@types/bun`, and the three type packages that pulls in behind it. Nothing at runtime at all. Bun is the package manager, the test runner, the type-check driver and the server, and the repo has not yet found a reason to add a sixth tool.

Commands that fan out across workspaces go through the filter flag, `bun --filter '*' typecheck`, with one trap worth knowing: it matches on the `package.json` name, not the directory. It is `bun --filter ursprung-web dev`, never `bun --filter apps/web dev`.

The open question this layout leaves is where the seam ends up once the library stops being two exported constants. Right now the boundary between package and app is free, because nothing meaningful crosses it. Drawing it this early is a bet that an empty boundary is cheaper to keep than a missing one is to add.
