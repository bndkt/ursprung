# ursprung v0

Wayfinder map. Label: `wayfinder:map`.

## Destination

A **locked v0 architecture spec** for ursprung on the web — Cloudflare Workers only —
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
6. ursprung's own dependencies are exactly three: the TC39 Signals polyfill, capnweb,
   and Wrangler (dev-only). Real npm dependencies, not vendored. **Every additional
   dependency needs the maintainer's explicit approval.**
7. Applications **may** depend on npm packages — ESM only (see 14).
8. The parser builds a real AST for expressions, statements, imports and JSX, and treats
   type syntax as **opaque delete-spans**. No type model, no scope/binding model. Loud
   errors on non-erasable constructs — and **the reject list is ursprung's own, strictly
   larger than `erasableSyntaxOnly`'s**. That flag permits legacy decorators, standard
   decorators and `accessor`, all three of which are `SyntaxError`s on workerd, so
   "whatever TypeScript accepts" is not a safe rule.
9. Every first-party module declares its side: `.server.`, `.client.` or `.shared.`.
   An unsuffixed `.ts`/`.tsx` reached by the graph is a build error.
10. ⚠️ **Amendment pending — do not design against this without reading Pending
    amendments below.** As written: one self-contained ESM file per bundle. No chunks, no
    shared extraction, no runtime loader. Duplication across route bundles is accepted.
    Circular imports are an error. The maintainer has proposed replacing all of it except
    the no-loader rule; tickets 12, 14 and 21 are affected and carry their own banners.
11. No dev server, no HMR, no watch mode. One entry point: `ursprung build`, a pure
    function from a virtual filesystem to output files.
12. Streaming SSR in v0, **in-order only**. An async component blocks the stream at its
    position. No out-of-order flushing, no placeholder-then-patch.
13. The caller populates the VFS with package files; ursprung only reads it. ursprung is
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

**Proposed 2026-08-07 — ursprung emits a module graph, not bundles.** Raised by the
maintainer after ticket 07, in three steps that are clearer as one. Proposed replacement
for constraint 10:

> ursprung emits **real ESM modules and lets the host's own module system link them**. It
> ships no loader on either side: workerd's module registry links the server, the
> browser's module map links the client, and both guarantee **one instance per resolved
> specifier**.
>
> The server output is a **root entrypoint** — the Worker entrypoint Wrangler is
> configured with, carrying the router — plus **one module per Route**, imported lazily
> once the router has matched. The client output is **one entry module per Route**, loaded
> from the assets directory. On both sides, a module reachable from more than one
> entrypoint is **emitted once and shared**, not duplicated.
>
> Circular imports are an error.

This drops "one self-contained ESM file per bundle", "no chunks", "no shared extraction"
and "duplication across route bundles is accepted" — most of the old constraint 10. It
keeps the part that was always the real invariant: **ursprung ships no loader.**

**Why, recorded carefully, because the obvious reasons are not the load-bearing ones.**

- Ticket 02's silent two-copies-of-the-polyfill failure does **not** force this. The
  bundler could inline each Route's ancestor chain into its own entrypoint and keep one
  copy live per request. It is dissolved as a side effect, not a cause — see the fog note
  on client-side navigation, whose central trap this removes outright.
- On the server, **upload size** forces it: N Route entrypoints each carrying a full copy
  of renderer, signals and capnweb, against a total script-size limit.
- On the client, **cross-route caching** forces it: with self-contained bundles, a second
  Route re-downloads the whole runtime.
- The largest consequence is neither. **It dissolves the tension ticket 14 exists to
  resolve.** Flat concatenation needs every import rewritten to a local binding, with no
  binding model to dodge identifier collisions with — constraint 8 against constraint 10.
  Real ESM modules get module scope for free, so no renaming and no scope model are
  needed anywhere. Ticket 14 shrinks from "resolve a two-constraint contradiction" to
  module naming, content hashing, ordering and asset layout.

**The cost, stated honestly.** A self-contained bundle is one request; a module graph is a
request waterfall — fetch the Route entry, parse it, discover its imports, fetch those.
ursprung controls the HTML because it does Server rendering, so it can emit
`<link rel="modulepreload">` for exactly the modules a Route needs and start those fetches
in parallel with the document. That mitigation should be designed in ticket 21, not
assumed. Also new: content-hashed filenames, so shared modules cache immutably.

