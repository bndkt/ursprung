# 21 — The ursprung → Wrangler output contract

Type: grilling
Status: resolved
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

## Answer

**Wrangler drives ursprung, and ursprung validates the configuration rather than writing it.**
The boundary is one output directory with two subdirectories, and every field of the agreement
is checked at build time from configuration the host has already evaluated.

Two of the answers below overturn inputs this ticket was handed as settled. Ticket 05's
"`runWorkerFirst` is required" turns out to be conditional and is **not** required (§4); and the
generated-configuration mechanism the maintainer raised mid-session is **incompatible with the
experimental TypeScript config** in a way that is not documented anywhere (§3).

### 1. The output directory layout

One `outDir`, named in `ursprung.config.ts`, owning both sides:

```
dist/                              <- outDir
  server/
    index.js                       <- Root entrypoint. Fixed name, unhashed (§8)
    routes-3f2a1b9c.js             <- route table
    home-7d6c5b4a.js               <- Route entrypoint
    format.shared-4b3c2d1e.js
    index-9f8e7d6c.js              <- node_modules/capnweb
  client/
    counter.client-5e6f7a8b.js
    index-2c3d4e5f.js              <- node_modules/signal-polyfill
    favicon.ico                    <- copied from the static directory (§5)
    images/logo.svg                <- relative path preserved
```

`outDir/server` is Wrangler's `baseDir` and holds the entrypoint; `outDir/client` **is** the
assets directory. Ticket 14's "one flat directory per side" is preserved exactly — the client
side gains no nesting for ursprung's own output, and copied static files keep whatever relative
paths they had.

**The alternative was to write the client output into a reserved subdirectory of the author's
existing assets directory** (`public/_ursprung/`), leaving author files where they already
live. The maintainer chose one `outDir` owning both sides: the whole build output is then one
tree to gitignore, delete and inspect, and nothing ursprung generates is interleaved with
anything a human wrote. **The cost is §5** — ursprung now has to copy the author's static files,
a job that has nothing to do with compilation.

`outDir` is generated, so it is gitignored. Nothing commits it.

### 2. What Wrangler must be configured with

Nine agreements, all of them checked by the Build host rather than by the build (§3):

| Setting | Required value | Where |
| --- | --- | --- |
| `noBundle` | `true` | `wrangler.config.ts` |
| `entrypoint` | `<outDir>/server/index.js` | `cloudflare.config.ts` |
| `baseDir` | `<outDir>/server` | `wrangler.config.ts` |
| `rules` | contains `{ type: "ESModule", globs: ["**/*.js"] }` | `wrangler.config.ts` |
| `assetsDirectory` | `<outDir>/client` | `wrangler.config.ts` |
| `assets.notFoundHandling` | `"none"` or absent | `cloudflare.config.ts` |
| `compatibilityFlags` | includes `nodejs_compat` | `cloudflare.config.ts` |
| `compatibilityDate` | equals `ursprung.config.ts`'s | `cloudflare.config.ts` |
| `build.command` | invokes ursprung | `wrangler.config.ts` |

The `rules` entry is the one that fails silently and expensively. Ticket 05 established that
`DEFAULT_MODULE_RULES` has **no rule for `.js`**, so without it every module except the
entrypoint is dropped from the upload and the Worker 500s at runtime with nothing said at build
time.

**`preserveFileNames` is not in this table, and checking it was the plan until it turned out to
be irrelevant.** Both call sites that hash a collected module's name live inside the esbuild
module-collector plugin, which `noBundle` switches off; the `noBundle` path is
`findAdditionalModules`, which names modules `path.relative(moduleRoot, file)` with no hashing
and never consults the flag. Ticket 05 had already observed the naming empirically — this is
just the reason it holds.

