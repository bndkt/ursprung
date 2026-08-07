# 03 — Resumability prior art: what Qwik and friends actually put on the wire

Type: research
Status: resolved
Blocked by: —
Map: [Ursprung v0](../map.md)

## Question

Resumability instead of hydration is the most expensive thing on this map to get wrong,
and it is the one place where there is real prior art to learn from. Ticket 19 designs
our wire format; this ticket gathers the evidence it will be designed against.

Investigate primarily **Qwik** — its documentation, its source, and the talks/posts by
its authors explaining the design — and secondarily any other genuinely resumable system
you find. Not React Server Components: that is streaming plus hydration, a different
thing, though a short note on why it differs is useful.

Establish:

- What exactly does a Qwik server response contain besides HTML? Enumerate the pieces:
  serialised application state, the `q:` attribute family, QRLs, the container element,
  the trailing state script. What is each one _for_?
- How is a **reference to code** serialised — what is a QRL, how does it encode
  "this chunk, this exported symbol", and how is it resolved at interaction time?
- How is **application state** serialised, and how are object identity, cycles, and
  references from multiple places preserved? What types are supported, and what is the
  escape hatch for something unserialisable?
- How is the **reactive graph** reconstructed without executing components? Where are
  subscriptions recorded on the server, and how does the client know which DOM node a
  given piece of state feeds?
- What is the **event delegation** mechanism — what listener is installed, when, and how
  does it get from a DOM event to the right lazily-loaded handler?
- How does resumability interact with **streaming**? Can state be emitted incrementally,
  or must it be flushed at the end once everything is known? This is decisive for us:
  constraint 12 commits v0 to in-order streaming.
- What did the Qwik team get **wrong** and later change? Look for rewrites, v2 notes,
  and post-mortems — the failure modes are worth more to us than the current design.
- What are the known costs — payload size, serialisation time on the server, the
  complexity the framework absorbs — and what do critics say doesn't pay off?

Write the findings to `.scratch/ursprung-v0/research/03-resumability.md`, citing sources.
End with a short section: **what a from-scratch, signals-based, in-order-streaming
framework should copy, and what it should refuse to copy.**

## Answer

Findings: [`research/03-resumability.md`](../research/03-resumability.md) — 978 lines,
built from the Qwik source directly (Qwik 2 `main` @ `9bcc0f8b`, Qwik 1 branch `v1` @
`841d645b`) plus a **real production payload captured and parsed from qwik.dev**. No live
Qwik 2 site could be found — every deployment probed still serves the v1 format — so the
v2 examples are reconstructed from source and the team's own writing, and the document
says so where that is true.

**The wire format, concretely.** Container attributes
(`q:container`/`base`/`instance`/`manifest-hash`/`runtime`); a one-character `:` attribute
on every Qwik-rendered element, which gates the client's depth-first element count;
`q-e:click="chunk#symbol#captureDeltas"` listener attributes; then three tail scripts in
fixed order — `qwik/state` (a flat `TypeId,value,…` root array with roots at `2n`/`2n+1`
and `RootRef` by index or by path), `qwik/vnode` (component and text structure encoded as
a punctuation-and-base-26 string), and `q:func` (stringified `sync$` bodies) — plus the
~1 kB Qwikloader and a `window._qwikEv` registration array.

**Measured cost, not a published figure:** the payload is **15.5% of HTML bytes**
(32,986 / 213,113) on a real page, and the state script alone is ~11.7% of the gzipped
page. That is the number ticket 19's payload budget should be set against.

**This is strong evidence _for_ constraint 12.** State is a whole-document post-pass in
both versions — v1 builds it in `beforeClose`, v2 streams it but only at container close.
Every piece of machinery Qwik built to survive _out-of-order_ streaming — backpatching,
`SubscriptionPatch`, Cantor-paired negative segment ids — is complexity that in-order
streaming simply does not incur. The in-order restriction was chosen to protect the wire
format from being invalidated later; it turns out to also delete a large amount of the
hardest machinery in the prior art.

**The failure modes are the valuable part**, and they are specific:

- v1 encoded structure in HTML comments and shipped **CVE-2026-25148**, an XSS from
  unescaped concatenation into comment markers. Ticket 18's escaping question and ticket
  19's placement question are the same question, and this is why.
- v1 wrote `q:id` speculatively _because HTML streams and you cannot know yet_ — the
  exact tension between streaming and identity that ticket 19 has to resolve.
- v1 had **no gate** between the loader going live and the state arriving.
- v1's `{refs,ctx,objs,subs}` used four parallel index spaces and stringly-typed
  subscriptions (`"0 #1 link"`). v2 fixed all four, and its design doc's own rule is
  "prefer arrays over encoding data into strings".

**Two admissions from the Qwik team worth carrying into ticket 19:** `statePrewarm`
exists in v2 (default off) because lazy deserialisation "can turn into one large
synchronous task" on big graphs — the long task returns, just later, which undercuts part
of the resumability promise. And v2 stopped serialising `routeLoader$` data by default,
likely the single largest payload win, which bears directly on ticket 08's open question
about whether v0 has loaders at all.

The document ends with 12 things to copy and 10 to refuse. It is explicit about four
things it could not establish: a real v2 production payload, a formal Qwik post-mortem or
RFC, quantified server-side serialisation cost, and anything about Marko 6's format.
