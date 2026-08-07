---
title: "The config file has to run"
description: "The decision to read the config instead of running it rested on an argument about circularity. There is no circle, and the file was lying to whoever wrote it."
date: "2026-08-07"
---

Earlier today we wrote down that Ursprung's route file is data the bundler reads, and we were pleased with the reasoning. To learn what routes exist, the bundler would have to evaluate the route file. To evaluate it, it would have to build it first. Building is the thing that needed the route tree. Circular, therefore settled, therefore builder-call route declarations are dead by construction rather than by taste.

That argument is wrong. It conflates two graphs. Building the _config_ graph needs module resolution and type stripping, and neither of those needs the route tree. The route tree is required only to emit route outputs, which happen afterwards. Two phases, no cycle. It went unchallenged through a whole prototype and into the record, because an argument that concludes something convenient is one nobody re-reads.

What actually reopened it was not the flaw. It was the maintainer pointing out that a TypeScript file which is read rather than run is a trap. Write `process.env.API_URL` in it, or `new Date()`, or a loop over a list of locales. All of it typechecks. All of it looks correct in an editor. None of it does anything. The file's extension makes a promise the tool does not keep, and the failure is silent — the worst kind to hand someone on their first day with a framework.

## What Wrangler actually does

Before deciding anything we went and read the closest possible precedent, which happens to be sitting in this repo's own `node_modules`. Wrangler's experimental TypeScript config — the `cloudflare.config.ts` this site already deploys with — had to solve the same problem.

It evaluates. Its `loadConfig` is, once you strip the wrapper, a bare `await import(pathToFileURL(configPath))`. There is no esbuild pass, no temporary file, no bundle. TypeScript is handled by Node's own native type stripping, which is the entire reason Wrangler's error message names a hard floor of Node 22.18.

The machinery around that call is not the evaluation, which was the useful discovery. `registerHooks` from `node:module` is installed for two jobs: appending a UUID query to every resolved `file://` URL so edits are not cached, along with recording the touched files as a dependency set, which is watch-mode infrastructure; and implementing a custom import attribute. Ursprung has no watch mode — that is already a locked constraint — so half of it is irrelevant to us. The other half is genuinely clever and worth stealing later. Wrangler's `entrypoint` field accepts either a path string or this:

```ts
import * as entrypoint from "./src" with { type: "cf-worker" };
export default defineWorker({ entrypoint });
```

A resolve hook intercepts the attribute and short-circuits to a synthetic module whose whole body is `export default "<path>"`. The Worker's entry module is never loaded. But the type system still sees the real module namespace, which is how Wrangler infers a Worker's exports from its own config. A typed, navigable reference to a module deliberately not evaluated.

One fact from the same file that we did not expect: Wrangler refuses to load its config under Bun outright, with `"cloudflare.config.ts loading is not supported on Bun. Please use Node.js v22.18.0 or higher."`, because `registerHooks` does not exist there. This repo claims a Bun-only toolchain, so that looked alarming for about ten minutes until a dry-run deploy showed Wrangler executing under Node regardless.

## Drawing the line in a different place

The obvious objection to evaluating anything is that Ursprung's build has to be able to run inside a Worker. That is a locked constraint, and `eval()` and `new Function()` are disallowed on workerd — you get `Code generation from strings disallowed for this context`. Cloudflare does have a mechanism, the Worker Loader binding, where `env.LOADER.load({ mainModule, modules })` spins up a sandboxed isolate from module source strings. But it is beta, and reaching for it felt like a lot of machinery to buy back a constraint.

The constraint says something more specific than we had been reading it as. It binds _build modules_: every build module takes an injected virtual filesystem and touches no Node API. So put the evaluation outside the build entirely. The CLI evaluates `ursprung.config.ts` with a native `import()` and hands the build `{ vfs, config }`, where `config` is already plain data. The build evaluates nothing, touches no Node API, and stays exactly as portable as it was. Build-in-a-Worker is still reachable; that host just has to produce the evaluated data some other way.

## What it cost

Thunks. The route file used to reference components as `() => import("./builds/index.server.tsx")`, chosen so the specifier stayed a string literal in the AST. Under evaluation a thunk is opaque — you cannot look inside a function, and you must not call it, since calling it executes application modules at build time and Node cannot load `.tsx` at all. A thunk is the same lie as the unevaluated config, one level down: it looks like it will be called and never is.

References are now `new URL("./builds/index.server.tsx", import.meta.url)`, which composes across files for free because each resolves against its own module. That is what makes route subtrees from other files work, and dynamic config was the point of the exercise.

The bill comes due on types. A `URL` carries no link to the module it names, so an API route's export name is an unchecked string, and a route component's `params` type restates what `path: ":id"` already says with nothing able to check the two agree. That last one had been logged as "no good option surfaced". The honest version is that no option exists: the parser has no type model by design, and the reference form has no type link. Wrangler's import attribute is the way out, and it is a local change per reference whenever the missing types start to hurt.
