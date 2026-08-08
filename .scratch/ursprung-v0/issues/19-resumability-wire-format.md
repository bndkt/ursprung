# 19 — The resumability wire format

Type: grilling
Status: open
Blocked by: 03, 17, 18
Map: [ursprung v0](../map.md)

## Question

The hardest decision on the map, and the one with the widest blast radius: **what does
the server emit alongside the HTML so that the client can resume without executing the
component tree again?** Ticket 03 supplies the prior art, ticket 17 the reactivity
primitives, ticket 18 the stream this has to interleave with.

Get this wrong and the framework either re-renders on the client — in which case it is
hydration with extra steps and the whole premise is gone — or ships a payload so large
that resumability costs more than it saves.

Decide:

- **What must the client know**, minimally, to be interactive? Enumerate it before
  designing anything: the reactive state values, which DOM positions depend on which
  state, which handler belongs to which element and event, and where the code for each
  handler lives. If something on that list can be derived rather than transmitted, say
  how.
- **Where does it live?** Attributes on the elements themselves, one trailing JSON
  script, several inline scripts interleaved with the HTML, or a combination. Constraint
  12's in-order streaming is the hard part: a single trailing payload is much simpler,
  but only works if nothing needs to be known before the document ends — check that
  against ticket 18's answer rather than assuming.
- **State serialisation.** Which types survive; how object identity and cycles are
  preserved when two components reference the same object; what happens to something
  unserialisable — silent drop, build error, or runtime error. Note this problem also
  appears in ticket 09 (props across the boundary) and ticket 20 (RPC arguments); decide
  whether all three share one serialiser or each has its own.
- **Code references.** How does "this element's click handler is export `x` of client
  bundle for route `y`" get onto the wire compactly, and how does the client resolve it
  at interaction time? Ticket 03 will describe Qwik's QRLs — decide what we take.
- **Reconstructing the reactive graph.** The client must re-establish subscriptions
  without running components. Does it rebuild the graph eagerly on load, or lazily on
  first interaction with a given part of the page? Lazy is the whole point of
  resumability; say concretely how it works.
- **Payload size.** What is the budget for a trivial page, and what grows with what?
  Name the pathological case.
- **The falsifiable test.** How do we _prove_ the client did not re-render — a counter, a
  build-time assertion, an instrumented host (ticket 16) that records zero create
  operations on load? Decide it here; it belongs in the demo app from ticket 07.

Strong candidate for `/prototype`: hand-write the HTML and payload for one trivial page
and one interactive one, then hand-write the client code that resumes them. If that is
hard to write by hand, it is the wrong format.

## Input from ticket 22 — the falsifiable test is already decided

[Ticket 22](./22-testing-strategy.md) §7 answers this ticket's last bullet, so do not re-decide
it; inherit the harness and design the format against it.

The check is the **Recording Host**: after resumption and one dispatched event, zero
node-creation operations and exactly the property writes the interaction should cause. It is
falsifiable in both directions — a re-render raises the creation count, an over-broad patch
raises the operation count. It is sound only because ursprung has no virtual DOM and no
diffing, so a component that re-executed would have to build a tree through the Host; a format
that would break that property breaks the test with it.

Two riders. Resumability fixtures **also** self-instrument — components increment a counter in
a shared module — because the Host assertion infers "no component ran" from "no nodes created";
a runtime test hook was rejected as production surface in the client hot path. And the browser
layer asserts **node identity** instead, since it can see neither counter, which means the
format must leave server-rendered nodes in place rather than replacing them.
