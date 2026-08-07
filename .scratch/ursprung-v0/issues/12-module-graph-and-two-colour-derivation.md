# 12 — The module graph data model and two-colour derivation

Type: grilling
Status: open
Blocked by: 08
Map: [ursprung v0](../map.md)

## Question

> **Premise changed 2026-08-07 — read the map's Pending amendments first.** This ticket
> says "the server bundle", singular, throughout. Under the pending constraint 10
> amendment there is no single server output: the server is a **root entrypoint plus one
> module per Route**, and on both sides a module reachable from more than one entrypoint
> is emitted once and shared rather than duplicated.
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
> If ticket 27 comes back negative, only the server half reverts.

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
