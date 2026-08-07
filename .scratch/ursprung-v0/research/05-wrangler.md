# 05 — Wrangler's experimental TypeScript config: no_bundle, assets, and the build contract

Research findings for [issue 05](../issues/05-wrangler-experimental-config-and-build-contract.md).
Map: [ursprung v0](../map.md).

## Versions this was established against

Everything below was read out of, or run against, the versions installed in this repo.
The experimental config format is unstable; **re-verify against the installed version
before relying on any of it.**

| Package              | Version   | Location                                                       |
| -------------------- | --------- | -------------------------------------------------------------- |
| `wrangler`           | `4.119.0` | `/home/user/ursprung/apps/web/node_modules/wrangler`           |
| `@cloudflare/config` | `0.4.0`   | `/home/user/ursprung/apps/web/node_modules/@cloudflare/config` |

Note: `@cloudflare/config`'s own `package.json` `description` reads "This is not yet
stable enough for external use — APIs may change without notice", and its
`workers-sdk.prerelease` field is `true`
(`apps/web/node_modules/@cloudflare/config/package.json`).

Both packages resolve under `apps/web/node_modules`, not the repo root — Bun links
workspace-member dependencies into the member. A `bun install --frozen-lockfile` was
needed to materialise them; nothing tracked by git was modified.

### Experiments were run in a scratch copy, not in `apps/web`

All `wrangler` invocations below were run against a throwaway copy of `apps/web` at
`/tmp/claude-0/-home-user-ursprung/1ae55956-2da1-5993-b411-93749bb28844/scratchpad/webtest`
(sources copied, `node_modules` symlinked to `apps/web/node_modules`). No file in the
repository was changed and nothing was deployed. Where a command is quoted below, it was
run in that scratch directory.

---

## 1. Can the experimental config express "do not bundle"?

**Yes — but not in `cloudflare.config.ts`.** `noBundle` lives in the _sibling_ tooling
config, `wrangler.config.ts`, authored with `defineWranglerConfig`.

This is the single most important fact in the ticket, and it is good news: **ticket 21's
main risk does not materialise.** Bundling can be disabled, and the mechanism is
first-class and typed, not a workaround.

### Primary sources

`wrangler/wrangler-dist/experimental-config.d.mts`, `interface WranglerConfig`
(line 1622), documented as:

> The shape of `wrangler.config.ts` — tooling / bundling / dev-server configuration that
> complements the Worker configuration authored in `cloudflare.config.ts` via
> `defineWorker`.

Its complete key set:

```
noBundle?, minify?, keepNames?, alias?, define?, findAdditionalModules?,
preserveFileNames?, baseDir?, rules?, wasmModules?, textBlobs?, dataBlobs?,
tsconfig?, jsxFactory?, jsxFragment?, pythonModules?, uploadSourceMaps?,
build?, assetsDirectory?, dev?, sendMetrics?
```

The runtime Zod schema that enforces it is `WranglerConfigSchema` in
`wrangler/wrangler-dist/cli.js` (line ~203391, from `src/experimental-config/schema.ts`),
a `strictObject`. `convertToolingConfig` (same file, line ~203257, from
`src/experimental-config/convert.ts`) maps each camelCase key onto the legacy snake_case
`RawConfig`: `noBundle → no_bundle`, `rules → rules`, `baseDir → base_dir`,
`findAdditionalModules → find_additional_modules`, `preserveFileNames →
preserve_file_names`, `build → { command, cwd, watch_dir }`,
`assetsDirectory → assets.directory`.

So the experimental format is a **renaming front-end over the same `RawConfig`** the JSON
format produces; nothing in the bundling area is lost, it is only relocated.

### What is _not_ in `cloudflare.config.ts`

The Worker-shaped config's complete schema is `BaseWorkerSchema` / `InputWorkerSchema` in
`@cloudflare/config/dist/index.mjs` (lines ~394–418, from `src/schema.ts`), both
`z.strictObject`:

```
type, name, compatibilityDate, compatibilityFlags, assets, domains, triggers,
tailConsumers, cache, placement, limits, logpush, observability, workersDev,
previewUrls, firstPartyWorker, unsafe, env, exports, entrypoint
```

