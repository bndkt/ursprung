# 14 — Bundle emission: flat ESM concatenation without a scope model

Type: grilling
Status: open
Blocked by: 11, 12, 27
Map: [ursprung v0](../map.md)

## Question

> **Premise changed 2026-08-07 — read the map's Pending amendments first, and treat
> everything below as historical.** This ticket was written to resolve a contradiction
> between constraint 8 (no scope model) and constraint 10 (flat self-contained bundles).
> The maintainer has since proposed emitting **real ESM modules on both sides**, linked by
> workerd's registry on the server and the browser's module map on the client. Both
> guarantee one instance per resolved specifier, and neither needs a loader from us.
>
> **That dissolves this ticket's central problem rather than answering it.** Real modules
> get module scope for free, so there is no renaming, no identifier collision, and no
> scope model needed anywhere. The three options below — IIFE wrappers, prefix renaming,
> a minimal scope model — all become moot, and constraint 8 stops being in tension with
> constraint 10 at all.
>
> What this ticket becomes: module naming and content hashing, the extraction rule (which
> modules are reachable from more than one entrypoint), emission ordering and determinism,
> and how RPC stubs are woven in. Rewrite it once ticket 27 reports; do not work it as
> written. If 27 comes back negative on workerd dynamic import, only the **server** half
> reverts and the original framing below applies to the server alone.

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
