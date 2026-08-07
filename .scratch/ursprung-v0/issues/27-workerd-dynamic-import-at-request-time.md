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
