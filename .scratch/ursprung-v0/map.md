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
10. ursprung emits **real ESM modules and lets the host's own module system link them**. It
    ships **no loader** on either side: workerd's module registry links the server, the
    browser's module map links the client, and both guarantee **one instance per resolved
    specifier**. The key is the *specifier*, not the file — `./signals.js?v=2` is a second
    instance of the same module — so the emitter content-hashes **filenames** and never uses
    a query string. The server output is a **root entrypoint** (the Worker entrypoint
    Wrangler is configured with, carrying the router) plus **one module per Route**, imported
    lazily once the router has matched. The client output is **one entry module per Route**,
    loaded from the assets directory. On both sides, a module reachable from more than one
    entrypoint is **emitted once and shared**, not duplicated. Lazy `import()` defers
    **evaluation only**: workerd V8-compiles every uploaded module at startup regardless, so
    splitting by Route does **not** keep startup flat. Circular imports are an error.
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

**Landed 2026-08-07 — constraint 10 replaced: ursprung emits a module graph, not bundles.**
Approved by the maintainer and folded in above, with ticket 27's two corrections written
into the constraint rather than left as riders. Kept here only for the reasoning, which the
constraint itself does not carry.

**Why, and the obvious reasons are not the load-bearing ones.** Ticket 02's silent
two-copies-of-the-polyfill failure did **not** force this — the bundler could have inlined
each Route's ancestor chain and kept one copy live per request. It is dissolved as a side
effect. On the server, **upload size** forces it: N Route entrypoints each carrying a full
copy of renderer, signals and capnweb, against a total script-size limit. On the client,
**cross-route caching** forces it: with self-contained bundles a second Route re-downloads
the whole runtime. But the largest consequence is neither — **it dissolves the tension
ticket 14 existed to resolve.** Flat concatenation needs every import rewritten to a local
binding, with no binding model to dodge identifier collisions with: constraint 8 against
constraint 10. Real ESM modules get module scope for free, so ticket 14 shrinks from
"resolve a two-constraint contradiction" to module naming, content hashing, ordering and
asset layout.

**The cost.** A self-contained bundle is one request; a module graph is a request waterfall
— fetch the Route entry, parse it, discover its imports, fetch those. ursprung controls the
HTML because it does Server rendering, so it can emit `<link rel="modulepreload">` for
exactly the modules a Route needs. **Ticket 21 must design that mitigation, not assume it.**

**Two things this leaves open.** "Chunk splitting and shared-chunk extraction" was in Out of
scope purely as a consequence of the old constraint 10, and is removed from that list — net
work is lower, because deciding what to extract is a graph analysis, far cheaper than the
scope model this avoids. And the **ubiquitous language was repaired the same day**:
`CONTEXT.md` retires **Server bundle** and **Route bundle** — each named a single file, and
neither is one — in favour of **Root entrypoint**, **Route entrypoint**, **Common module**
and **Emitted module**. There is deliberately no collective noun for one side's output; say
"the server output" in prose. Note the collision the naming had to dodge: **Shared module**
was already taken and means a Side, not a position in the graph, so a module emitted once
for several entrypoints is a **Common module**.

**Proposed 2026-08-08 — constraint 10 loses its last sentence: circular imports are not an
error.** Raised by ticket 12. Proposed change: strike "Circular imports are an error."

The clause could not survive its own justification. Flat concatenation **cannot express a
cycle** — that is why it was there — and ursprung no longer concatenates. Both hosts own
cycle semantics natively under TDZ rules, so a first-party cycle that works in workerd or
the browser works here. The sentence survived the constraint 10 replacement by being
carried along rather than re-argued, which is the same shape as the source-maps finding
below: a rule that outlived its reason.

It also removes a failure mode with no remedy. Internal cycles are not rare in real
packages, and a ban surfaces at integration time, in code the author cannot edit, with
"drop the dependency" as the only fix.

**The accepted cost is a diagnostic**, not correctness: an accidental first-party cycle is
easy for an agent to introduce and its TDZ failure is famously hard to read. Cycle
detection does not disappear — the traversal still needs a visited set — so reporting one
is cheap to add later.

**What it dissolves.** With cycles legal there is no topological order at all, and real ESM
needs none because the host owns evaluation order. That removes ticket 14's "topological
order is underspecified" sub-question rather than answering it; emission ordering reduces
to being deterministic, so sorting by path is the whole rule.

