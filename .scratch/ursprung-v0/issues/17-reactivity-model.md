# 17 — The reactivity model: signals as an application-facing API

Type: grilling
Status: open
Blocked by: 02, 09
Map: [Ursprung v0](../map.md)

## Question

TC39 Signals give us `Signal.State`, `Signal.Computed` and the `Signal.subtle` machinery
— and deliberately no `effect`. Ticket 02 supplies the exact surface. This ticket decides
what an application author writes and what the framework builds on top.

Decide:

- **What does an app author actually touch?** The raw `Signal.State` API, or an Ursprung
  wrapper? A wrapper adds a layer to maintain and hides a standard, which the vision's
  "less magic" principle disfavours; raw signals expose `.get()`/`.set()` ergonomics
  that may read poorly in JSX. Decide, and note which way "no legacy, follow the
  standard" points.
- **The effect primitive.** The proposal has none — we must build one on `Watcher`.
  Decide its API, its scheduling (microtask, animation frame, synchronous), and its
  disposal contract. Given a component runs once (ticket 09), effects created during
  render need an owner; name it.
- **Ownership and disposal.** When a conditional branch is torn down, its signals,
  computeds and effects must be released or they leak. What owns what? This is the part
  fine-grained frameworks get wrong, and it interacts directly with ticket 09's
  create/destroy mechanism.
- **Binding a signal to the DOM.** How does `<span>{count}</span>` become a subscription
  that writes to one text node? Is a signal in JSX detected at runtime by the runtime
  functions, or marked at build time by the bundler? A build-time answer is faster and
  more explicit; a runtime answer is simpler. Same question for attributes.
- **Reading a signal on the server.** During SSR a signal is read once and rendered.
  Does the server track subscriptions while doing so — because if the client is to resume
  without re-rendering, _something_ must record which signal fed which DOM position, and
  the server is the only place that knows. Decide whether that recording happens here or
  in ticket 19, but make sure exactly one of them owns it.
- **Batching and glitch-freedom.** What happens when several signals change in one turn,
  and what does the author have to know about it?
- **Async.** Is there a resource/async-derived concept in v0, or does async live entirely
  in async components (ticket 09)? Adding both is a duplication worth avoiding.
- **What we refuse.** Stores, reducers, context, deep proxies, two-way binding — name
  what is not in v0 so the spec settles it in advance.

## Established by ticket 02 — read before starting

From [the signals research](../research/02-signals.md):

- **Never declare a `Watcher` at module scope.** Every effect recipe in the primary
  sources does exactly that, and module scope is per-isolate on Workers. Server rendering
  itself is safe — computed callbacks are synchronous, so tracking cannot leak across an
  `await`.
- **A computed first evaluated while reading no signals records zero sources and is a
  frozen constant forever**, silently. The indirection-cell pattern (a `Signal.State`
  holding the current producer, wrapped in a stable `Signal.Computed`) is the verified
  escape and preserves identity across the moment a client module's code arrives.
- **Ursprung must own signal identity** — no `toJSON`, no ids, and `introspectSinks`
  reports only _watched_ consumers. Subclassing with private fields is the cheap place to
  hang a node id. Coordinate with ticket 19 on which of the two owns the recording.
- The proposal is **stale at Stage 1** and the polyfill's own README says not to use it in
  production. Worth deciding how much of it we wrap versus expose.
- **Loose end:** proposal issue #116 "Integration Stories" could not be read this session
  and should be, before this ticket locks the API.
