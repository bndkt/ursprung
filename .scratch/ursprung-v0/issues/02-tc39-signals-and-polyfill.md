# 02 — TC39 Signals and signal-polyfill: API surface, status, integration patterns

Type: research
Status: resolved
Blocked by: —
Map: [Ursprung v0](../map.md)

## Question

Ursprung's reactivity is fine-grained and built on TC39 Signals plus the accompanying
polyfill. Ticket 17 designs the application-facing reactivity API and ticket 19 the
resumability wire format; both need the primitives pinned first.

Establish from primary sources — the tc39/proposal-signals repository, the polyfill's
source, and the proposal text itself:

- What stage is the proposal at, and how stable is the API? What has changed recently
  and what is still contested?
- What is the exact surface of `Signal.State` and `Signal.Computed` — constructor
  options, `get`, `set`, equality handling, and what happens on a write inside a
  computation?
- What is `Signal.subtle` for? Specifically: `Watcher`, `untrack`, `currentComputed`,
  `introspectSources`/`introspectSinks`, and the `watched`/`unwatched` callbacks. These
  are the hooks a framework needs — document each one's contract precisely.
- **There is no `effect` in the proposal.** Document exactly how a framework is expected
  to build one on top of `Watcher`, including the scheduling/microtask story and how
  disposal works.
- What is the glitch-freedom and evaluation model — lazy or eager, push or pull? When
  does a computed re-evaluate, and can an observer see an inconsistent intermediate state?
- What is the published polyfill package, its version, licence, dependencies, and module
  format? Does it ship ESM? Does it touch any Node API?
- **The question that matters most for us:** can a signal graph be constructed
  _incrementally and out of order_ — i.e. can we create a `Signal.State`, hand its
  identity to something else, and wire up dependents later? Resumability depends on
  reconstructing a graph from serialised data rather than by executing components, so
  document anything in the API that helps or blocks that.
- How do existing fine-grained frameworks (Solid, Preact Signals, Angular signals) map
  their primitives onto this proposal, and what did they find missing?

Write the findings to `.scratch/ursprung-v0/research/02-signals.md`, citing the source
for each claim.

## Answer

Findings: [`research/02-signals.md`](../research/02-signals.md).

**The decisive question is answered yes — with a trap.** Construction order is entirely
free: a `Signal.Computed`'s callback does not run at construction, so a signal graph can
be built downstream-before-upstream, resolved through a registry, or closed over values
assigned later. That is what Resumability needs. But **first-evaluation** order is not
free: a computed that is first evaluated while reading no signals records zero sources
and is then a frozen constant forever, silently, with no error. Two escapes were
verified; the one that suits Ursprung is an **indirection cell** — a `Signal.State`
holding the current producer, wrapped in a stable `Signal.Computed` — which preserves the
identity handed to an event handler across the moment a client module's code arrives.
The proposal's own README carries three never-written TODOs on exactly this ("show how
serializing the signal graph works", "how you can hydrate a signal from state to computed
later"), so we are building on undocumented and, by the authors' admission, unproven
ground.

**The proposal is stale, not merely early.** Stage 1, presented to TC39 twice in 2024 and
not since; `spec.emu` is a nine-line stub; the README is the only proto-spec and its last
semantic edit was 2024-08. The class name, the constructor shape, `get`/`set` versus
`accessor`, and whether `Computed` is writable are all still open. `signal-polyfill@0.2.2`
is from January 2025, has had no release in ~19 months, and its own README says not to
use it in production. Confirmed independently against the npm registry: version 0.2.2,
`"type": "module"`, Apache-2.0, zero runtime dependencies — **and no `exports` field**,
only `"main": "dist/index.js"`.

Three consequences that land on other tickets:

- **Ticket 13 has an answer handed to it.** Our own dependency has no `exports` field, so
  making `exports` mandatory would fail on the first package we ship. `main` fallback is
  not optional.
- **Ticket 17 must not declare a `Watcher` at module scope.** Every effect recipe in the
  primary sources does exactly that, and module scope is per-isolate on Workers. Server
  rendering itself is safe — computed callbacks are synchronous, so tracking cannot leak
  across an `await` — but the recipes are not directly usable.
- **Ursprung must own signal identity.** There is no `toJSON`, no ids, and
  `introspectSinks` reports only _watched_ consumers, so the Resumability payload cannot
  be produced by walking the graph after Server rendering (ticket 19). Subclassing
  `Signal.State`/`Computed` with private fields works and is the cheap place to hang a
  node id.

**A qualified conflict with constraint 10.** Two module instances of the polyfill are two
disjoint graphs, and the cross-copy failure is silent — a computed from copy B reading a
state from copy A returns one correct value and then freezes. Within a single bundle this
cannot happen. It becomes real only if two Route bundles are ever live in one document,
which is precisely the open "client-side navigation" question in the map's fog. Recorded
there rather than treated as a live contradiction.

**Not established:** proposal issue #116 "Integration Stories" was unreachable this
session and should be read before ticket 17 locks the reactivity API. Polyfill bug #27
could not be reproduced in three sequences and remains open — treat as unresolved.