**The `compatibilityDate` agreement is new and nobody had noticed it.** Ticket 13 generates the
permitted `node:*` table from `ursprung.config.ts`'s `compatibilityDate`, while the deployed
Worker runs at `cloudflare.config.ts`'s. If they diverge, the build computes the permitted
externals set for a **different runtime than the one that will execute** — the failure is a
Worker that fails at startup on a specifier the build approved. Collapsing the duplication by
having ursprung read the date from `cloudflare.config.ts` was considered and rejected: the build
never sees the Wrangler configs at all (§3), so its own config must carry every value it
compiles against. So the date stays on `ursprung.config.ts`, and the host asserts the two equal.

### 3. Wrangler drives ursprung — and the generated-configuration route is closed

`build.command` in `wrangler.config.ts` invokes ursprung; the author's deploy command stays a
plain `wrangler deploy`. **The maintainer's reason was that ursprung should be as invisible as
possible** — a line in a config rather than a step in a pipeline. Ticket 23 established this
path runs under Workers Builds.

ursprung does not write the Wrangler configuration. It checks it — and **the check belongs to
the Build host, not to the build.** The host evaluates `cloudflare.config.ts` and
`wrangler.config.ts`, and it already holds `outDir` and the `compatibilityDate` from
`ursprung.config.ts`, so it can compare §2's nine agreements **before it calls `build` at all**.

**This was originally specified as a check inside the build, and that was wrong.** The test that
settles it is which inputs each agreement needs. Five — `noBundle`, `rules`, `notFoundHandling`,
`compatibilityFlags`, `build.command` — need only the Wrangler configs. The other four —
`entrypoint`, `baseDir`, `assetsDirectory`, `compatibilityDate` — need the Wrangler configs plus
two scalars from `ursprung.config.ts`. **None needs the graph, the emitted modules, or anything
else the build computes**, so passing the Wrangler configs into the build bought nothing and
widened its input for no reason.

So **constraint 17 is untouched**: the build's input stays exactly `{ vfs, config }`. And
**ticket 08's stance that ursprung does not know Wrangler exists survives intact** rather than
being narrowly reversed — it is the *host* that knows, which it must anyway, because it is the
thing Wrangler invokes. This also agrees with constraint 4: Wrangler-shaped knowledge and Node
APIs both live on the host side of that line.

**One check does need build output, and it runs on the other side of the build.** Whether the
author's `rules` globs actually match the emitted server filenames — as opposed to merely
containing a plausible-looking pattern — is only answerable once the filenames exist. The host
answers it from the Emission records the build already returns (ticket 14 §12). So the host
checks the configuration before the build and the coverage after it, and the build itself
carries neither.

**The cost is a diagnostics seam**, and it is payable. Ticket 10 has `build` return every
diagnostic in one batch, because agents are first-class users; a host-side check reports outside
that batch. Ticket 11 fixed the `Diagnostic` shape with a required `remedy`, so the host emits
the same shape and prints both together. That is a merge at the point of reporting, not a second
channel for a reader to discover.

**The generated-configuration mechanism was investigated and is not available.** Cloudflare
documents `.wrangler/deploy/config.json`, a redirect that points Wrangler at a build-generated
configuration — the mechanism the Vite plugin uses, and exactly the shape of "the author writes
no Wrangler config, or writes one ursprung merges with what it needs". It is real and
implemented: `findRedirectedWranglerConfig` resolves it and `deploy`, `dev` and `versions
upload` opt in via `useConfigRedirectIfAvailable`.

**It is unreachable from `--experimental-new-config`.** `readNewConfig` never looks for the
redirect; it calls `loadNewConfig`, which resolves `cloudflare.config.ts` and
`wrangler.config.ts` from `process.cwd()` and nothing else. The dev path makes the exclusion
explicit as an if/else — `newConfigEnabled ? readNewConfig(...) : readConfig(..., {
useRedirectIfAvailable: true })`. Established from wrangler 4.119.0's source; it is documented
nowhere, and the redirect documentation does not mention the new config format at all.

So the two are alternatives, not complements, and **`build.command` cannot survive the switch**
for three independent reasons:

- **The field goes invisible.** `build.command` lives in `wrangler.config.ts`, which Wrangler
  stops reading on the legacy path. It would have to be re-expressed inside the generated
  configuration — a file ursprung writes — so ursprung would be asking Wrangler to run ursprung.
