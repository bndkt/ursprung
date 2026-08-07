# 25 — How bindings reach server code

Type: grilling
Status: open
Blocked by: —
Map: [ursprung v0](../map.md)
Graduated from: [07 — The canonical demo app](./07-canonical-demo-app-prototype.md)

## Question

Writing the demo app needed `env` in three separate files — an async Server component, a
Server module behind the Server boundary, and an API route handler — and all three faked
it with `declare const env`, because nothing on the map says where it comes from.

On Workers, bindings arrive **per-request, as an argument to the `fetch` handler**. They
are not module scope, and module scope is per-isolate, so the obvious shortcut — assign
`env` to a module-level variable on first request — is a cross-request leak in a runtime
that may serve two tenants from one isolate. Ticket 02 already found the same hazard from
the other direction: a `Watcher` at module scope is per-isolate, not per-request.

Settle how application server code obtains bindings, and by extension whatever else is
per-request (the `Request` itself, `ExecutionContext`, `waitUntil`, a request id).

Roughly the space:

- **Threaded explicitly** — every Server component and every server function takes a
  context parameter. Honest, obvious, and no runtime machinery. It also puts a parameter
  on every component signature forever, and the Server boundary has to decide whether an
  RPC-exposed function's context parameter is caller-supplied (it must not be) or
  injected on arrival.
- **Ambient per-request** — an `AsyncLocalStorage`-shaped accessor. Ergonomically far
  better and it keeps component signatures clean, but it is a runtime capability, it is a
  `node:*` import that must be on the natively-implemented list under constraint 15, and
  if it needs a package it is a constraint 6 dependency question. Check what workerd
  provides natively before assuming.
- **Injected at the boundary** — the framework passes context into route components and
  API handlers only, and anything deeper receives it by argument.

Whatever is chosen must answer: what a Client component sees (nothing, presumably — it
runs in the browser too), and what a function behind the Server boundary sees when it is
invoked over capnweb rather than during Server rendering.

This blocks tickets 09 and 20: 09 cannot settle the component signature without it, and
20 cannot describe what an RPC-invoked server function receives.

## Answer should record

The mechanism, the reason, and the exact signature an application author writes — for a
Server component, an API handler, and a function behind the Server boundary.
