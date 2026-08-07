# Ursprung v0

Wayfinder map. Label: `wayfinder:map`.

## Destination

A **locked v0 architecture spec** for Ursprung on the web — Cloudflare Workers only —
plus the decision record behind it, sharp enough that implementation tickets can be cut
from it without further design. The spec accumulates at
[`spec.md`](./spec.md); vocabulary lands in the root [`CONTEXT.md`](../../CONTEXT.md)
and the hard-to-reverse calls in [`docs/adr/`](../../docs/adr/).

v0 is proven by **one canonical demo app** that exercises every architectural claim at
once and deploys to Cloudflare through Wrangler with bundling disabled: a nested route
tree, one API route with two methods, a server component, a client component, a client
component importing a function from a `.server.ts` (proving the RPC transform), one
signal-driven interaction, streaming SSR, and resumption on the client with no
re-render. If that app is fully specified and every decision behind it is locked, this
map is done.

This map **plans**; it does not build. No ticket here writes framework code.

## Notes

**Domain.** A from-scratch full-stack TypeScript framework: its own bundler, its own
JSX runtime, its own type stripping, fine-grained reactivity on TC39 Signals, no virtual
DOM, resumability instead of hydration, capnweb for RPC. Read the vision in the charting
session; read `CONTEXT.md` for vocabulary before naming anything.

**Skills every session should consult.** `/grilling` and `/domain-modeling` by default.
`/research` for the `research` tickets. `/prototype` for the `prototype` ticket.
`/writing-for-agents` when writing anything an agent will later consume.

**Locked constraints.** Settled during charting; every ticket answer must respect these,
and reopening one is a scope change, not a ticket.

1. This map produces decisions and a spec, not framework code.
2. Web + Workers only. But v0's renderer must stay **host-agnostic** — the renderer
   talks to a host interface, DOM is one implementation — so a native host can be added
   later without a rewrite.
3. Done means the canonical demo app above is fully specified.
4. The build-in-a-Worker **constraint** binds v0: every build module takes an injected
   virtual filesystem and touches no Node API. The build-in-a-Worker **product** does not.
5. One package, `ursprung`, with subpath exports (`ursprung/jsx-runtime`,
   `ursprung/client`, `ursprung/server`, `ursprung/build`). `apps/web` becomes the
   canonical demo app.
6. Ursprung's own dependencies are exactly three: the TC39 Signals polyfill, capnweb,
   and Wrangler (dev-only). Real npm dependencies, not vendored. **Every additional
   dependency needs the maintainer's explicit approval.**
7. Applications **may** depend on npm packages — ESM only (see 14).
8. The parser builds a real AST for expressions, statements, imports and JSX, and treats
   type syntax as **opaque delete-spans**. No type model, no scope/binding model. Loud
   errors on non-erasable constructs — and **the reject list is Ursprung's own, strictly
   larger than `erasableSyntaxOnly`'s**. That flag permits legacy decorators, standard
   decorators and `accessor`, all three of which are `SyntaxError`s on workerd, so
   "whatever TypeScript accepts" is not a safe rule.
9. Every first-party module declares its side: `.server.`, `.client.` or `.shared.`.
   An unsuffixed `.ts`/`.tsx` reached by the graph is a build error.
10. One self-contained ESM file per bundle. No chunks, no shared extraction, no runtime
    loader. Duplication across route bundles is accepted. Circular imports are an error.
11. No dev server, no HMR, no watch mode. One entry point: `ursprung build`, a pure
    function from a virtual filesystem to output files.
12. Streaming SSR in v0, **in-order only**. An async component blocks the stream at its
    position. No out-of-order flushing, no placeholder-then-patch.
13. The caller populates the VFS with package files; Ursprung only reads it. Ursprung is
    never a package manager and never fetches from a registry.
14. npm dependencies are **ESM only** in v0. A CJS-only package is a hard build error.
15. **No polyfills, ever, on any target.** On the server the only permitted externals are
    `cloudflare:*` and those `node:*` specifiers **workerd natively implements**; a
    `node:*` import workerd does not implement natively is a hard build error, because
    Wrangler's unenv polyfills are injected by the esbuild pass that disabling bundling
    switches off. The `node:` prefix is **required** — unprefixed builtins, which
    `nodejs_compat_v2` legalises, are a build error. On the client every `node:*` import
    is a hard build error. The permitted native set is a function of the compatibility
    date and must be pinned alongside it.
16. Third-party modules are **uncoloured** — their side is inferred from reachability.
    First-party modules must declare. We control our source; we don't control npm's.

## Pending amendments

Where a resolved ticket shows a locked constraint to be wrong, it is proposed here rather
than edited in — the constraints are the maintainer's. Approved amendments are folded
into the list above and struck from this section.

_None pending._ Constraints 8 and 15 were both amended on 2026-08-07, from findings in
[the erasable TypeScript subset](./issues/06-erasable-typescript-subset.md),
[capnweb](./issues/01-capnweb-transport-and-capability-model.md) and
[ESM resolution](./issues/04-esm-resolution-and-export-conditions.md). Constraint 15
became stricter rather than looser: no polyfills at all, workerd natives only. Recorded
as [ADR-0004](../../docs/adr/0004-no-polyfills-workerd-natives-only.md).

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [capnweb: transport, capability model, and what it demands of a bundler](./issues/01-capnweb-transport-and-capability-model.md)
  — 0.10.0, MIT, zero deps, ESM; **capabilities are reachable by construction with no
  allowlist**, so ticket 20's generated root object _is_ the security perimeter; runtime
  validation is unreachable given constraints 6 and 8; highly experimental, pin exactly.