- **Bootstrapping.** Wrangler must read a configuration to learn `build.command` exists. Under
  the redirect that configuration *is* the generated one, which only exists after ursprung has
  run. A clean checkout has neither file, so nothing invokes the build.
- **Staleness.** Even on later builds Wrangler parses the previous build's generated
  configuration and only then runs the command that rewrites it. `main`, `rules` and `baseDir`
  are stable enough to survive; anything copied through from the author — `compatibilityDate`,
  `domains`, `observability`, bindings — sits one build behind whenever the author edits it.

Adopting the redirect therefore means `ursprung build && wrangler deploy`, which is the more
honest reading of constraint 11's "one entry point" but makes ursprung a visible pipeline stage.
**Recorded rather than discarded**: if the experimental config format ever gains redirect
support, this becomes a live choice again, and the trigger is one thing — `readNewConfig`
consulting `findRedirectedWranglerConfig`.

### 4. Asset routing: nothing is configured, and `runWorkerFirst` is not required

**Ticket 05's "`runWorkerFirst` is required or navigations never reach the Worker" is
conditional, and the condition does not hold here.** Cloudflare's default routing is: a request
matching a file in the assets directory is served from the asset store **without invoking the
Worker**; a request matching nothing is processed by the Worker. Module fetches are always
hits, route paths are always misses. That is precisely the split ursprung wants, for free.

`runWorkerFirst` only becomes necessary when `notFoundHandling` is set to
`single-page-application` or `404-page`, which intercept the misses. So the contract requires
`notFoundHandling` to be `"none"` — §2's sixth row — and `runWorkerFirst` is left unset.

`runWorkerFirst: true` is not merely unnecessary but **wrong**: it routes every request to the
Worker, which must then serve assets itself through `env.ASSETS.fetch()`. This repo deliberately
has no `ASSETS` binding, so every client module would 404.

**What this gives up, chosen with the alternatives on the table.** A reserved `/_ursprung/`
prefix plus `runWorkerFirst: ["/*", "!/_ursprung/*"]` was offered and declined in favour of the
minimal contract. Two costs are accepted:

- **An author static file whose path matches a route silently shadows it.** `index.html` at the
  assets root captures `/` and the renderer never runs. The failure is a page that renders the
  wrong thing, not an error. This is a new hazard created by §1 putting author files and
  generated modules in one directory.
- **There is no stable path prefix to attach immutable cache headers to later.** Content-hashed
  filenames are what make those headers safe (ticket 14 §2), so the ability is wanted; adding it
  later means introducing a prefix, which moves every client URL.

Client modules are consequently served from the assets root: `/counter.client-5e6f7a8b.js`.
**The HTML references them root-absolutely**, which is the one place in the whole output where a
path is hard-coded — ticket 14 §6 keeps *module* specifiers relative precisely so the directory
can move, and that property survives here because moving it re-renders the HTML without
re-emitting a single module.

### 5. ursprung copies the author's static files

`ursprung.config.ts` names a static directory. The build reads those files from the VFS as
opaque bytes and emits them into `outDir/client` with relative paths preserved — no processing,
no hashing, no participation in the module graph. Ticket 10 already made this representable:
reads and outputs are both `Uint8Array`.

This is a direct consequence of §1 and is the price of that choice. Two things it costs:

- **ursprung owns a file-copying job unrelated to compilation**, and the host must populate the
  VFS with those files, which grows what a build host has to know.
- **The static directory is a second root the build reads**, so ticket 10's byte-identical-output
  guarantee now depends on the enumeration of that directory being sorted too.

**This does not close the "static assets" fog patch**, and deliberately so. It answers who moves
the files and where they land. Which files are eligible, and ticket 14 §9's separate hazard —
`new URL("./data.json", import.meta.url)` resolving against a flat emitted directory where no
such file exists — remain open there.

### 6. The preload closure lives in the Route entrypoint

