# 16 — The host interface: keeping the renderer DOM-agnostic

Type: grilling
Status: open
Blocked by: 15
Map: [ursprung v0](../map.md)

## Question

Constraint 2 puts native iOS out of scope but keeps one obligation in scope: v0's
renderer must talk to a **host interface**, with the DOM as one implementation, so a
SwiftUI host can be added later without a rewrite. This is the only native-facing
decision in v0, and it is here because it is far cheaper to design now than to retrofit.

The risk cuts both ways — a host abstraction designed against one implementation is
usually wrong for the second, and an abstraction built for a hypothetical second host
usually costs the first one dearly. This ticket has to find the honest middle.

Decide:

- **What operations does the host interface expose?** Create an element, set an
  attribute or property, insert, remove, move, create and update a text node, attach an
  event listener. Is that the complete set, and is each one genuinely needed by the
  renderer rather than by the DOM specifically?
- **What leaks?** The intrinsic element list from ticket 15 is HTML. Attribute names are
  HTML. A SwiftUI host has no `<div>`. Decide whether intrinsics are part of the host
  (each host declares its own element vocabulary) or part of the framework (one
  vocabulary, hosts translate). Both are defensible; one is much simpler for v0.
- **Server rendering is a host too.** SSR produces a string, not a tree — is the string
  renderer an implementation of the same interface, or a separate path? If it is the same
  interface, that is strong evidence the abstraction is real rather than aspirational.
  If it cannot be, that is worth knowing now.
- **Events.** DOM events are a specific model. What is the host-neutral shape, and how
  much of the DOM event object survives?
- **How much do we build in v0?** Options: define the interface and implement DOM and
  string hosts against it; or write directly against the DOM and only _keep the seam
  clean_, documenting where a host boundary would go. The second is cheaper and honest;
  the first is the only one that actually proves the abstraction works.
- **The test.** Whatever we choose, name the falsifiable check — e.g. a trivial third
  host implementation that records operations to an array, which would also be useful for
  testing the renderer. If a third host is easy, the seam is real.

`/codebase-design` is relevant: this is a deep-module question about where the seam goes.

## Input from ticket 22 — the Recording Host is required, and its shape is constrained

[Ticket 22](./22-testing-strategy.md) made this ticket's last bullet load-bearing rather than
illustrative. The "trivial third host that records operations to an array" is now the
**Recording Host** (`CONTEXT.md`), and it is where the client runtime is executed and where
Resumption is asserted — so the seam is not merely proven real, it is depended on.

Two consequences for the interface's shape:

1. **Node creation and property writes must be separately observable.** Ticket 22 §7's
   assertion is "zero node-creation operations after resumption, and *exactly* the property
   writes the interaction should cause". An interface that folds both into one `patch`-shaped
   operation makes the assertion unwritable.
2. **The string host answers the ticket's own third bullet in the affirmative.** Ticket 22
   treats DOM, server-string and Recording as three implementations of one interface. If the
   string renderer turns out to need a separate path, ticket 22's client layering loses its
   basis and this ticket must say so.
