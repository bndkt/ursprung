# 12 — The module graph data model and two-colour derivation

Type: grilling
Status: resolved
Blocked by: 08
Map: [ursprung v0](../map.md)

## Question

> **Premise changed 2026-08-07, and the change has now landed.** Constraint 10 was
> replaced and approved: there is no single server output. The server is a **root
> entrypoint plus one module per Route**, and on both sides a module reachable from more
> than one entrypoint is emitted once and shared rather than duplicated. This ticket says
> "the server bundle", singular, throughout; read it as the server output as a whole.
>
> Three questions below change shape rather than disappearing. **"What is a node"** gets
> easier — a module is emitted once, so the one-node-many-colours framing is closer to
> right than several nodes. **"Entry points"** grows: there are now server roots plural,
> and the graph must record which entrypoints reach each module, because that set is
> exactly what decides whether a module is shared or inlined. **Dynamic `import()` as an
> edge kind** stops being an afterthought and becomes the primary edge for route
> references, per ticket 07.
>
> The colouring invariant, the 3×3 matrix and the enforcement question are all unaffected.
> One further input from ticket 11: `import { type A }` leaves a live `import {} from "x"`
> edge, while `import type { A }` removes the edge entirely. Colouring must distinguish
> the two, and ursprung has no type model with which to elide either.

> ⚠️ **Three claims in the block above are wrong, and were corrected during this ticket.
> Read the Answer before reusing any of them.**
>
> - **"Dynamic `import()` becomes the primary edge for route references."** Stale by one
>   ticket. Ticket 08 replaced lazy thunks with `new URL(spec, import.meta.url)` evaluated
>   by the host, so route references are **roots handed to the build as data**, not edges
>   in it. Application-authored `import()` is the construct's only remaining source.
> - **"That set is exactly what decides whether a module is shared or inlined."** Nothing
>   is inlined. Under the amended constraint 10 every module is emitted once as real ESM
>   and the host's registry links it, so being a Common module is **automatic**, not an
>   extraction decision. Per-entrypoint reach is still worth recording, but for preload
>   hints (ticket 21), not for emission.
> - **"ursprung has no type model with which to elide either."** It needs none for the
>   inline form. The `type` keyword is **syntax**, and the parser already sees it. Ticket
>   06's no-elision-without-a-type-model finding is about `import { Foo }` where `Foo`
>   merely happens to be a type; that case is untouched.

One unified graph, several outputs. The invariant that matters most in the whole
framework lives here: **server code never reaches a client bundle**, while client code
may legitimately appear in the server bundle for SSR. This ticket settles the data model
and the derivation.

Decide:

- **What is a node?** A module — but a module is a resolved file plus a target? The same
  `.shared.ts` may be emitted into both the server bundle and three client bundles.
  Is that one node with several colours, or several nodes? This choice propagates
  everywhere.
- **What is an edge?** A static import — but also a dynamic `import()`, a re-export, a
  type-only import (which must not create a real edge), and the server-boundary import
  that becomes RPC. Enumerate the edge kinds and what each means for traversal.
- **Colouring.** First-party modules declare (constraint 9), third-party infer
  (constraint 16). Write the actual algorithm: seeds, propagation direction, and what
  happens at a boundary edge. Is colour a set (`{server, client}`) rather than one value?
- **The boundary rule.** A `.client.tsx` importing a `.server.ts` is the RPC case and is
  legal. What about a `.server.tsx` importing a `.client.tsx` — legal, and how does the
  client module then reach the client bundle? What about `.shared.` importing either?
  Produce the complete 3×3 matrix of who may import whom, with the meaning of each cell.
  This matrix is the spec's most quotable artifact.
- **Enforcement.** How is the invariant _proven_ rather than hoped for? Is there a check
  that runs after emission — no module coloured server-only appears in any client
  bundle — and is it a test, an assertion in the build, or both? An invariant this
  important should not rest on the traversal being written correctly.
- **Entry points.** Each route is a client bundle entry (constraint 10). How does a route
  declaration from ticket 08 become a set of graph roots, and what is the server bundle's
  root?
- **Cycles.** Constraint 10 makes circular imports an error. Where is the cycle detected,
  what is reported, and does the rule apply across all colours equally?
- **What the graph carries for later stages.** Ticket 14 needs topological order; ticket
  20 needs the boundary edges and the exported names on the server side. Decide what the
  graph stores versus what is recomputed.