No `noBundle`, no `build`, no `rules`, no `main`, no `assets.directory`. Grepping the
whole of `@cloudflare/config/dist` for `bundle` (case-insensitive) returns exactly one
hit, an unrelated doc comment about integrations that bundle the package
(`dist/index.d.mts:651`).

### Observed: putting `noBundle` in the wrong file

```
$ bun run wrangler deploy --dry-run --experimental-new-config
✘ [ERROR] Invalid `cloudflare.config.ts`:
    • default: Unrecognized key: "noBundle"
```

And the reverse, plus a typo, in `wrangler.config.ts`:

```
✘ [ERROR] Invalid `wrangler.config.ts`:
    • entrypoint is not a supported field in wrangler.config.ts. Move it to cloudflare.config.ts.
    • nobundle is not a supported field. Supported top-level fields are: noBundle, minify,
      keepNames, alias, define, findAdditionalModules, preserveFileNames, baseDir, rules,
      wasmModules, textBlobs, dataBlobs, tsconfig, jsxFactory, jsxFragment, pythonModules,
      uploadSourceMaps, build, assetsDirectory, dev, sendMetrics.
```

The "move it to the other file" hint comes from `WORKER_CONFIG_FIELD_HINTS` /
`formatWranglerConfigZodError` (`wrangler-dist/cli.js` lines ~203416 and ~203560). Both
error classes are hard failures before anything is built.

### File discovery and precedence

`loadNewConfig` (`wrangler-dist/cli.js` line ~203456, from
`src/experimental-config/load.ts`):

- `CLOUDFLARE_CONFIG_FILENAME = "cloudflare.config.ts"` — **required**; absence is a
  `UserError`.
- `WRANGLER_CONFIG_FILENAME = "wrangler.config.ts"` — optional.
- Both are resolved against `options.cwd`, and `readNewConfig` sets
  `const cwd = process.cwd()` (line ~248459). `--config` is explicitly rejected under
  `--experimental-new-config`. **The two config files must sit in the process's working
  directory** — a second, independent reason (beyond bin resolution) that Workers Builds'
  root directory has to be `apps/web`.
- The two are merged by `mergeRawConfigs`: tooling keys win on collision, and the `assets`
  sub-objects are shallow-merged (`{ ...workerAssets, ...toolingAssets }`), which is how
  `assets.directory` from the tooling side joins the runtime asset settings from the
  Worker side.

### Hard constraint: the Wrangler CLI must run on Node, not Bun

`wrangler-dist/cli.js` line 202082:

```js
if (typeof process !== "undefined" && process.versions.bun)
  throw new Error(
    "cloudflare.config.ts loading is not supported on Bun. Please use Node.js v22.18.0 or higher.",
  );
```

and line 202084 requires `module.registerHooks`, i.e. Node ≥ 22.18.0.

Observed:

```
$ bun ./node_modules/wrangler/bin/wrangler.js deploy --dry-run --experimental-new-config
✘ [ERROR] cloudflare.config.ts loading is not supported on Bun. Please use Node.js v22.18.0 or higher.
▲ [WARNING] Wrangler does not support the Bun runtime. … make sure you're not passing
  the `--bun` flag when running `bun run wrangler ...`
```

whereas `bun run wrangler deploy --dry-run --experimental-new-config` succeeds, because
`bun run` executes the `#!/usr/bin/env node` shebang with the real `node` on `PATH`
(v22.22.2 here). CLAUDE.md's line "`bun run` substitutes itself for `node`, so the
Bun-only toolchain still holds" is **not** what happens for the wrangler bin, and if it
ever did (e.g. `bun --bun run`), the experimental config would stop loading entirely.

---

## 2. The custom build command

`WranglerConfig.build` (`experimental-config.d.mts:1647`), schema `BuildSchema`
(`cli.js` ~203369):

```ts
build?: {
  command?: string;
  cwd?: string;
  watchDir?: string | string[];
}
```

mapped to `RawConfig.build = { command, cwd, watch_dir }` by `convertToolingConfig`.

### When it runs

