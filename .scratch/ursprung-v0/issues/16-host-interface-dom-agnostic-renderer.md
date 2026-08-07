# 16 — The host interface: keeping the renderer DOM-agnostic

Type: grilling
Status: open
Blocked by: 15
Map: [Ursprung v0](../map.md)

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
  string hosts against it; or write directly against the DOM and only *keep the seam
  clean*, documenting where a host boundary would go. The second is cheaper and honest;
  the first is the only one that actually proves the abstraction works.
- **The test.** Whatever we choose, name the falsifiable check — e.g. a trivial third
  host implementation that records operations to an array, which would also be useful for
  testing the renderer. If a third host is easy, the seam is real.

`/codebase-design` is relevant: this is a deep-module question about where the seam goes.