## Input from ticket 08 — decided, not open

**The Config file and the Route file are outside the graph.** Constraint 9 errors on an
unsuffixed module *"reached by the graph"*, and the graph is by definition the one built
**from** the Config file — so the Config file is its root, not a node in it, and the Route
file is build input evaluated by the host alongside it. Neither carries a side suffix.

The clause that closes the hole without a special case: **any module in the graph that
imports either of them is a constraint 9 error**, since that drags an unsuffixed file into
the real graph. Constraint 9 itself needs no amendment.

See [ticket 08](./08-route-and-config-authoring-api.md), decision 3.

## Answer

Recorded as [ADR-0008](../../../docs/adr/0008-the-module-graph-and-the-side-matrix.md),
which holds the hard-to-reverse half — the matrix and the node model.

The ticket's own framing had one thing folded together that needed pulling apart, and the
whole answer reads better once it is. **A module's `Side` and the outputs it reaches are
two different facts.** Side is *declared* (constraint 9) or *inferred* (constraint 16) and
says where a module may run. Reach is *derived* by traversal and says where it ended up.
The 3×3 matrix is a rule about the first. The invariant — server code never reaches the
client output — is a claim about the second. The ticket asked "is colour a set rather than
one value" and the answer is that it is neither: it is two fields.

### 1. The node

**One node per realpathed module path.** It carries a declared `side` — `server`,
`client`, `shared`, or `third-party` for a module that declares nothing — and, separately,
a derived `reach` set ⊆ `{server, client}`.

Parsing and resolution happen once per path. The emission unit is a derived
`(node, reachedSide)` pair rather than the node itself, which is what the premise change
was reaching for but could not quite say: *"a module is emitted once"* holds **within a
side**. The server output is uploaded to workerd and the client output goes to the assets
directory, so a module reached by both is emitted twice regardless of anything the graph
does. And a `.client.tsx` importing a `.server.ts` **prints differently per side** — the
real import on the server, ticket 20's stub on the client — so identity in the graph and
identity in emission genuinely come apart. Keeping them as one node with a derived
placement is what stops that difference leaking into every query about "this module".

The path is the **realpathed** one, per ticket 10. This matters more than it looks: it is
what makes Bun's isolated layout collapse to one node rather than several, and it is what
makes decision 8 below exact.

### 2. The matrix

The most quotable artifact in the spec, and the `.shared.` row is the only part that was
a real choice.

| importer ↓ / imported → | `.server.` | `.client.` | `.shared.` |
| --- | --- | --- | --- |
| **`.server.`** | plain import | **plain import** — Client components render during Server rendering | plain import |
| **`.client.`** | **Server boundary** — replaced by an RPC stub in the client output, real on the server (ticket 20) | plain import | plain import |
| **`.shared.`** | **hard error** | plain import | plain import |

**`shared → server` is a hard error, always.** It is safe when the shared module is only
server-reached and a data leak when something also reaches it from the client — and that
is a property of a *distant importer*, not of the file in front of you. Making it
colouring-dependent would produce a diagnostic pointing several hops away that has to
print the whole chain to be intelligible. Making it a boundary, symmetric with
`client → server`, is worse still: the same source line would be a direct call on the
server and a network round-trip on the client with nothing syntactic to tell them apart,
which is exactly the property a shared module must not have.

Stated positively, and this is the remedy the diagnostic should carry: **a module that
imports server code is not shared.** Rename it `.server.ts`, or move the import into a
`.client.tsx` where it becomes an explicit boundary.

**`shared → client` is legal**, and needs no argument beyond the definition: Client
modules run on both sides, so wherever the shared module lands the import is valid. A
shared module composing or re-exporting a Client component is a real case and costs
nothing.

**The matrix does not apply to third-party modules**, which have no declared side. A
suffix on a file inside `node_modules` means nothing — constraint 16 says third-party is
uncoloured, and a package that happens to ship `foo.server.js` is not making a claim in
ursprung's vocabulary.

### 3. Edges

Six syntactic forms; five produce an edge.