**Proposed 2026-08-08 — constraint 15's "natively implements" is too narrow by one word, and
the rule has an unstated precondition.** Raised by ticket 13. Two changes, both small:

- **The permitted server set includes the non-functional stubs.** Constraint 15 permits the
  `node:*` specifiers workerd "natively implements". A stub — `node:child_process`,
  `node:tty`, a dozen others — is shipped by the runtime and resolves, but does nothing.
  Under the literal wording it is excluded; the ticket includes it, because packages
  routinely import such modules at module scope for feature detection and never call them,
  so rejecting one breaks working code to prevent a throw that may never happen. Proposed
  wording: "the `node:*` specifiers workerd **resolves** at the application's compatibility
  date, stubs included".
- **`nodejs_compat` is a documented precondition ursprung cannot check.** The externals rule
  is only true if the application enabled the flag, and compatibility _flags_ are not in
  ticket 08's Config — only the date is. Adding them was considered and rejected as more
  surface than the check is worth. The accepted cost: an application that omits the flag
  gets a Worker that fails at **startup**, not a build that fails at build time. Ticket 21
  is handed the rider that the Wrangler-facing output contract is the one place it could
  actually be verified.

Worth noting alongside: research §7.5 found `$compatEnableDate("2026-08-04")` on
`nodeJsCompat` in workerd's `main` — landed, unshipped, and contradicting Cloudflare's own
docs. If it ships, the precondition becomes true by default for modern dates and the second
bullet's cost mostly evaporates. Do not build on it.

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

**Proposed 2026-08-07 — constraint 6 gains a fourth dependency, and its opening clause is
stale.** Raised by ticket 11, and already exercised rather than merely proposed: the
maintainer approved `typescript` as a **test-only dev dependency** in that session, which is
constraint 6's own stated mechanism ("every additional dependency needs the maintainer's
explicit approval") working as designed. It buys the one oracle the other three cover worst —
a differential against `tsc` on the **erasure decision set**, which byte ranges actually are
type syntax, plus corpus cases generated from the `SyntaxKind` table research §3's 19 + 38
entries were enumerated against.

Nothing about the constraint's intent changes; only its arithmetic. Proposed wording for the
first sentence:

> ursprung's runtime dependencies are exactly two — the TC39 Signals polyfill and capnweb.
> Its dev dependencies are Wrangler and `typescript`, the latter test-only and never
> imported from `packages/ursprung/src`, so the published package carries neither.

The distinction is worth spelling out because it is what keeps the approval cheap: a
test-only dev dependency cannot reach a consumer, so the "three dependencies" promise that
matters — what someone installing `ursprung` gets — is unchanged.

**Proposed 2026-08-07 — source maps should be reconsidered, because the reason they were
ruled out was never true.** Raised by ticket 11. Out of scope lists them beside minification
and identifier renaming, all three "needing the scope model constraint 8 rules out".
Minification and renaming do. **Source maps never did** — they need position tracking
through the emitter, which is a mapping recorded per printed node.

Two things changed at once, and the combination is what makes this worth your attention:

- **Printing broke output positions.** Ticket 06 established that whitespace-preserving
  blanking is exact and concluded source maps were therefore unnecessary. Ticket 11 chose a
  printer instead, and verbatim spans do not rescue this: a verbatim subtree keeps its bytes,
  not its offset, so one printed statement earlier in the file shifts everything after it.
- **So a production stack trace from workerd can no longer be mapped back to a module.**
  Build diagnostics are fine and always were — they are computed against the original module
  text. This is purely about runtime errors in deployed code.

