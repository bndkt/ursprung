# 27 — Can workerd import a module lazily, during a request?

Type: research
Status: resolved
Blocked by: —
Map: [ursprung v0](../map.md)

## Question

The maintainer proposes replacing the single Server bundle with **one root entrypoint
plus one server entrypoint per Route**, the root running the router and importing the
matched Route's module lazily. The whole proposal rests on one platform fact that this
session could not confirm from Cloudflare's documentation.

**Does workerd permit `import()` of an uploaded module from inside a `fetch` handler —
that is, after startup — and if so, is the module's evaluation charged to request CPU
time or to the startup budget?**

Do not answer this from recollection. The map has already been bitten once by a
plausible derived conclusion (ticket 01's registry key-order trap); treat anything not
read from a primary source as unestablished.

### Established already — do NOT re-research

**The whole upload-and-linking half is already answered by
[ticket 05](./05-wrangler-experimental-config-and-build-contract.md)**, from Wrangler's
source plus verified `wrangler dev` runs. It is stronger evidence than the public docs.
Read [`research/05-wrangler.md`](../research/05-wrangler.md) before starting.

- Multi-module upload under `noBundle` **works**. `rules: [{ type: "ESModule", globs:
  ["**/*.js"] }]` attached `lib.js` and `nested/deep.js`, and **relative specifiers
  resolved against the module's own name inside the uploaded set** — verified by running
  it, not inferred.
- `findAdditionalModules` walks the **filesystem**, not the import graph. So a
  dynamically-imported module is collected by glob like any other, and ticket 05's
  "imports are not followed" finding is **not** an obstacle here.
- Module names are `path.relative(moduleRoot, file)`, nested directories preserved,
  **not content-hashed** under this path. An earlier draft of this ticket claimed
  `preserve_file_names` would mangle them; that claim came from the public docs describing
  the *bundling* path and is **withdrawn** — ticket 05 observed unhashed names directly.
- `rules`, `baseDir`, `findAdditionalModules` and `preserveFileNames` are all available on
  `wrangler.config.ts`, so none of this needs the JSON config format.
- The Worker startup limit is **1 second** since 2025-10-10, raised from 400 ms
  (developers.cloudflare.com).

What is left is genuinely only the **runtime** half, below.

### What to establish

- The central question above. Look for an explicit statement, a compatibility flag, or a
  runtime error string. Check workerd's source if the docs are silent — the module
  registry and the "disallowed operation in this context" family of errors.
- If dynamic import at request time is **not** permitted: is there any other mechanism
  that defers *evaluation* of an uploaded module until first use? A permitted static
  import still evaluates at startup, which would defeat the whole proposal.
- If it **is** permitted: which budget does evaluation land in? If evaluation is charged
  to request CPU, a large Route module could exhaust the request budget on the first
  request to that Route — turning a startup problem into a per-Route latency cliff. That
  changes whether the proposal is a win at all.
- Does workerd's module registry give **one instance per specifier**, so that two Route
  modules importing the same shared module share one instance? **This one is now
  load-bearing.** The maintainer has decided the server extracts shared modules rather
  than duplicating them (second pending amendment on the map), and extraction is only
  safe if the registry guarantees a single instance. If it does not, two Route modules
  importing the signal polyfill get two disjoint graphs and the failure is silent —
  exactly what ticket 02 found on the client.
Do **not** spend effort on upload, module naming, or specifier resolution — see the block
above. If the runtime answer is yes, this ticket is short.

Write the findings to `.scratch/ursprung-v0/research/27-dynamic-import.md`, citing the
source for each claim, and mark clearly anything read from source code rather than docs.

## Answer should record

Whether the proposal is possible at all, and under what flags, limits and file-naming
rules. If it is not possible, say what the fallback is, because the map's Server bundle
model then stands as originally written.

## Answer

**Yes, and with no compatibility flag.** Full findings in
[`research/27-dynamic-import.md`](../research/27-dynamic-import.md), established from
workerd's source at commit `22b2a002` (2026-08-07) plus its committed test suite, with
developers.cloudflare.com as the secondary source. Every claim there is tagged
`[SOURCE]` / `[DOCS]` / `[TEST]`.

`import()` from inside a `fetch` handler is not merely tolerated on workerd — it is the
designed-for path. `Worker::Script::Impl::configureDynamicImports` (`io/worker.c++:902`)
branches on `IoContext::tryCurrent()`, and the **in-request branch is the first one**;
the comment calls the no-request case "weird, but allowed". It is not in the
"Disallowed operation called within global scope" family at all — that error fires from
`IoContext::current()` when there is *no* request, guarding the opposite direction.
workerd's own `module-test.js` does `await import('a/b/c')` inside a `test()` handler
with only `nodejs_compat` set, i.e. on the default legacy registry. The proposal is
possible.

**The budget answer is three-way, not two-way.** On the default (legacy) registry the
evaluation is charged to neither request CPU nor startup, but to a **third peer
budget**, `IsolateLimitEnforcer::enterDynamicImportJs` (`io/limit-enforcer.h:57`,
entered at `io/worker.c++:926`), while the request itself sits on `awaitIo`. Its size is
**not establishable**: workerd's open-source enforcer is a no-op stub and the production
one is closed, and the docs publish nothing for it. Under the experimental
`new_module_registry` flag there is no separate scope and evaluation charges to the
**ambient request CPU budget** — workerd says so in two comments (`io/worker.c++:903`,
`jsg/modules-new.c++:1318`). That is the ticket's feared case, but against a 30-second
ceiling rather than a 1-second one, so the "per-Route latency cliff" is a real shape and
a small one. `new_module_registry` is `$experimental` with no `$compatEnableDate` and is
absent from the public compatibility-flags page: **v0 must design for the legacy
registry.**

**The registry does guarantee one instance per resolved specifier, so extraction is
safe.** Legacy: one `kj::Table` entry per `(kj::Path, Type)`, mutated in place from
source to a single `ModuleInfo` holding one `v8::Module`, reached by both the static and
the dynamic resolve paths, with `instantiateModule` short-circuiting on `kEvaluated`.
Relative specifiers normalise against the referrer's parent path, so two Route modules at
different depths reaching one shared module land on the same entry. The new registry
states the guarantee outright and tests it. **One trap:** the key is the resolved
specifier, not the file — under the new registry `./signals.js?v=2` is a *second
instance* of the same file, which is ticket 02's silent failure exactly. The emitter's
obligation is one line: content-hash the **filename**, never a query string, and emit
one canonical specifier per module.

**The finding the ticket did not anticipate, and the one worth carrying forward.** On
the legacy registry, lazy `import()` defers **evaluation only — not compilation**.
`WorkerdApi::compileModules` (`server/workerd-api.c++:515`) V8-compiles *every* uploaded
module at startup under `enterStartupJs`, imported or not; workerd's own architecture doc
lists this as characteristic #2 ("Eager compilation for bundle modules"). So splitting
into N Route modules removes unmatched Routes' top-level *work* from the 1-second startup
budget, but not their *parse cost*. The new registry is fully lazy on both. This does not
threaten the amendment — its stated server-side rationale is **upload size**, which is
untouched and still correct — but it kills the adjacent unstated hope that lazy imports
keep startup flat as routes are added. That sentence must not end up in the spec.

**Three obligations fall out**, all ticket-21/ticket-14 shaped: (1) one canonical
specifier per module, filename-hashed, never query-hashed; (2) emitted Route modules must
have I/O-free and top-level-await-free top levels — both registries evaluate modules with
the `IoContext` suppressed (`io/worker-modules.h:97` asserts it), and the legacy registry
hard-fails unsettled TLA with "Top-level await in module is unsettled." The failure mode
moves from deploy time to first-request-to-that-Route, so it wants a build-time check;
(3) the router should hold the imported namespace rather than re-`import()`ing per
request, since the legacy path costs an event-loop yield and a lock re-acquisition each
time.

**No fallback is needed.** The map's original constraint 10 does not stand for the
server. One dev-loop caveat recorded so it is not mistaken for a platform limit later:
`@cloudflare/vitest-pool-workers` does not support `import()` inside `export default`
handlers — that is a harness bug, not a runtime restriction, and v0 does not use it.