| Form | Edge? |
| --- | --- |
| `import { a } from "x"` / `import x from "x"` / `import * as x from "x"` | yes |
| `import "x"` (no clause) | yes — side effects are the point |
| `export { a } from "x"` / `export * from "x"` | yes |
| `import("x")` with a **string-literal** specifier | yes |
| `import type { A } from "x"` | no |
| `import { type A } from "x"` where **every** specifier is `type`-marked | **no — elided** |

**A dynamic `import()` is an ordinary edge.** Identical to a static import for resolution,
colouring and the matrix, differing only in deferring evaluation — which ticket 27
established changes nothing about what is emitted or compiled. It does **not** create an
entrypoint: v0's entrypoints are exactly the generated Root entrypoint plus one Route
entrypoint per Route, and making every `import()` site an emission root would turn
entrypoint derivation into an unbounded graph analysis for no v0 benefit. **A non-literal
specifier is a hard build error** — ursprung ships no loader and no runtime resolver, so
`import(userInput)` cannot be made to work by any amount of build effort.

**An import declaration whose every named specifier is `type`-marked, and which has no
default or namespace binding, contributes no edge and is not printed.** This is ticket
11's §5.7 hazard — the only one its printer did not dissolve — and it is dissolved here
rather than carried into colouring.

The reason it is safe is that the `type` keyword is **syntax**, so no type model is
involved; ticket 06's finding concerns `import { Foo }` where `Foo` merely happens to be a
type, which stays impossible. The reason it matters is that the inline form is not exotic:
it is this repo's own house style, oxlint's `consistent-type-specifier-style` is configured
to enforce it, and a Client component importing a return type with
`import { type BuildRow } from "./api.server.ts"` is completely natural. Left live, that
erases to `import {} from "./api.server.ts"` and mints a `client → server` boundary edge
carrying zero bindings — an RPC stub for nothing.

The alternative considered was rejecting the construct as an eleventh reject-list entry.
It was dropped once the two turned out to **produce the same program**: `import type` drops
the module's side effects too, so rejecting does not preserve them — it only makes the
author perform the same deletion by hand. Mixed clauses are unaffected
(`import { type A, b }` keeps `{ b }` and its edge), and the escape hatch is identical
either way, since a clause-less `import "x"` is untouched.

**The honest cost, stated because it is a real divergence.** TypeScript under
`verbatimModuleSyntax` emits `import {} from "x"` precisely so that side effects survive.
ursprung does not. A module reachable *only* through an all-`type` clause stops being
evaluated. Writing `import "x"` is the fix and the reject list stays at ten.

**An edge carries a specifier, not a target.** Ticket 04 established that export conditions
are a set, and the two sides resolve under different ones — `workerd`/`worker` against
`browser` — so `import "foo"` written in one `.shared.ts` **resolves to different files on
the two sides**, and `#`-prefixed subpath imports, which ticket 04 found are not skippable,
do the same to first-party specifiers. Traversal therefore runs once per side under that
side's condition set, and nodes are interned by real path across both runs, so
`foo/workerd.js` and `foo/browser.js` are simply two nodes with their own reach.

The alternative — erroring when a specifier resolves differently per side — would reject
the single most common reason a package ships a `browser` condition at all, making a large
slice of npm unusable from a shared module. Resolving once under merged conditions gives
one of the two sides a module built for the other, which is the exact failure the
conditions exist to prevent. The condition **lists** are ticket 13's; only their
consequence for the graph's shape is settled here.

### 4. Colouring

**Seeds.** First-party modules declare their side in the filename; an unsuffixed `.ts` or
`.tsx` reached by the graph is a constraint 9 error, and — from ticket 08 — so is any
graph module importing the Config file or the Route file, both of which are build input
rather than nodes. Third-party modules seed as `third-party` and never declare.

**Propagation is reachability, run once per side.**

- The **server traversal** starts at the Root entrypoint and reaches everything: through
  `server → client` crossings (SSR renders Client components), through `client → server`
  boundary edges (the real function lives here), through shared and third-party alike.
- The **client traversal** is the server traversal minus the server-declared modules,
  seeded at the crossings. It **cuts** at every boundary edge, which is where ticket 20's
  stub goes in.

A module's `reach` is the union over the two runs. Two facts fall out that are worth
naming because they make several later questions vanish:

- **Every Client module is server-reached**, by construction — client roots come from
  `server → client` crossings, so there is no client module the server traversal has not
  already walked. Being server-reached is not being *evaluated*; it only means the module
  is present in the server output for rendering.