Deliberately **not** ruled either way here, because scope is the maintainer's. Three readings
are all defensible: accept unmappable production traces in v0; emit source maps for the
server output only, where the trace actually arrives; or reverse ticket 11's printer decision
in favour of the edit list, which is the option that gets more expensive the longer it waits.

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
- [Can workerd import a module lazily, during a request?](./issues/27-workerd-dynamic-import-at-request-time.md)
  — **yes, no compatibility flag**, established from workerd's source at `22b2a002` plus its
  test suite; the in-request branch is the *first* one workerd checks. The registry gives
  **one instance per resolved specifier**, so server-side shared-module extraction is safe —
  but the key is the **specifier**, not the file, so `?v=2` mints a second instance and the
  emitter must content-hash filenames only. Evaluation charges to a **third peer budget**,
  neither startup nor request CPU, whose size is not establishable (workerd's OSS enforcer
  is a stub); under the experimental `new_module_registry` it charges to request CPU
  instead, so **v0 designs for the legacy registry**. Unanticipated: lazy import defers
  **evaluation only — every uploaded module is V8-compiled at startup regardless**, so
  splitting by Route does not keep startup flat. Three obligations handed to tickets 14
  and 21.
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
- [The parser: accepted subset, AST shape, and error reporting](./issues/11-parser-subset-ast-and-errors.md)
  — a **full ECMAScript parser** (the partial-parser provocation dies on four independent
  ambiguities), and output is **printed from the AST with verbatim spans for pure-JavaScript
  subtrees** rather than blanked in place. That printer **dissolves four of research §5's six
  hazards** and leaves ursprung strictly more correct than `ts-blank-space` and `amaro`, so
  the reject list **shrinks to ten** rather than growing. Grammar is a pinned edition with no
  target-support policy; the parser is a **conservative acceptor**, not a JavaScript
  validator. JSX parses to nodes with the **full HTML entity table**; the call shape stays
  ticket 15's. `Diagnostic` shape fixed, with a **required `remedy`** field. Four oracles —
  `typescript` approved as a test-only dev dependency. **Cost: printing breaks output
  positions**, so ticket 06's "source maps come free" is half void. Recorded as
  [ADR-0007](../../docs/adr/0007-the-emitter-prints-from-the-ast.md).
- [The module graph data model and two-colour derivation](./issues/12-module-graph-and-two-colour-derivation.md)
  — **Side and Reach are two fields, not one**: Side is declared and the 3×3 matrix
  constrains it; Reach is derived and the invariant is about it. One node per **realpathed**
  path, emission unit is a derived `(node, side)` pair. Matrix: `shared → server` is a
  **hard error checkable from one file**, `shared → client` legal, `client → server` the
  boundary, `server → client` legal. An **edge carries a specifier, not a target** — the two
  sides resolve under different conditions, so traversal runs once per side. An
  **all-`type` clause is elided**, dissolving ticket 11's §5.7 hazard without a type model,
  at the cost of `verbatimModuleSyntax` side-effect parity. Server roots are one Root
  entrypoint plus **self-sufficient** Route entrypoints carrying their ancestor Layout
  chain; **client roots are the crossing set**, because a per-Route client entrypoint would
  evaluate eagerly and undo Resumption. Invariant enforced twice, both throwing.
  **Circular imports become legal** — proposed amendment above. First-party means **no
  `node_modules` in the real path**, so workspace members declare. Recorded as
  [ADR-0008](../../docs/adr/0008-the-module-graph-and-the-side-matrix.md).
- [Module resolution rules for v0](./issues/13-module-resolution-rules.md) — Node's
  `ESM_RESOLVE` minus research's skip list, plus three ursprung rules applied at one place.
  **A first-party specifier carries the source extension** (`"./format.shared.ts"`), so the
  specifier _is_ a virtual filesystem path and the resolver maps nothing —
  [ADR-0009](../../docs/adr/0009-first-party-specifiers-carry-the-source-extension.md), and
  it fixes ticket 24's tsconfig question rather than narrowing it. Extensions classify by
  suffix and **never by location**, which is forced: the published `ursprung` ships `.ts`.
  Condition sets adopted verbatim from research and **fixed, not app-configurable**; their
  order is documentation only. `main` kept, the `module` **field** and the legacy `browser`
  map refused, Node-exact — `path-to-regexp`-shaped packages are rejected with eyes open.
  CJS is a **per-module** verdict and an ambiguous `.js` is an error, because syntax
  detection would need a source read _inside_ the resolve phase and cost ticket 10's batched
  diagnostics. **JSON imports resolve**, emitted as `export default JSON.parse(<original
  bytes>)` — not a raw splice (`__proto__`) and not a re-serialisation (integer-key
  reordering) — which adds a second node kind to ticket 12. The `node:*` set is a
  **generated date-keyed table** selected by ticket 08's `compatibilityDate`, stubs
  included; **`nodejs_compat` is assumed and unverifiable from the build**, an accepted cost
  handed to ticket 21. Two caches with different lifetimes: resolution results are keyed on
  Side and die between passes, manifest reads do not.
- [The erasable TypeScript subset](./issues/06-erasable-typescript-subset.md) — reject
  list is complete by construction (TS1294, six call sites) but **`erasableSyntaxOnly` is
  not sufficient**; delete list is 19 statement forms and 38 fragment positions;
  whitespace-blanking is exact, so no source maps needed; no import elision without a
  type model.

