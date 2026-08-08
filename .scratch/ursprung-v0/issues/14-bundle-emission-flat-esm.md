# 14 — Bundle emission: flat ESM concatenation without a scope model

Type: grilling
Status: open
Blocked by: 11, 12, 27
Map: [ursprung v0](../map.md)

## Question

> **Premise changed 2026-08-07, and the change has now landed. Treat everything below as
> historical and rewrite this ticket before working it.** It was written to resolve a
> contradiction between constraint 8 (no scope model) and constraint 10 (flat
> self-contained bundles). Constraint 10 has since been replaced and approved: ursprung
> emits **real ESM modules on both sides**, linked by workerd's registry on the server and
> the browser's module map on the client. Both guarantee one instance per resolved
> specifier, and neither needs a loader from us.
>
> **That dissolves this ticket's central problem rather than answering it.** Real modules
> get module scope for free, so there is no renaming, no identifier collision, and no
> scope model needed anywhere. The three options below — IIFE wrappers, prefix renaming,
> a minimal scope model — are all moot, and constraint 8 is no longer in tension with
> constraint 10 at all.
>
> What this ticket becomes: module naming and **content hashing of filenames** — never a
> query string, since the registry keys on the resolved specifier and `?v=2` mints a
> second instance — the extraction rule (which modules are reachable from more than one
> entrypoint), emission ordering and determinism, and how RPC stubs are woven in.
>
> Two further inputs from ticket 11, now that emission is printed rather than patched:
> output is **printed from the AST with verbatim spans for pure-JavaScript subtrees**, so
> a third-party module is close to a byte copy and only its import and export statements
> print; and **output positions bear no relation to source positions**, which is what puts
> source maps back on the table as an open scope question.

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

## Handed here by ticket 27

[Ticket 27](./27-workerd-dynamic-import-at-request-time.md) resolved the platform question
this ticket was blocked on: workerd permits request-time `import()` with no compatibility
flag, and its registry gives **one instance per resolved specifier**, so the shared-module
extraction the pending amendment describes is safe on the server as well as the client.

The emitter obligation that follows is narrow and absolute: **one canonical specifier per
module, with content hashing in the filename and never in a query string.** The registry
keys on the specifier rather than the file, so emitting the same module under two
specifiers — including one bare and one query-suffixed — mints two instances, two reactive
graphs, and a silent freeze. Ticket 02 found this trap on the client; ticket 27 shows the
emitter can reintroduce it on both sides.

Emitted modules must also carry I/O-free and top-level-await-free top levels; the legacy
registry hard-fails unsettled top-level await at first import, which is
first-request-to-that-Route rather than deploy time.

## Input from ticket 12 — decided, not open

Two of this ticket's remaining sub-questions are **dissolved rather than answered**, and
one input is fixed.

- **Topological order is gone.** Ticket 12 dropped constraint 10's cycle ban (a proposed
  amendment on the map), so there is no topological order to underspecify — and real ESM
  needs none, because the host owns evaluation order. Emission ordering now only has to be
  **deterministic**: sort by path, per ticket 10's determinism guarantee.
- **The extraction rule is gone too.** Emitting real ESM means a module reached by several
  entrypoints is emitted once and imported by all of them *by construction*. Being a Common
  module is a position in the graph, not a decision this ticket makes.
- **The emission unit is a `(node, side)` pair, not a node.** A module reached by both
  sides is emitted twice — the outputs go to different places — and a `.client.tsx`
  importing a `.server.ts` prints differently per side.
- **This ticket owns half of the enforcement.** Ticket 12's post-emission audit reads
  **emission records**, so emission must record, per emitted client module, its provenance
  node and the resolved target of every import specifier it writes.

See [ticket 12](./12-module-graph-and-two-colour-derivation.md), decisions 1, 6, 7 and 9.