**This un-scopes something.** "Chunk splitting and shared-chunk extraction" was in Out of
scope purely as a consequence of constraint 10, and has been removed from that list. Net
work is lower, not higher — deciding what to extract is a graph analysis over the module
graph, which is far cheaper than the scope model this avoids.

**Vocabulary changes if this lands.** `CONTEXT.md` defines **Server bundle** as "the
single output containing all code that runs on the server" and **Route bundle** as "the
output for one route" — both become wrong, and there is no term yet for a shared emitted
module. That is a `/domain-modeling` pass once ticket 27 reports.

Blocked on [ticket 27](./issues/27-workerd-dynamic-import-at-request-time.md): whether
workerd permits `import()` inside a `fetch` handler, and whether its registry guarantees
one instance per specifier. The browser half needs no research — the HTML module map has
guaranteed both for years — so a negative from 27 would leave the **client** half of this
amendment standing on its own, with only the server reverting to a single bundle. **Not
folded in until that research lands.**

**Proposed 2026-08-07 — a new constraint 17: the build host evaluates the config; the
build itself evaluates nothing.** Raised by ticket 08. Proposed wording:

> The Config file is evaluated by the **build host** before the build begins. The build
> function receives `{ vfs, config }`, where `config` is already plain data; it performs
> no evaluation and touches no Node API. References inside the evaluated config are
> normalised to virtual-filesystem paths by the host, at that boundary.

**Why it is an addition and not an amendment to constraint 4.** Constraint 4 binds *build
modules*, and evaluation sits outside the build entirely — so the build stays pure and
build-in-a-Worker stays reachable, with such a host supplying the evaluated data by
whatever means it has. Nothing in constraint 4 changes. This is stated as a constraint
anyway because it is load-bearing for tickets 10, 12 and 21 and easy to violate by
accident: the natural instinct is to have the build read its own config.

**What it cost.** Module references had to stop being thunks — an evaluator cannot see
inside `() => import(...)` and must never call it — so they are
`new URL(specifier, import.meta.url)`, which carries no type link to the module it names.
That is the sole reason an API route's `export` is an unchecked string, and the reason
NOTES #6's params typing is unverifiable rather than merely awkward.

**What it un-decided.** Ticket 07 rejected builder-call route declarations *because* the
bundler could not evaluate. That reasoning is void — builder calls are evaluable. The
nested literal survives on its independent grounds (readability, and pathless layouts
falling out for free), and ticket 07's file has been annotated so the dead argument is not
reused.

Recorded as [ADR-0005](../../docs/adr/0005-the-host-evaluates-the-config-before-the-build.md),
which stands whether or not this is folded into the constraint list.

Previously: constraints 8 and 15 were both amended on 2026-08-07, from findings in
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
- [The canonical demo app, written as if ursprung v0 already existed](./issues/07-canonical-demo-app-prototype.md)
  — the route file is a **nested object literal** carrying **lazy** `() => import(...)`
  references, with **API methods declared in the route file** against arbitrarily-named
  exports. Builder-call variants are ruled out: the bundler reads the route tree as data
  and cannot evaluate it. Lazy references stop a Route bundle dragging in every route's
  code, and the route file naming its callable exports **is the allowlist capnweb does
  not have**. Nineteen ambiguities catalogued in
  [`NOTES.md`](./prototypes/07-demo-app/NOTES.md); tickets 25 and 26 graduated from them.
- [The route and configuration authoring API](./issues/08-route-and-config-authoring-api.md)
  — **the Config file is evaluated by the build host before the build begins**, not read
  from the AST. Ticket 07's circularity argument was wrong (config graph ≠ app graph), and
  the maintainer rejected AST-reading on a stronger ground: an unevaluated `.ts` config is
  a trap. The build takes `{ vfs, config }` already-evaluated and stays pure, so
  constraint 4 is untouched. Consequences: the route tree need not be a literal, so
  dynamic config and composed subtrees work; lazy thunks give way to
  `new URL(spec, import.meta.url)`, killing the `.then((m) => m.export)` pattern-match;
  `layout` splits from `component`; the root omits `path`; static and `:param` only;
  static-beats-param specificity with duplicate paths a build error; handlers are
  `(request, context)`; no loaders. NOTES #6 closed as **unanswerable** — constraint 8
  plus the untyped reference form make a params-versus-path check impossible. Recorded as
  [ADR-0005](../../docs/adr/0005-the-host-evaluates-the-config-before-the-build.md).
