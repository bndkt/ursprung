# 27 — Can workerd import a module lazily, during a request?

Type: research
Status: open
Blocked by: —
Map: [Ursprung v0](../map.md)

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

### Established already, do not re-research

Confirmed this session against developers.cloudflare.com:

- Additional modules **can** be uploaded alongside the entrypoint via `rules`
  (`type: "ESModule"`, `globs`), "making these modules available to be imported when your
  Worker is invoked".
- `find_additional_modules` walks the tree below `base_dir` and **defaults to `true` when
  `no_bundle` is `true`** — which is Ursprung's configuration per ticket 05.
- `preserve_file_names` defaults to **false**, and Wrangler then prepends a content hash
  to each module's name (`34de60b4…-favicon.ico`). Emitted import specifiers would not
  survive that, so this almost certainly must be `true`. Confirm it.
- The Worker startup limit is **1 second** since 2025-10-10, raised from 400 ms.

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
  modules importing the same shared module share one instance? This decides the
  self-contained-versus-shared fork on constraint 10, and it is exactly the hazard ticket
  02 found: two copies of the signal polyfill are two disjoint graphs, and the failure is
  silent.
- Does `no_bundle` upload interact with dynamic import at all — are dynamically-imported
  modules discovered by `find_additional_modules`, given imports are **not** followed
  (ticket 05)? Discovery is by glob, so probably yes, but confirm.

Write the findings to `.scratch/ursprung-v0/research/27-dynamic-import.md`, citing the
source for each claim, and mark clearly anything read from source code rather than docs.

## Answer should record

Whether the proposal is possible at all, and under what flags, limits and file-naming
rules. If it is not possible, say what the fallback is, because the map's Server bundle
model then stands as originally written.
