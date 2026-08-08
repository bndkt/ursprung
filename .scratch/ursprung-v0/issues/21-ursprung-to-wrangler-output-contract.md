# 21 — The ursprung → Wrangler output contract

Type: grilling
Status: open
Blocked by: 14, 23, 27
Map: [ursprung v0](../map.md)

## Question

> **Premise changed 2026-08-07 — constraint 10 was replaced and approved.** This ticket
> says "the server bundle" and "each route's client bundle" as if each were one file.
> Neither is. The server output is a **root entrypoint plus one module per Route** plus
> whatever modules more than one entrypoint reaches; the client output is **one entry
> module per Route** plus the same. Read every "bundle" below as a set of modules.
>
> Two of the questions below are affected. **Client bundle naming is no longer open**:
> constraint 10 settles it as content-hashed **filenames**, and forbids the query-string
> form outright, because workerd's registry keys on the resolved specifier and `?v=2`
> mints a second instance of the same module. **The manifest question grows** — the
> mapping is now Route to a set of modules, not Route to a file.
>
> And the amendment hands this ticket a new obligation it did not have: a module graph is
> a **request waterfall** where a self-contained bundle was one request. ursprung controls
> the HTML because it does Server rendering, so it can emit `<link rel="modulepreload">`
> for exactly the modules a Route needs, in parallel with the document. **Design that
> mitigation here; do not assume it.**

ursprung owns building; Wrangler owns deploying. The boundary between them is a
directory of files in a deterministic layout. Ticket 05 supplies what Wrangler's
experimental TypeScript config actually supports; ticket 14 supplies what the bundles
look like. This ticket writes the contract.

Decide:

- **The output directory layout.** Exact paths for the server bundle, each route's
  client bundle, and any manifest. It must be deterministic (ticket 10) and it must be
  something a human or agent can look at and understand without running anything.
- **Is there a manifest, and who reads it?** The server bundle needs to know which client
  bundle belongs to which route in order to emit the right script tag (ticket 18). That
  mapping can be baked into the server bundle at build time or read from a manifest at
  runtime. Baking it in is more explicit and needs no file; decide.
- **Client bundle naming.** Content-hashed for cache-busting, or stable names? Hashing
  fights determinism-by-inspection and complicates the manifest; stable names fight HTTP
  caching. Pick and say why.
- **How the Worker entry is expressed.** Wrangler's config points at an entrypoint; with
  bundling disabled, what does it accept and does it follow imports? Ticket 05 answers
  this — turn the answer into our emitted shape.
- **How client bundles are served.** As Wrangler assets, or from the Worker itself?
  If assets: the directory layout, the binding, the routing interaction with the Worker's
  fetch handler, and what happens on a miss.
- **Whether ursprung generates the Wrangler config or the author writes it.** The vision
  says the author's config declares the custom build command that invokes ursprung — so
  the config is an input. But it also has to agree with our output layout on several
  fields. Decide whether that agreement is enforced (we read and validate the config) or
  merely documented, and note that constraint 13 means we cannot assume a real filesystem.
- **Whether to adopt Cloudflare's own build-output contract.** Ticket 05 found that
  `wrangler build --x-cf-build-output` emits `.cloudflare/output/v0/` — a `mainModule`
  plus a flat `modules` map and an `assets/` tree, which is Cloudflare's existing
  framework→Wrangler interface and close to what constraint 10 already produces.
  Adopting it means interoperating with a moving experimental target; inventing our own
  means diverging from the platform. Decide deliberately.
- **The deploy-time validation loop.** Ticket 05 found `--dry-run` under `noBundle`
  validates almost nothing — only that the single entrypoint parses. So what _does_
  prove the contract holds without shipping, and does it belong in this repo's CI?

## Established by ticket 05 — treat as input, not open

- `noBundle` is expressible: it lives on `WranglerConfig` in the sibling
  `wrangler.config.ts`, alongside `build: { command, cwd, watchDir }` and
  `assetsDirectory`. **The ticket's original main risk did not materialise.**
- Under `noBundle` the entrypoint is uploaded byte-for-byte and imports are **not**
  followed. `findAdditionalModules` walks the **filesystem** under `moduleRoot`, matching
  module rules — not the import graph. `DEFAULT_MODULE_RULES` covers only Text, Data and
  CompiledWasm, so **there is no default rule for `.js`** and sibling modules are silently
  omitted from the upload, producing a Worker that 500s at runtime with no warning.

  > **The implication flipped 2026-08-07.** This used to read "the one-file-per-bundle
  > rule is what makes this safe". Under the pending constraint 10 amendment ursprung
  > deliberately emits **many** server modules, so safety now comes from setting the rule
  > explicitly, and `rules`, `baseDir` and `preserveFileNames` become part of this
  > contract rather than fields we never touch. Ticket 05 already verified the mechanism
  > works — `rules: [{ type: "ESModule", globs: ["**/*.js"] }]` attached `lib.js` and
  > `nested/deep.js`, and `wrangler dev` resolved them — so this is a contract to write,
  > not a risk to research.

- **Module naming under `noBundle` is predictable and unhashed**: names are
  `path.relative(moduleRoot, file)` with nested directories preserved, and `moduleRoot`
  defaults to the entrypoint's own directory, overridable via `baseDir`. Anything outside
  the module root cannot be named and is not collected — which constrains the output
  layout this ticket designs. **Relative specifiers resolve against the module's own name
  inside the uploaded set**, verified by running `wrangler dev`.