The constraint 10 amendment made the client side a request waterfall: fetch a client root, parse
it, discover its imports, fetch those. ursprung renders the HTML and knows the whole graph, so it
emits `<link rel="modulepreload">` for **the full transitive client-module closure of the
matched Route** — not just ticket 12's client roots. Every fetch then starts in parallel with the
document and the waterfall collapses to one round trip.

**That set is carried by each Route entrypoint**, beside its layout chain, component and api
handlers — not by the route table. The route table is loaded at startup and stays purely about
matching and specificity; Route entrypoints are imported lazily once the router matches, so an
isolate only ever evaluates the closure for Routes it actually served.

Two costs, both accepted:

- **A Route reaching a large client dependency preloads all of it**, whether or not any
  interaction ever needs it. Preloading is not evaluation, so this is bandwidth and connection
  pressure rather than the eager evaluation Resumption exists to avoid — but on a large graph it
  is not free.
- **The preload set is invisible until you open the Route's module.** "What does `/` preload"
  is answered by ticket 14 §12's emission records, not by reading one file.

Note what this does **not** buy on the server: ticket 27 established every uploaded module is
V8-compiled at startup regardless, so nothing here is justified on startup cost.

### 7. There is no manifest file

§6 answers the ticket's manifest question by dissolving it. The Route-to-modules mapping is
baked into generated modules the server already loads — the route table for matching, the Route
entrypoint for its own preload closure — so there is no file to read, no format to version and
no `ASSETS` binding needed to fetch one.

A runtime manifest was never really available: a Worker has no filesystem, so "read a manifest"
means either importing a generated module, which is baking it in through a longer road, or
fetching an asset over a subrequest on the render path.

### 8. The Root entrypoint is `index.js`

Ticket 14 §7 established that the Root entrypoint is the one emitted module that cannot be
content-hashed, because Wrangler is configured with it by name, and handed the exact string
here. It is `index.js`, at `<outDir>/server/index.js`.

With `baseDir` = `<outDir>/server`, its module name in the upload is `index.js`, and every
sibling module is named by its bare filename — which is what makes ticket 14 §6's `./<filename>`
specifiers resolve correctly inside workerd's registry.

### 9. Cloudflare's build-output specification is out of scope