- [The build entry point and the virtual filesystem interface](./issues/10-build-entry-point-and-vfs.md)
  — the virtual filesystem is a **synchronous snapshot** the host completes before `build`
  is called, exposing exactly two methods (`entries()`, `read()`); the build derives
  directory existence, `realpath`, decoding and normalisation from it, so **hosts implement
  no path semantics at all**. Departs from research §8.1 deliberately: the snapshot makes
  `realpath` a map lookup and makes the real-paths precondition cost duplicated bytes.
  Paths are root-relative with `""` as the root, which makes the resolution walks terminate
  **structurally**. Reads return **bytes**; the build decodes UTF-8. `build` returns a
  discriminated result carrying every diagnostic from the failing phase — batch diagnostics
  because agents are first-class users — and throws only on ursprung's own invariant
  violations. **Output is byte-identical independent of host**, bought by sorting the
  enumeration at handover; no cancellation signal and no budget in v0. Recorded as
  [ADR-0006](../../docs/adr/0006-the-virtual-filesystem-is-a-synchronous-snapshot.md).
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
- **Runtime routing and dispatch.** Narrowed by
  [ticket 08](./issues/08-route-and-config-authoring-api.md): matching, params and
  specificity are decided, and the route table is a generated module rather than the route
  file. What remains is 404s, redirects and trailing slashes — and the first two are
  entangled with [ticket 26](./issues/26-errors-after-stream-start.md).
- **Client-side navigation.** Whether v0 has it at all, or whether every link is a full
  document load. Cheaper to answer once streaming and resumability are pinned. The trap
  found by [ticket 02](./issues/02-tc39-signals-and-polyfill.md) — two Route bundles live
  in one document meaning two copies of the signal polyfill, two disjoint reactive graphs
  and a **silent** cross-copy freeze — is **dissolved by the pending constraint 10
  amendment**, since the browser's module map gives one polyfill instance per resolved
  URL however many Route entry modules are live. If that amendment lapses, this trap comes
  straight back.
- **Error boundaries.** The component-level construct: what one is, where it sits in the
  tree, and what it renders. The _response_ half of this — status codes and mid-stream
  throws — graduated to [ticket 26](./issues/26-errors-after-stream-start.md) once
  [ticket 07](./issues/07-canonical-demo-app-prototype.md) made it concrete.
- **Document head and metadata.** Title, meta tags, and which layer owns them.
- **Forms and mutations.** Narrowed by
  [ticket 08](./issues/08-route-and-config-authoring-api.md), which lets one route carry
  both page fields and an `api` map: the choice is now RPC versus the page's own
  `api.POST` at its own URL, rather than RPC versus a separate API route somewhere else.
- **Build diagnostics.** Narrowed by [ticket 10](./issues/10-build-entry-point-and-vfs.md):
  diagnostics are **returned as an array** on a discriminated result, collected across the
  phase that failed, and distinct from a `throw`, which now means ursprung itself is broken.
  What remains is the `Diagnostic` shape — message format, source positions, and how a build
  error survives having no scope model to point at.
- **Package layout.** The exact subpath export surface of the published `ursprung`
  package, once the runtimes are known.
- **Static assets.** The demo app needs _something_ for files that aren't TypeScript,
  even with no stylesheet pipeline. [Ticket 10](./issues/10-build-entry-point-and-vfs.md)
  removed the interface obstacle — reads and outputs are both `Uint8Array`, so a
  non-TypeScript file is already representable end to end. What remains is which files are
  collected, how they are named, and who serves them.

## Out of scope

Ruled beyond this destination. Never graduates; returns only as a fresh effort.

- **Native iOS entirely** — Hermes, SwiftUI, the JS↔native bridge, generated Xcode
  projects, Xcode Cloud, OTA bytecode updates. Constraint 2 keeps the door open; the
  platform work is a separate effort.
- **CJS support for npm dependencies.** ESM-only in v0.
- **Dev server, HMR, watch mode.**
- **Minification, identifier renaming, and source maps** — all need the scope model
  constraint 8 rules out.
- **Stylesheets and a general asset pipeline.** Explicitly out per the vision.
- **The build-in-a-Worker product** — an agent driving a dynamic Worker, writing to R2,
  serving from a dispatch namespace. The constraint is in scope; the product is not.
- **Node builtin polyfills for the browser.**
- **ursprung as a package manager** — no registry client, no tarball extraction, no
  lockfile interpretation.