- [TC39 Signals and signal-polyfill](./issues/02-tc39-signals-and-polyfill.md) — graph
  construction order is free (what Resumability needs) but a computed first evaluated
  reading nothing freezes forever, silently; use an indirection cell. Proposal is stale
  at Stage 1; polyfill says not for production and **has no `exports` field**.
- [Resumability prior art](./issues/03-resumability-prior-art.md) — Qwik's format read
  from source plus a captured production payload; **payload measured at 15.5% of HTML
  bytes**; state is a whole-document post-pass in both v1 and v2, which is strong
  evidence _for_ constraint 12; v1's HTML-comment encoding shipped an XSS CVE.
- [ESM resolution and export conditions](./issues/04-esm-resolution-and-export-conditions.md)
  — algorithm transcribed implementably with a keep/skip table; **conditions are a set,
  not an ordered list** — the package author's key order decides precedence; `main`
  fallback and `#` imports are not skippable; the npm registry **reorders manifest keys**,
  so never read condition order from it.
- [Wrangler's experimental TypeScript config](./issues/05-wrangler-experimental-config-and-build-contract.md)
  — **`noBundle` exists** (on `wrangler.config.ts`, with `build.command` and
  `assetsDirectory`), so the vision's deployment flow is expressible; the entrypoint is
  uploaded byte-for-byte and imports are not followed; `runWorkerFirst` is required or
  navigations never reach the Worker.
- [The canonical demo app, written as if Ursprung v0 already existed](./issues/07-canonical-demo-app-prototype.md)
  — the route file is a **nested object literal** carrying **lazy** `() => import(...)`
  references, with **API methods declared in the route file** against arbitrarily-named
  exports. Builder-call variants are ruled out: the bundler reads the route tree as data
  and cannot evaluate it. Lazy references stop a Route bundle dragging in every route's
  code, and the route file naming its callable exports **is the allowlist capnweb does
  not have**. Nineteen ambiguities catalogued in
  [`NOTES.md`](./prototypes/07-demo-app/NOTES.md); tickets 25 and 26 graduated from them.
- [The erasable TypeScript subset](./issues/06-erasable-typescript-subset.md) — reject
  list is complete by construction (TS1294, six call sites) but **`erasableSyntaxOnly` is
  not sufficient**; delete list is 19 statement forms and 38 fragment positions;
  whitespace-blanking is exact, so no source maps needed; no import elision without a
  type model.

## Not yet specified

In scope, too fuzzy to ticket. Graduates as the frontier advances.

- **The client runtime.** Event delegation, and how a resumed page fetches the code for
  an interaction that hasn't loaded yet. Shape depends entirely on the resumability wire
  format.
- **Runtime routing and dispatch.** Matching, params, 404s, redirects, trailing slashes.
  Falls out of the route authoring API once that's settled.
- **Client-side navigation.** Whether v0 has it at all, or whether every link is a full
  document load. Cheaper to answer once streaming and resumability are pinned. Now also
  carries a trap found by [ticket 02](./issues/02-tc39-signals-and-polyfill.md): two
  Route bundles live in one document means two copies of the signal polyfill, hence two
  disjoint reactive graphs, and the cross-copy failure is **silent** — a computed reading
  a state from the other copy returns one correct value and then freezes forever. Either
  only one Route bundle is ever live per document, or the polyfill needs an explicit
  exemption from constraint 10's accepted duplication.
- **Error boundaries.** The component-level construct: what one is, where it sits in the
  tree, and what it renders. The _response_ half of this — status codes and mid-stream
  throws — graduated to [ticket 26](./issues/26-errors-after-stream-start.md) once
  [ticket 07](./issues/07-canonical-demo-app-prototype.md) made it concrete.
- **Document head and metadata.** Title, meta tags, and which layer owns them.
- **Forms and mutations.** Whether they route through RPC or through API routes.
- **Build diagnostics.** Error message format, source positions, and how a build error
  survives having no scope model to point at.
- **Package layout.** The exact subpath export surface of the published `ursprung`
  package, once the runtimes are known.
- **Static assets.** The demo app needs _something_ for files that aren't TypeScript,
  even with no stylesheet pipeline.

## Out of scope

Ruled beyond this destination. Never graduates; returns only as a fresh effort.

- **Native iOS entirely** — Hermes, SwiftUI, the JS↔native bridge, generated Xcode
  projects, Xcode Cloud, OTA bytecode updates. Constraint 2 keeps the door open; the
  platform work is a separate effort.
- **CJS support for npm dependencies.** ESM-only in v0.
- **Dev server, HMR, watch mode.**
- **Chunk splitting and shared-chunk extraction.**
- **Minification, identifier renaming, and source maps** — all need the scope model
  constraint 8 rules out.
- **Stylesheets and a general asset pipeline.** Explicitly out per the vision.
- **The build-in-a-Worker product** — an agent driving a dynamic Worker, writing to R2,
  serving from a dispatch namespace. The constraint is in scope; the product is not.
- **Node builtin polyfills for the browser.**
- **Ursprung as a package manager** — no registry client, no tarball extraction, no
  lockfile interpretation.