## Not yet specified

In scope, too fuzzy to ticket. Graduates as the frontier advances.

- **The client runtime.** Event delegation, and how a resumed page fetches the code for
  an interaction that hasn't loaded yet. Shape depends entirely on the resumability wire
  format. [Ticket 12](./issues/12-module-graph-and-two-colour-derivation.md) added a
  second question to this patch and deliberately declined to answer it: **how the browser
  is told which client modules to load at all**. There is no per-Route client entrypoint —
  client roots are the modules at a `→ client` crossing, each its own root — because a
  generated one would evaluate every Client component eagerly, which is the thing
  Resumption exists to avoid. The graph records per Route which client roots it reaches;
  who consumes that set, and whether the HTML names modules per request or per Route, is
  ticket 19's and ticket 21's.
- **Runtime routing and dispatch.** Narrowed by
  [ticket 08](./issues/08-route-and-config-authoring-api.md): matching, params and
  specificity are decided, and the route table is a generated module rather than the route
  file. What remains is 404s, redirects and trailing slashes — and the first two are
  entangled with [ticket 26](./issues/26-errors-after-stream-start.md).
- **Client-side navigation.** Whether v0 has it at all, or whether every link is a full
  document load. Cheaper to answer once streaming and resumability are pinned. The trap
  found by [ticket 02](./issues/02-tc39-signals-and-polyfill.md) — two Route bundles live
  in one document meaning two copies of the signal polyfill, two disjoint reactive graphs
  and a **silent** cross-copy freeze — is **dissolved**, since the constraint 10 amendment
  landed and the browser's module map gives one polyfill instance per resolved URL however
  many client roots are live.
- **Error boundaries.** The component-level construct: what one is, where it sits in the
  tree, and what it renders. The _response_ half of this — status codes and mid-stream
  throws — graduated to [ticket 26](./issues/26-errors-after-stream-start.md) once
  [ticket 07](./issues/07-canonical-demo-app-prototype.md) made it concrete.
- **Document head and metadata.** Title, meta tags, and which layer owns them.
- **Forms and mutations.** Narrowed by
  [ticket 08](./issues/08-route-and-config-authoring-api.md), which lets one route carry
  both page fields and an `api` map: the choice is now RPC versus the page's own
  `api.POST` at its own URL, rather than RPC versus a separate API route somewhere else.
- **Package layout.** The exact subpath export surface of the published `ursprung`
  package, once the runtimes are known.
- **Static assets.** The demo app needs _something_ for files that aren't TypeScript,
  even with no stylesheet pipeline. [Ticket 10](./issues/10-build-entry-point-and-vfs.md)
  removed the interface obstacle — reads and outputs are both `Uint8Array`, so a
  non-TypeScript file is already representable end to end. Narrowed again by
  [ticket 13](./issues/13-module-resolution-rules.md): a non-TypeScript file **reached by an
  import** is now handled for exactly one type, JSON, and handled by turning it into a
  module rather than by shipping it as an asset. What remains is the other half — files
  nothing imports, which are collected rather than resolved: which ones, how they are named,
  and who serves them.

## Out of scope

Ruled beyond this destination. Never graduates; returns only as a fresh effort.

- **Native iOS entirely** — Hermes, SwiftUI, the JS↔native bridge, generated Xcode
  projects, Xcode Cloud, OTA bytecode updates. Constraint 2 keeps the door open; the
  platform work is a separate effort.
- **CJS support for npm dependencies.** ESM-only in v0.
- **Dev server, HMR, watch mode.**
- **Minification and identifier renaming** — both need the scope model constraint 8 rules
  out. **Source maps were on this line for the same reason, and that reason was wrong** —
  they need position tracking through the emitter, not a scope model, and
  [ticket 11](./issues/11-parser-subset-ast-and-errors.md) made them the only way to map a
  production stack trace. Still out of scope; see Pending amendments for the proposal to
  revisit.
- **Stylesheets and a general asset pipeline.** Explicitly out per the vision.
- **The build-in-a-Worker product** — an agent driving a dynamic Worker, writing to R2,
  serving from a dispatch namespace. The constraint is in scope; the product is not.
- **Node builtin polyfills for the browser.**
- **ursprung as a package manager** — no registry client, no tarball extraction, no
  lockfile interpretation.