- **A `.server.ts` reached only through a boundary edge still gets server reach**, because
  the client module importing it is itself server-reached and the server traversal walks
  straight through.

**Constraint 15 is checked per traversal**, not per module: any `node:*` import is a hard
error on the client run, and on the server run only if the specifier is outside the
natively-implemented set. So a package that touches `node:` is usable server-side and
fails only when something drags it client-side — and the diagnostic must name the chain,
since the offending import is in code the author cannot edit.

### 5. Entry points

**Server: one generated Root entrypoint, N generated Route entrypoints.** The Root
entrypoint carries the router and the generated route table (ticket 08, decision 3) and
lazily `import()`s Route entrypoints, which ticket 27 established workerd permits
mid-request with no compatibility flag.

**A Route entrypoint is self-sufficient**: it imports its own `layout`, `component` and
`api` modules *and its full ancestor layout chain*, so one import satisfies a matched
request completely. Ticket 08 gives a Route up to four module references while
`CONTEXT.md` defines a Route entrypoint as one module per Route per side, so it has to be
generated either way; making it self-sufficient keeps composition in the build rather than
the runtime. Ancestor layouts are then reached by many Route entrypoints and become Common
modules **automatically**, with no extraction rule written anywhere.

**Client: the crossing set.** Every `.client.` module reached at a `server → client` or
`shared → client` crossing is a client root **in its own right**. There is no generated
per-Route client entrypoint.

The obvious symmetric answer — one generated module per Route statically importing every
Client module that Route can reach — dies on resumability. Loading it would **evaluate all
of them eagerly**, which is hydration-shaped execution and precisely what Resumption
exists to avoid; it would also ship code for branches that did not render. Ticket 19 would
then have to undo it.

So this ticket deliberately stops short of *how the browser is told to load client code*.
That is entangled with the resumability payload (ticket 19) and the client-runtime fog,
and the graph needs only enough to emit the right modules and prove the invariant. What it
does record is, per Route, **which client roots that Route reaches** — the input to ticket
21's preload hints and to whatever ticket 19 decides.

### 6. Enforcement

Two layers, both always on, both **throwing** rather than producing a diagnostic — ticket
10's rule, because a violation here means ursprung is broken and there is no user action
to suggest.

1. **Graph assertion, before emission.** No node whose declared side is `server` has
   `client` in its reach set.
2. **Emission audit, after.** Every emitted client module's provenance is a
   client/shared/third-party node, and every import specifier it emits resolves inside the
   client output or to a permitted external.

The second layer reads the **emission records**, not the graph, which is the point: a
wrong traversal cannot satisfy it by being wrong consistently. Tests cover the rules;
these cover the code.

Worth stating plainly: the invariant should already be unreachable by construction —
`shared → server` errors and `client → server` becomes a stub with no edge into the client
output — so enforcement is checking the *implementation* of those rules, not the rules. A
byte-level re-parse of the emitted client output was considered and declined for v0; it is
the only thing that would also catch a server function body reaching the client through a
mis-built stub, and it costs a second full parse of everything client-side on every build.
If ticket 20's stub design turns out to be delicate, that is the lever to pull.

### 7. Circular imports are legal

**Constraint 10's cycle ban is dropped**, and this is a proposed amendment on the map
rather than an edit made here.

The ban's justification died with flat concatenation: concatenating modules into one scope
**cannot express a cycle**, which is why the clause existed. ursprung now emits real ESM
on both sides, and both hosts own cycle semantics natively under TDZ rules — a first-party
cycle that works in workerd or the browser works here. The clause survived the constraint
10 amendment by being carried along, not by being re-argued. This is the same shape as the
source-maps finding from ticket 11: a rule that outlived its reason.

It also removes a failure mode nobody would enjoy. Internal cycles are not rare in real
packages, and a ban surfaces at integration time, in code the author cannot edit, with
"drop the dependency" as the only remedy.

**The accepted cost** is a diagnostic: an accidental first-party cycle is easy for an
agent to introduce and its TDZ failure is famously hard to read. Cycle *detection* does not
disappear — the traversal still needs a visited set — so reporting one is cheap to add
later if it proves worth it.

**A consequence for ticket 14.** With cycles legal there is no topological order at all —
but real ESM does not need one, because the host owns evaluation order. That dissolves
ticket 14's "topological order is underspecified when several orders are valid"
sub-question rather than answering it. Emission order now only has to be **deterministic**,
so sorting by path is the whole rule.

