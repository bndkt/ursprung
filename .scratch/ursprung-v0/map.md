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
   errors on non-erasable constructs.
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
15. `node:*` imports are external on the server (`nodejs_compat` serves them) and a hard
    build error on the client. No browser polyfills for Node builtins, ever.
16. Third-party modules are **uncoloured** — their side is inferred from reachability.
    First-party modules must declare. We control our source; we don't control npm's.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

_None yet — charted, not yet worked._

## Not yet specified

In scope, too fuzzy to ticket. Graduates as the frontier advances.

- **The client runtime.** Event delegation, and how a resumed page fetches the code for
  an interaction that hasn't loaded yet. Shape depends entirely on the resumability wire
  format.
- **Runtime routing and dispatch.** Matching, params, 404s, redirects, trailing slashes.
  Falls out of the route authoring API once that's settled.
- **Client-side navigation.** Whether v0 has it at all, or whether every link is a full
  document load. Cheaper to answer once streaming and resumability are pinned.
- **Error handling.** Error boundaries, and what a thrown error looks like once the
  response has already started streaming.
- **Document head and metadata.** Title, meta tags, and which layer owns them.
- **Forms and mutations.** Whether they route through RPC or through API routes.
- **Build diagnostics.** Error message format, source positions, and how a build error
  survives having no scope model to point at.
- **Package layout.** The exact subpath export surface of the published `ursprung`
  package, once the runtimes are known.
- **Static assets.** The demo app needs *something* for files that aren't TypeScript,
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