- There is **no JSON rule type**. A `.json` file ships as `Text` and is `JSON.parse`d, or
  is inlined into the JavaScript. Relevant if the manifest question below lands on a file.
- Asset settings straddle both config files, and **`runWorkerFirst` is required** or
  browser navigations are answered by `not_found_handling` and never reach the Worker,
  which would silently break streaming SSR.
- The build command runs before entrypoint resolution, with cwd = `process.cwd()`, which
  is where both config files must live. Whether that holds under Workers Builds is
  ticket 23, which now blocks this one.
- **Caching headers and immutability** for client bundles, if we control them.

## Input from ticket 08 — decided, not open

- **The route table must be generated and emitted by the bundler.** The Route file is
  build input, not a module in the graph (constraint 9's "reached by the graph" excludes
  it), so the runtime router cannot import it. This is likely an upside: a generated table
  can carry already-resolved specifiers and pre-sorted specificity instead of re-deriving
  them per request. See [ticket 08](./08-route-and-config-authoring-api.md), decision 3.
- **`outDir` is a field on `ursprung.config.ts`.** Ticket 08 put it there provisionally
  and left its exact meaning — and how it lines up with Wrangler's `assetsDirectory` and
  entrypoint path — to this ticket.

## Handed here by ticket 27 — obligations, not open questions

[Ticket 27](./27-workerd-dynamic-import-at-request-time.md) established that workerd
permits `import()` at request time and gives one instance per **resolved specifier**.
Three consequences land on this ticket's contract:

- **One canonical specifier per module, content-hashed in the filename — never a query
  string.** The registry keys on the resolved specifier, not the file, so `./signals.js`
  and `./signals.js?v=2` are two instances of one module: two reactive graphs, failing
  silently, which is ticket 02's trap arriving by a different door. This directly settles
  this ticket's "client bundle naming" bullet in favour of hashed filenames, and rules out
  query-string cache-busting outright.
- **Emitted Route modules must have I/O-free, top-level-await-free top levels.** Both
  registries evaluate modules with the `IoContext` suppressed, and the legacy registry
  hard-fails unsettled top-level await. The failure moves from deploy time to
  first-request-to-that-Route, so it wants a **build-time check** rather than a runtime
  surprise.
- **The router should hold the imported namespace, not re-`import()` per request** — the
  legacy path costs an event-loop yield and a lock re-acquisition each time.

Also relevant to the request-waterfall mitigation this ticket owns: ticket 27 confirms the
server side is genuinely lazy in *evaluation*, but **every uploaded module is V8-compiled
at startup regardless**. Splitting by Route does not keep startup flat as routes are added,
so no part of this contract should be justified on that basis.

## Input from ticket 12 — decided, not open

- **The server output's shape is fixed.** One generated **Root entrypoint** carrying the
  router and the generated route table, lazily importing N generated **Route entrypoints**,
  each self-sufficient — its own `layout`/`component`/`api` modules plus its full ancestor
  Layout chain, so one import satisfies a matched request. Ancestor layouts fall out as
  Common modules with no extraction rule.
- **There is no per-Route client entrypoint.** Client roots are the modules at a
  `→ client` crossing, each an independent root, because a generated per-Route entry would
  evaluate every Client component eagerly and undo Resumption.
- **The preload input this ticket was promised exists.** The graph records, per Route,
  which client roots that Route reaches — that set is what the `<link rel="modulepreload">`
  mitigation is computed from.

See [ticket 12](./12-module-graph-and-two-colour-derivation.md), decisions 5 and 9.

## Input from ticket 13 — two obligations

[Ticket 13](./13-module-resolution-rules.md) hands this ticket:

1. **`nodejs_compat` is assumed by the build and cannot be verified there.** The permitted
   `node:*` set is computed from ticket 08's `compatibilityDate`, but compatibility *flags*
   are not in the Config, so an application that never enabled the flag gets a Worker that
   fails at **startup** rather than a build that fails at build time. The Wrangler-facing
   output contract is the one place this could actually be checked — whether it should be,
   and what ursprung is willing to know about Wrangler in order to do it, is this ticket's
   call. Ticket 08 deliberately kept ursprung ignorant that Wrangler exists.
2. **External specifiers pass through untouched.** `node:*` and `cloudflare:*` are the only
   strings in the output that must survive specifier rewriting and content-hashing verbatim,
   and they are what the deployed Worker asks its host to resolve.

## Input from ticket 22 — the deploy-shaped coverage CI declines

[Ticket 22](./22-testing-strategy.md) §2 rules that the browser layer drives a **locally**
served demo app rather than the deployed preview URL, because `check.yml` and Workers Builds
are two CI systems with no handshake and Workers Builds does not build fork pull requests, so a
gate depending on it fails open. The coverage that ruling gives up lands here: `noBundle`
upload, asset routing, `runWorkerFirst` and the custom domain are exercised only by a
per-release agent check against the preview URL, never by CI.

That makes this ticket's output contract the place where those properties are stated precisely
enough to be checked by hand — and it sharpens ticket 13's first rider rather than replacing
it: if `nodejs_compat` is to be verified anywhere, nothing downstream of this ticket will catch
it either.