Ticket 05 flagged `.cloudflare/output/v0/` — a `mainModule` plus a flat `modules` map and an
`assets/` tree — as Cloudflare's own "framework emits a directory, Wrangler deploys it"
interface, and close to what ursprung produces. **It is write-only.** Wrangler 4.119.0 has
`writeWorkerConfig`, `writeRootConfig` and `cleanBuildOutputDir` and **no reader**; `deploy` and
`versions upload` never touch those paths. Research §6 left this open ("I did not establish
whether anything on the Cloudflare side currently *consumes* it"); it is now established for
this version.

So adopting it cannot be justified as interoperating with the platform's deploy path — that path
does not exist. Emitting it in addition to the real output would be a bet that a write-only
format later becomes a read path, paid for now. **Ruled out of scope**, with the same revisit
trigger shape as ticket 28's: a Wrangler release in which a deploy-side command reads
`.cloudflare/output/v0/config.json`.

### 10. Validation: boot the emitted output in real workerd, in CI

Ticket 05 established `--dry-run` under `noBundle` proves almost nothing — the config is
well-formed and the single entrypoint parses. That is not a check of this contract.

The gate extends ticket 22's existing harness rather than adding machinery: build the fixture
application, then start the **emitted output** in real workerd via wrangler's
`unstable_startWorker`, configured with exactly §2's `noBundle`, `rules`, `baseDir` and assets
settings. Assert that routes render, that lazily imported Route entrypoints resolve at request
time, and that client modules are reachable. `wrangler` is already a dev dependency and the
`workerd` binary is already on disk via miniflare, so this needs no Cloudflare account and
`check.yml` can gate it — which is what ticket 22's ruling requires, since a gate depending on
Workers Builds fails open on fork pull requests.

**The honest limit**: this asserts against miniflare's reading of the configuration, not against
the real upload path. A divergence in how the deployed upload names or collects modules would
still slip through, and the per-release check against the preview URL stays the only thing that
exercises it.

This also discharges ticket 13's first rider as far as it can be discharged. `nodejs_compat` is
now a checked agreement (§2), so an application omitting the flag fails **before the build runs**
rather than at Worker startup. Note where the check sits: ticket 13 said "the Wrangler-facing
output contract is the one place this could actually be verified", and that turns out to be the
Build host rather than the build — which is why it costs constraint 17 nothing. The check is
still a diagnostic about a file ursprung does not own, and an author who deploys by some other
route gets the startup failure as before.

### Consequences and riders

- **A rider nobody had raised: content-hashed assets and stale HTML.** Cloudflare's own
  documentation names this exact hazard for gradual deployments — HTML from version A references
  `counter.client-5e6f7a8b.js`, the request is routed to version B, which does not have that
  file, and the page breaks. ursprung emits content-hashed filenames by ADR-0010, so it is
  squarely in the affected class. v0 does nothing about it: gradual deployments are opt-in and
  this repo does not use them. **The mitigation is version affinity**, configured outside
  ursprung entirely (a header plus a Transform Rule), so it is documentation rather than design.
  A related, milder case exists without gradual deployments — a browser holding old HTML across
  an ordinary deploy — and it resolves itself on reload.
- **Ticket 08's `outDir` now has an exact meaning**: the root of §1's tree, with `server/` and
  `client/` beneath it, both generated wholesale.
- **`build.cwd` should be left unset.** Ticket 23 found `cwd` is passed to execa unnormalised, so
  it resolves against `process.cwd()` rather than the config directory — while `watch_dir`
  resolves against the config. Leaving it unset makes the build's working directory the same
  place `loadNewConfig` reads the two config files from, which is the only arrangement where
  every relative path in every config means the same thing.
- **`WRANGLER_COMMAND` is available** to ursprung when Wrangler invokes it, distinguishing
  `deploy` from `versions upload`. v0 has no use for it; recorded by ticket 23 so it is not
  rediscovered.
- **Handed to the fog.** §4's shadowing hazard and the missing cache-header prefix both argue for
  a reserved client prefix; if either bites, that is the fix, and it moves every client URL.

## Comments

**2026-08-08 — how §3 was reached.** The generated-configuration route was raised by the
maintainer mid-session as a way to make the author write no Wrangler configuration at all, or to
have ursprung merge its settings into one the author wrote. It was not rejected on preference:
it was traced through wrangler 4.119.0 and found unreachable from `--experimental-new-config`,
and the maintainer then identified independently that it would also cost `build.command`. The
three reasons in §3 are the write-up of that exchange. Both halves are worth keeping, because
the incompatibility is undocumented and the next session to have this idea will otherwise
re-derive it from scratch.

**2026-08-08 — §3 corrected: the configuration check moved from the build to the Build host.**
As first written, §3 had the host pass the evaluated Wrangler configs *into* the build, and
proposed widening constraint 17 to carry them. The maintainer asked why the build receives the
Wrangler configuration. It does not need to, and the answer took one test: enumerate the inputs
each of §2's nine agreements needs. Five need only the Wrangler configs; four need those plus
`outDir` and `compatibilityDate` from `ursprung.config.ts`. **None needs the graph or the
emitted output**, so every one of them is computable before `build` is called.

The correction is strictly a simplification, which is the sign it is right: constraint 17 stands
unchanged, the proposed amendment is withdrawn, and ticket 08's Wrangler-ignorance survives
whole instead of being "narrowly reversed". The only thing given up is that the configuration
diagnostics no longer arrive in ticket 10's single batch — payable, because ticket 11 fixed the
`Diagnostic` shape and the host can print both sets together.

Worth keeping as a pattern: the original error was not a wrong decision but a **misplaced** one.
"Who checks this?" was never asked, so the check landed in the build by default, and the
constraint amendment was invented to make room for it. An amendment proposed to accommodate a
detail nobody argued for is worth re-reading before it is sent.
