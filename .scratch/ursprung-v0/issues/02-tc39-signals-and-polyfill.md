# 02 — TC39 Signals and signal-polyfill: API surface, status, integration patterns

Type: research
Status: open
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
  *incrementally and out of order* — i.e. can we create a `Signal.State`, hand its
  identity to something else, and wire up dependents later? Resumability depends on
  reconstructing a graph from serialised data rather than by executing components, so
  document anything in the API that helps or blocks that.
- How do existing fine-grained frameworks (Solid, Preact Signals, Angular signals) map
  their primitives onto this proposal, and what did they find missing?

Write the findings to `.scratch/ursprung-v0/research/02-signals.md`, citing the source
for each claim.
