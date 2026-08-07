# 12 — The module graph data model and two-colour derivation

Type: grilling
Status: open
Blocked by: 08
Map: [Ursprung v0](../map.md)

## Question

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