### 8. First-party is "no `node_modules` segment in the real path"

Ticket 10's realpathing makes this exact rather than heuristic. Bun's isolated layout
resolves a published package to
`node_modules/.bun/<name>@<ver>/node_modules/<name>/…` — still under `node_modules` — while
a workspace member resolves **out** to `packages/<name>/…`. So a workspace member is
first-party and **must declare its side**.

That is constraint 16's own test applied verbatim: *we control our source; we don't control
npm's*, and a workspace member is our source. The alternative — first-party means reached
by a relative specifier, so a workspace package imported as `@app/utils` is uncoloured —
avoids leaking the naming convention but gives up the invariant exactly where it is easiest
to lose: a genuinely server-only module in your own workspace package would carry no
declaration, have its side inferred, and be free to reach the client. That is the failure
constraint 9 exists to prevent.

**The accepted cost:** a workspace package that is *also* published to npm has to carry
ursprung's side suffixes in filenames its other consumers see.

### 9. What the graph carries

**One graph, annotated in place** by each phase — parse, resolve/traverse, colour, audit —
rather than a pipeline of immutable values. Every consumer sees one object with everything
on it.

Per node: real path, declared side, reach set, import records (specifier, edge kind,
binding list, and the per-side resolved target) and export records. Two derived indexes are
materialised rather than left to consumers, because both have exactly one job:

- the **boundary-edge list** for ticket 20 — the RPC security surface should not be
  recomputed by a second walker that can disagree with the first;
- **per-entrypoint reach** for ticket 21's preload hints.

**The tension this creates, and how it is resolved.** Ticket 10 promises diagnostics
batched *from the failing phase* and byte-identical output independent of host, and a
single mutable graph gives neither for free. Both are kept without a phase-shaped data
structure:

- **Phase identity lives in the build driver**, not the graph. The driver knows which phase
  it is running and tags what that phase produces, so "which phase failed" stays a fact
  rather than becoming a convention.
- **Determinism is bought through deterministic iteration.** Nodes are held in insertion
  order from ticket 10's sorted enumeration, and every map is walked in sorted-path order
  at emission. Nothing below that point may use a timestamp, a random name or host-supplied
  ordering.

### Handed to other tickets

- **Ticket 13** — owns the two condition sets. This ticket only fixes that they are two,
  and that an edge therefore stores a specifier rather than a target.
- **Ticket 14** — the topological-order sub-question is dissolved, not answered; emission
  order need only be deterministic. Common-module extraction is dissolved too: with real
  ESM a module reached by several entrypoints is emitted once by construction.
- **Ticket 20** — takes the materialised boundary-edge list and the export records. Note
  the gap this ticket cannot close: the client traversal cuts at a boundary edge, but
  *which* server exports become callable is the allowlist question, and a `.server.ts`
  reached from a `.client.tsx` appears nowhere in the Route file.
- **Ticket 21** — takes per-entrypoint reach as the input to modulepreload hints, and
  inherits the Root/Route entrypoint shape from decision 5.
- **Ticket 09** — a Route entrypoint carrying its ancestor layout chain is a build-side
  fact; how the chain composes at render time is still open there.

## Comments

**2026-08-08, from [ticket 13](./13-module-resolution-rules.md) — the graph gains a second
node kind.** v0 resolves JSON imports and emits them as JavaScript
(`export default JSON.parse(…)`), so a node is now either a **source module** or a **data
module**. Three consequences for this ticket's model, none of which contradict it:

- A data module is a **leaf**: it has no specifiers, so it contributes no edges and cannot
  participate in a cycle.
- A data module is **uncoloured** — its Side is inferred from reachability, exactly as a
  third-party module's is, and it is subject to the Reach invariant but not to the 3×3
  matrix. This holds even when it is first-party, which is forced rather than chosen: the
  motivating file is `package.json`, whose name is not ours to pick, so a `.server.` /
  `.client.` / `.shared.` suffix cannot be required of it. Constraint 9 is untouched — it
  speaks of unsuffixed `.ts`/`.tsx` and is silent on `.json`.
- Interning is unchanged: one node per realpathed path, and a data module reached from both
  sides is one node with both reaches, emitted once per side like any other.
