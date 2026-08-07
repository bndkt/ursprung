# 21 — The Ursprung → Wrangler output contract

Type: grilling
Status: open
Blocked by: 14, 23
Map: [Ursprung v0](../map.md)

## Question

Ursprung owns building; Wrangler owns deploying. The boundary between them is a
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
- **Whether Ursprung generates the Wrangler config or the author writes it.** The vision
  says the author's config declares the custom build command that invokes Ursprung — so
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
  followed. Ursprung must emit fully type-stripped, import-resolved JavaScript, and the
  one-file-per-bundle rule is what makes this safe — there is no default module rule for
  `.js`, so sibling files would be silently dropped.
- Asset settings straddle both config files, and **`runWorkerFirst` is required** or
  browser navigations are answered by `not_found_handling` and never reach the Worker,
  which would silently break streaming SSR.
- The build command runs before entrypoint resolution, with cwd = `process.cwd()`, which
  is where both config files must live. Whether that holds under Workers Builds is
  ticket 23, which now blocks this one.
- **Caching headers and immutability** for client bundles, if we control them.
