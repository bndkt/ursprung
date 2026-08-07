# 03 — Resumability prior art: what Qwik and friends actually put on the wire

Type: research
Status: open
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
  the trailing state script. What is each one *for*?
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