`getEntry` (`cli.js` line 268998, `src/deployment-bundle/resolve-entry.ts`) calls
`runCustomBuild(...)` **before** `guessWorkerFormat(...)`, i.e. before the entrypoint file
is read at all. `runCustomBuild` (`cli.js` line 251532) runs the command and _then_
asserts the entrypoint exists (`assertEntryPointExists`), producing a dedicated error
message if the build did not produce it. So:

- **The entrypoint may be generated by the build command.** Verified: with
  `entrypoint: "./gen/index.js"` and `build.command` creating `gen/index.js` from nothing,
  `deploy --dry-run` succeeded and emitted `out6/index.js`.
- It runs on `wrangler dev`, `wrangler deploy` (including `--dry-run`) and
  `wrangler versions upload`. Verified for `deploy --dry-run`; the docs list the values
  Wrangler puts in `WRANGLER_COMMAND` as `dev`, `deploy`, `versions upload`, `types`
  (<https://developers.cloudflare.com/workers/wrangler/custom-builds/>). The env var is set
  in `runCommand` (`cli.js` ~251482).

### Working directory

`runCommand` shells out with `execa(command, { shell: true, cwd })` where `cwd` is
`build.cwd` verbatim — `normalizeAndValidateBuild` (`cli.js` line 34523) passes `cwd`
through **without** resolving it against the config path (unlike `watch_dir`, `main` and
`base_dir`, which _are_ resolved against the config directory). With `cwd` omitted, execa
inherits `process.cwd()`.

Observed, with `build.command` set to `pwd > … && ls >> …` and no `cwd`:

```
/tmp/…/scratchpad/webtest
RAN
cloudflare.config.ts
dist
node_modules
…
```

i.e. the directory the `wrangler` process was started in — the same directory the two
config files must live in. **A relative `build.cwd` is relative to `process.cwd()`, not to
`cloudflare.config.ts`.** For this repo both are `apps/web`, so the distinction is
invisible today but is a real trap.

`watchDir` defaults to `./src` and only matters for `wrangler dev` — irrelevant to
ursprung (constraint 11 rules out watch mode).

---

## 3. What Wrangler uploads with bundling disabled

### The entrypoint is uploaded byte-for-byte, untransformed

Deploy path, `cli.js` line ~283362:

```js
if (noBundle) {
  fs.mkdirSync(destinationDir, { recursive: true });
  fs.writeFileSync(path.join(destinationDir, path.basename(entry.file)),
                   fs.readFileSync(entry.file, "utf-8"));
}
…
const { modules, dependencies, resolvedEntryPointPath, bundleType, …bundle } =
  noBundle ? await noBundleWorker(entry, config.rules ?? [], props.outdir, …)
           : await bundleWorker(…);
```

`noBundleWorker` (`cli.js` line 251335) returns `resolvedEntryPointPath: entry.file` and
does no transformation whatsoever.

Verified twice:

- With `entrypoint: "./src/index.ts"` and `noBundle: true`, `deploy --dry-run --outdir
./out1` emitted `out1/index.ts` containing the original TypeScript, `satisfies
ExportedHandler<Env>` and the unresolved bare `import … from "ursprung"` intact. Total
  Upload 0.16 KiB (the raw file is 159 bytes); with bundling on the same entry uploads
  1.07 KiB.
- `wrangler dev --experimental-new-config` on that same setup fails in the runtime, not in
  Wrangler:

  ```
  ✘ [ERROR] service core:user:ursprung-web: Uncaught SyntaxError: Unexpected identifier 'satisfies'
      at index.ts:7:2
  ```

  So workerd is happy to _name_ a module `index.ts`, but it executes it as JavaScript.
  **ursprung must emit type-stripped JavaScript; the extension is cosmetic, the manifest
  type is what matters.**

### Imports are not followed

`noBundleWorker` calls `findAdditionalModules`, which does **not** walk the import graph.
It walks the _filesystem_ under `entry.moduleRoot` and matches files against module rules
(`cli.js` line 169931, `src/deployment-bundle/find-additional-modules.ts`).

`DEFAULT_MODULE_RULES` (`cli.js` line 169756) is only:

```js
[
  { type: "Text", globs: ["**/*.txt", "**/*.html", "**/*.sql"] },
  { type: "Data", globs: ["**/*.bin"] },
  { type: "CompiledWasm", globs: ["**/*.wasm", "**/*.wasm?module"] },
];
```

**There is no default rule for `.js`.** Observed: an entrypoint `dist/index.js` importing
`./lib.js` and `./nested/deep.js`, with `noBundle: true` and no `rules`, uploaded _only_
`index.js` plus `notes.txt` (matched by the Text default rule). `lib.js`, `nested/deep.js`
and `data.json` were silently omitted — a Worker that would 500 at runtime, uploaded
without a warning.

Adding the rule fixes it:

```ts
export default defineWranglerConfig({
  noBundle: true,
  rules: [{ type: "ESModule", globs: ["**/*.js"] }],
});
```

```
Attaching additional modules:
│ lib.js         │ esm  │
│ nested/deep.js │ esm  │
│ notes.txt      │ text │
```

and `wrangler dev` then served `hellodeep` — the runtime resolved `./lib.js` and
`./nested/deep.js` against the module names. **Relative specifiers resolve against the
module's own name inside the uploaded module set.**

### Module naming rules

- Names are `path.relative(entry.moduleRoot, file)` with `\` normalised to `/`
  (`findAdditionalModules`, `cli.js` line 169938). Nested directories are preserved
  (`nested/deep.js`).
- `moduleRoot = args.moduleRoot ?? config.base_dir ?? path.dirname(entrypoint)`
  (`cli.js` line 269093) — i.e. **defaults to the entrypoint's own directory**, overridable
  with `baseDir` in `wrangler.config.ts`. Anything outside the module root cannot be named
  and is not collected.
- The entrypoint is excluded from the additional-modules list by name and uploaded as the
  main module, named `path.basename(entry.file)`.
- Available `rules[].type` values (`RuleSchema`, `cli.js` ~203355): `ESModule`,
  `CommonJS`, `CompiledWasm`, `Text`, `Data`, `PythonModule`, `PythonRequirement`.
  **There is no JSON rule type** — a `.json` file must ship as `Text` (and be `JSON.parse`d)
  or be inlined into the JS. Verified: `dist/data.json` was never collected.
- `rules` are _prepended_ to the defaults, and the first non-`fallthrough` rule per type
  wins (`parseRules`, `cli.js` line 169703).

### The entrypoint _is_ still parsed, even with `noBundle`

`guessWorkerFormat` (`cli.js` line 268920) always runs esbuild over the entrypoint with
`{ bundle: false, write: false, metafile: true }`, to detect `modules` vs `service-worker`
format and to read the export names. Consequences:

- A **syntax error in the entrypoint fails the deploy** even with `noBundle: true`.
  Verified — identical esbuild diagnostic with `noBundle` true and false.
- Because `bundle: false`, imports are _not_ resolved, so a bare or dangling specifier in
  the entrypoint passes this check silently.
- Because esbuild's loader is applied, TypeScript _syntax_ in the entrypoint parses fine
  here — and is then uploaded untransformed. The failure surfaces only in the runtime.
- A worker with no `default` export is classified `service-worker` with a warning; that
  changes `bundleType` from `esm` to `commonjs`.

---

## 4. Static assets

Configuration is split across the two files, deliberately.

**`wrangler.config.ts`** — `assetsDirectory?: string`, commented in
`experimental-config.d.mts:1653` as:

> Assets directory — the only tooling-side asset setting. The runtime asset fields
> (`binding`, `htmlHandling`, `notFoundHandling`, `runWorkerFirst`) live in
> `cloudflare.config.ts` under `assets`.

**`cloudflare.config.ts`** — `AssetsSchema` (`@cloudflare/config/dist/index.mjs` line 17),
a `strictObject` with exactly three optional keys:

| Key                | Values                                                                             |
| ------------------ | ---------------------------------------------------------------------------------- |
| `htmlHandling`     | `auto-trailing-slash` \| `drop-trailing-slash` \| `force-trailing-slash` \| `none` |
| `notFoundHandling` | `single-page-application` \| `404-page` \| `none`                                  |
| `runWorkerFirst`   | `string[]` \| `boolean`                                                            |

**The binding is not a field.** It comes from the `env` record:
`env: { ASSETS: bindings.assets() }`. `convertBindingsAndAssets`
(`@cloudflare/config/dist/index.mjs` ~3103, ~3184, ~3410) picks the env key whose binding
`type` is `"assets"` and writes it as `assets.binding`. `"assets"` is in
`SINGLETON_BINDING_TYPES`, so declaring two is a validation error.

Verified end to end with `assetsDirectory: "./public"`, `assets: { notFoundHandling:
"single-page-application", runWorkerFirst: ["/api/*"] }` and `env: { ASSETS:
bindings.assets() }`:

```
✨ Read 2 files from the assets directory /tmp/…/webtest/public
Your Worker has access to the following bindings:
Binding            Resource
env.ASSETS         Assets
```

### Routing semantics (Cloudflare docs, not local source)

From <https://developers.cloudflare.com/workers/static-assets/>:

> By default, if a requested URL matches a file in the static assets directory, that file
> will be served — without invoking Worker code. If no matching asset is found and a Worker
> script is present, the request will be processed by the Worker. The Worker can return a
> response or choose to defer again to static assets by using the assets binding (e.g.
> `env.ASSETS.fetch(request)`). If no Worker script is present, a `404 Not Found` response
> is returned.

`notFoundHandling` changes only the no-match case: `single-page-application` returns
`200` with `index.html`; `404-page` returns `404` with the nearest `404.html`.

There is an implicit-routing wrinkle that matters for a streaming-SSR framework
(<https://developers.cloudflare.com/workers/vite-plugin/tutorial/>):

> For top-level navigation requests, browsers send a `Sec-Fetch-Mode: navigate` header. If
> this is present and the URL does not match a static asset, the `not_found_handling`
> behavior will be invoked rather than the Worker. This implicit routing is the default
> behavior.
>
> If you would instead like to define the routes that invoke your Worker explicitly, you can
> provide an array of route patterns to `run_worker_first`. This opts out of interpreting
> the `Sec-Fetch-Mode` header.

So for ursprung, where **navigation requests are exactly what the Worker must render**,
`runWorkerFirst` is not optional garnish: without it, a browser navigation to a
non-asset URL never reaches the Worker. `runWorkerFirst: true` sends every request to the
Worker; the array form supports negation (`["/api/*", "!/api/docs/*"]`) and per
<https://developers.cloudflare.com/changelog/post/2025-06-17-advanced-routing/> needs
Wrangler ≥ 4.20.0 (we have 4.119.0).

### Reserved names inside the assets directory

From `wrangler-dist/cli.js` lines 154209–154211 and 155711:
`.assetsignore`, `_redirects`, `_headers`, and `_worker.js` (the last is rejected as a
legacy Pages artifact by `errorOnLegacyPagesWorkerJSAsset`). Route bundles must not collide
with these.

---

## 5. What `deploy --dry-run --experimental-new-config` validates, and what it skips

Cheapest loop confirmed working with **no Cloudflare credentials present**:

```
$ bun run wrangler deploy --dry-run --experimental-new-config
Total Upload: 1.07 KiB / gzip: 0.53 KiB
No bindings found.
--dry-run: exiting now.
```

`wrangler versions upload --dry-run --experimental-new-config` behaves identically.
`wrangler build --experimental-new-config` is a hidden alias for
`deploy --dry-run --outdir=dist` (`cli.js` ~284486).

**Validated:**

- `cloudflare.config.ts` exists, default-exports a worker config, passes
  `InputWorkerSchema` (strict — unknown keys are hard errors).
- `wrangler.config.ts`, if present, passes `WranglerConfigSchema` (strict).
- The legacy `normalizeAndValidateConfig` pass over the converted `RawConfig`
  (`readNewConfig`, `cli.js` ~248464) — its diagnostics' errors are fatal.
- The custom build command runs, and the entrypoint must exist afterwards.
- The entrypoint parses (esbuild, see §3) and yields a worker format.
- With bundling **on**: full module resolution, so unresolved imports fail here.
- Module rules are applied and the additional-module table is printed.
- The assets directory is read and the manifest built; a single asset over 25 MiB is a hard
  error (`MAX_ASSET_SIZE = 25 * 1024 * 1024`, `cli.js` line 154208).
- Bundle size is printed and colourised against `MAX_GZIP_SIZE_BYTES = 3 MiB`
  (`cli.js` line 155717) — the _free-plan_ limit; the number is informational, not enforced.
- Durable Object / Workflow classes are checked to be exported from the entrypoint — but
  only on the bundling path (`bundleWorker`, `cli.js` ~251242), so `noBundle` skips it.

**Skipped** (`cli.js` lines 148977, 149626, 149694, 149817):

- Account resolution and authentication.
- The actual script upload — and therefore all server-side validation: real size limits,
  startup CPU, binding resource existence.
- Asset upload (`syncAssets` is guarded by `!props.dryRun`).
- Route / custom-domain creation. **`domains: ["ursprung.dev"]` is not checked against a
  real zone by a dry run.**
- With `noBundle: true`, essentially all code-level validation beyond a parse of the single
  entrypoint file. A dry run of a no-bundle Worker proves the config is well-formed and
  says almost nothing about whether the Worker runs.

For a no-bundle ursprung, `wrangler dev --experimental-new-config` (which does boot
workerd — it caught the `satisfies` error above) is the only local check that the emitted
module set actually loads. That sits awkwardly against constraint 11 ("no dev server") —
but as a one-shot smoke check for the build's output, not as a development mode.

---

## 6. The Build Output Specification — a ready-made output contract for ticket 21

Undocumented on the Cloudflare docs site, but present and working:

```
$ bun run wrangler build --experimental-new-config --experimental-cf-build-output
```

(`--x-cf-build-output`; requires `--experimental-new-config`, `cli.js` ~284402 and ~284482.)
Observed output tree:

```
.cloudflare/output/v0/workers/default/config.json
.cloudflare/output/v0/workers/default/bundle/index.js
.cloudflare/output/v0/workers/default/bundle/lib.js
.cloudflare/output/v0/workers/default/bundle/nested/deep.js
.cloudflare/output/v0/workers/default/bundle/notes.txt
.cloudflare/output/v0/workers/default/assets/index.html
.cloudflare/output/v0/workers/default/assets/app.css
```

and `config.json`:

```json
{
  "type": "worker", "name": "ursprung-web",
  "compatibilityDate": "2026-08-07", "compatibilityFlags": ["nodejs_compat"],
  "domains": ["ursprung.dev"], "observability": { … },
  "workersDev": false, "previewUrls": true,
  "manifest": {
    "mainModule": "index.js",
    "modules": {
      "index.js": { "type": "esm" },
      "lib.js": { "type": "esm" },
      "nested/deep.js": { "type": "esm" },
      "notes.txt": { "type": "text" }
    }
  }
}
```

Layout constants: `BUILD_OUTPUT_ROOT = ".cloudflare/output"`, `BUILD_OUTPUT_VERSION = "v0"`,
`CONFIG_FILENAME = "config.json"`, `DEFAULT_WORKER_EXPORT = "default"`
(`cli.js` ~283203, from `../build-output-utils/dist/index.mjs`). The `config.json` shape is
`OutputWorkerSchema` = `BaseWorkerSchema` + `manifest`, with `entrypoint` stripped
(`writeWorkerConfig`, `cli.js` ~283188). Module types come from `ModuleTypeSchema`:
`esm | cjs | text | data | json | wasm | python | python-requirement | sourcemap`
(`@cloudflare/config/dist/index.d.mts:472`).

This is worth flagging loudly for ticket 21: **Cloudflare has already specified the
"framework emits a directory, Wrangler deploys it" contract**, and it is a flat
`mainModule` + `modules` map plus an `assets/` tree — exactly the shape constraint 10
("one self-contained ESM file per bundle") produces. Note `"json"` _is_ a valid manifest
module type here even though there is no `rules` type that produces one; that asymmetry was
not investigated further.

I did **not** establish whether anything on the Cloudflare side currently _consumes_
`.cloudflare/output/`, only that Wrangler writes it. Both flags are `hidden: true`.

---

## 7. Workers Builds

This is the weakest area of the findings; I could not run anything in Workers Builds.

**Established from Wrangler's source:** nothing gates `runCustomBuild` on CI. `getEntry`
runs it unconditionally for `deploy` and `versions upload`, and Workers Builds' deploy
command is `bun run deploy` → `wrangler deploy` in this repo. On that reading, a
`build.command` in `wrangler.config.ts` **would** run in Workers Builds, in the root
directory (`apps/web`), because that is where the build's shell starts and
`readNewConfig` uses `process.cwd()`.

**Contradicted by the docs.**
<https://developers.cloudflare.com/workers/ci-cd/builds/configuration/> states:

> Currently, Workers Builds does not honor the configurations set in Custom Builds within
> your Wrangler configuration file.

I could not reconcile these. The most likely reading is that the note means Workers Builds
does not _derive its dashboard build step_ from `[build]` (you must set the dashboard Build
command), rather than that it suppresses the custom build inside `wrangler deploy` — but
that is inference, not a fact I established. **Treat "the custom build command runs under
Workers Builds" as unverified.**

The safe design, and the one this repo already uses, is to put the build in the **deploy
script** (`apps/web/package.json`) or in the dashboard **Build command** field, rather than
relying on `wrangler.config.ts`'s `build.command`. That also keeps the flag in one place,
which is the reasoning already recorded in CLAUDE.md.

Same page, on the root directory: it "defines where the build command will be run" — which
lines up with the `process.cwd()` requirement for the two config files.

---

## 8. Size, module count and startup limits

From <https://developers.cloudflare.com/workers/platform/limits/>:

| Limit                          | Free   | Paid    |
| ------------------------------ | ------ | ------- |
| Worker size, after gzip        | 3 MB   | 10 MB   |
| Worker size, before gzip       | 64 MB  | 64 MB   |
| Static asset files per version | 20,000 | 100,000 |
| Static asset file size         | 25 MiB | 25 MiB  |

Startup, quoted exactly:

> A Worker must parse and execute its global scope (top-level code outside of handlers)
> within 1 second. Larger bundles and expensive initialization code in global scope increase
> startup time.

Wrangler mirrors the free-plan number locally: `MAX_GZIP_SIZE_BYTES = 3 MiB`
(`cli.js` line 155717), used only to colour the "Total Upload" line; and
`MAX_ASSET_SIZE = 25 MiB` (`cli.js` line 154208), which _is_ enforced client-side.

**No documented limit on the number of modules in a Worker**, and I found none enforced in
Wrangler. The 64 MB uncompressed ceiling is the only structural bound on a flat
single-file bundle, and it is far away.

Wrangler has dedicated diagnostics for both server-side failures — `diagnoseScriptSizeError`
and `diagnoseStartupError` (`cli.js` lines 142553 and 142565), the latter pointing at
`https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time` — so both
surface only on a real deploy, never on a dry run.

The relevant risk for ursprung is **startup**, not size: constraint 10 duplicates shared
code across route bundles, but those are client assets, not Worker modules. The server
bundle is one file whose entire top level executes inside the 1 s startup budget. Nothing
measured here; flagged as a thing to measure once a real demo app exists.

---

## 9. Reference: minimal shape for a no-bundle ursprung Worker

Not a recommendation, just the smallest configuration verified to work end to end
(`wrangler dev` served a response from a multi-module, un-bundled worker):

```ts
// cloudflare.config.ts
import { bindings, defineWorker } from "@cloudflare/config";
export default defineWorker({
  name: "…",
  compatibilityDate: "…",
  compatibilityFlags: ["nodejs_compat"],
  entrypoint: "./dist/server/index.js",
  assets: { notFoundHandling: "none", runWorkerFirst: true },
  env: { ASSETS: bindings.assets() },
});
```

```ts
// wrangler.config.ts
import { defineWranglerConfig } from "wrangler/experimental-config";
export default defineWranglerConfig({
  noBundle: true,
  rules: [{ type: "ESModule", globs: ["**/*.js"] }],
  assetsDirectory: "./dist/client",
});
```

`baseDir` would only be needed if the server modules had to live outside
`dist/server/`. `defineWranglerConfig` can be imported from `wrangler/experimental-config`
(the `wrangler` package's `./experimental-config` export) — `@cloudflare/config` does not
export it.

---

## Implications for ursprung

Nothing here contradicts a locked constraint. Two constraints get sharper, and three new
obligations fall on the build.

**No conflict with the locked constraints.**

- **Constraint 10** ("one self-contained ESM file per bundle") is not merely compatible
  with `noBundle` — it is the _easy_ case. A single self-contained server module needs no
  `rules` at all: the entrypoint alone is uploaded, and `findAdditionalModules` finding
  nothing is correct rather than a silent bug. The `rules: [{ type: "ESModule", globs:
["**/*.js"] }]` line above is only needed if ursprung ever emits more than one server
  module. **Recommend ticket 21 keep the server output to exactly one file, precisely so
  the module-rules footgun in §3 never applies.**
- **Constraint 6** (three dependencies, Wrangler dev-only) holds. `@cloudflare/config` is
  a devDependency of the _app_, not of `ursprung`, and `defineWranglerConfig` comes from
  Wrangler itself, so no fourth dependency is implied.
- **Constraint 11** (one entry point, `ursprung build`, no dev server) holds: the build is
  a pure VFS→files function whose output Wrangler then reads. It does not need to be
  invoked through `build.command` at all — and §7 says it probably should not be.
- **Constraint 4** (build-in-a-Worker: injected VFS, no Node APIs) is unaffected. Wrangler
  is the _consumer_ of the output, on the outside.

**New obligations on the build, all of them ticket-21 shaped.**

1. **ursprung must fully strip types and fully resolve imports.** With `noBundle`, Wrangler
   transforms nothing and follows nothing; workerd executes the bytes as JavaScript. A
   `.ts` extension is accepted as a module _name_ but is not a signal — the `satisfies`
   error in §3 is what an un-stripped module looks like in production.
2. **The `nodejs_compat` externals (constraint 15) must survive as bare `node:*`
   specifiers in the emitted file.** That is exactly what `noBundle` gives us for free —
   nothing rewrites them. Worth an explicit test in the demo app, since a dry run will not
   catch a mistake here.
3. **The client output is the assets directory, and navigation routing is a real decision.**
   Per §4, without `runWorkerFirst` a browser navigation to a URL that is not a file is
   handled by `notFoundHandling` and never reaches the Worker — which would silently break
   streaming SSR. `runWorkerFirst: true` (Worker first for everything, deferring to
   `env.ASSETS.fetch()` for real files) is the shape that matches ursprung's model. This
   belongs in the spec, and it touches "Static assets" under _Not yet specified_ on the map.

**Two things to flag to the maintainer.**

- **The Bun-only toolchain has a hole in it.** §1: `wrangler` must run under Node ≥ 22.18.0
  or the experimental config refuses to load. It works today only because `bun run` defers
  the `#!/usr/bin/env node` shebang to the real `node`. This is a documented-as-unsupported
  combination, and CLAUDE.md currently asserts the opposite mechanism. If ursprung ever
  wants to shell out to Wrangler from its own tooling, it must not do so with Bun as the
  runtime.
- **`--dry-run` is close to worthless as a validation loop once `noBundle` is on** (§5). The
  repo's documented "cheapest way to validate a config change" remains true _for config
  changes_ — but it validates almost nothing about emitted code. If v0 wants a smoke check
  that the build's output loads, `wrangler dev` is currently the only one, which sits at the
  edge of constraint 11 and deserves an explicit call in the spec.

**One unresolved question, handed to ticket 21.** §7: whether `build.command` runs under
Workers Builds. If ticket 21 designs the contract so that ursprung is invoked from the
`apps/web` deploy script (or the dashboard Build command) and Wrangler merely reads
already-emitted files, the question never has to be answered. That is the recommendation.

**One opportunity.** §6: `.cloudflare/output/v0/` is Cloudflare's own answer to
"what should a framework emit for Wrangler to deploy" — `mainModule` + a flat `modules`
map + an `assets/` tree. Even if ursprung does not target it, ticket 21 should look at it
before inventing a different shape, and note that it is hidden and experimental.
