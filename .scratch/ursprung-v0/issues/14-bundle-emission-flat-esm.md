# 14 — Bundle emission: flat ESM concatenation without a scope model

Type: grilling
Status: open
Blocked by: 11, 12
Map: [Ursprung v0](../map.md)

## Question

Two locked constraints are in tension and this ticket resolves it. Constraint 10: one
self-contained flat ESM file per bundle, modules concatenated in topological order with
imports rewritten to local bindings. Constraint 8: no scope or binding model in the
parser.

**Flat concatenation normally requires renaming**, because two modules may each declare
`const config`. Renaming requires knowing which identifier references bind to which
declaration — a scope model. So either the tension is resolved by a trick, or one of the
two constraints has to give.

Decide, starting with the options and adding any others:

- **Wrap each module in an IIFE or arrow function**, keeping every module's scope its
  own, and link them with a small registry of exported bindings. No renaming, no scope
  model. Costs: a wrapper per module, live bindings and hoisting become manual, and
  top-level `await` and circular references get awkward — though constraint 10 already
  bans cycles.
- **Prefix-rename every top-level declaration mechanically**, e.g. every declaration in
  module N becomes `_N_name`. This needs only the top-level _declaration_ names, not a
  full scope model — but a nested reference to a shadowed inner variable of the same name
  must not be rewritten, which is exactly the scope problem creeping back. Establish
  whether a cheap conservative rule exists, or whether this is a trap.
- **Concede a minimal top-level scope model** — track only which names are declared at
  module top level and which identifier occurrences are free. Narrower than a full
  binding analysis. If this is what it takes, amend constraint 8 explicitly rather than
  quietly.

Also decide:

- **Export shape.** What does a client bundle export, and what does the server bundle
  export for Wrangler to import as the Worker entry?
- **Ordering.** Topological order is underspecified when several orders are valid.
  Pick a tiebreak that makes output byte-deterministic (ticket 10).
- **`import.meta`, dynamic `import()`, top-level await** in a flattened bundle — each
  needs an answer or an explicit ban.
- **External imports.** `node:*` stays external on the server (constraint 15) — those
  survive as real `import` statements at the top of the emitted file.
- **How the RPC stubs from ticket 20 are woven in**, since they are generated code that
  never existed as a source module.

This is a strong candidate for `/prototype`: emit two hand-written bundles by both
strategies and look at them, rather than arguing in the abstract.
