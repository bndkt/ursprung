# 26 — Errors and status codes after the stream has started

Type: grilling
Status: open
Blocked by: 18
Map: [ursprung v0](../map.md)
Graduated from: [07 — The canonical demo app](./07-canonical-demo-app-prototype.md)

## Question

The demo app's `/builds/:id` route looks up a build and does not find one. It cannot
respond 404: the root layout's markup has already flushed, so the status line and headers
are long gone. It returned `<p>No such build.</p>` — which is a 200, and wrong.

Constraint 12 makes this **structural rather than incidental**. In-order streaming means
a Server component deep in the tree runs strictly after its ancestors have been written,
so by the time any nested route can fail, the response has committed.

Settle what an application author can do, and what ursprung does when they do nothing:

- Can a route declare a status **before** rendering — a check that runs early enough to
  still own the status line — and is that a separate lifecycle from rendering?
- What happens to a component that throws mid-stream? The connection is open and the
  document is half-written. Truncate, append a visible error, or close cleanly and leave
  the page broken? Whatever is chosen, the browser has already parsed the prefix.
- Does anything get emitted for a client that is mid-parse, and does the Resumability
  payload survive a failed render at all?
- Is there a way to render the not-found case at the right status without giving up
  streaming for the whole route?

Note the tension with ticket 18's decision to flush eagerly: the earlier the first flush,
the better the perceived performance and the smaller the window in which any route can
still set a status.

Error **boundaries** — the component-level construct — stay in the map's fog and are not
this ticket. This ticket is about the response, not the component tree.

## Answer should record

The rule for status codes on nested routes, the behaviour on a mid-stream throw, and what
the author writes for the not-found case in the demo app specifically.

## Input from ticket 08 — the hole is yours, intact

[Ticket 08](./08-route-and-config-authoring-api.md) considered **loaders** and declined
them, so nothing runs before the first flush and this ticket inherits NOTES #7 undiluted.

The reasoning, so it is not re-argued from scratch: the usual case for loaders is
parallelism, which constraint 12 blunts — in-order streaming blocks at an async
component's position regardless, and a component can already start a fetch at the top and
await it later by hand. The strong case is precisely this ticket's problem: a loader runs
before any markup flushes, so a 404 or redirect discovered while loading can still set a
status code. That was declined only because deciding a mechanism here, before this ticket
(and ticket 18 behind it) had done the analysis, is the wrong order.

**A pre-render hook that may short-circuit with a `Response` is therefore open to this
ticket**, and adding one is additive — v0 has no loader concept, so there is nothing to
undo.
