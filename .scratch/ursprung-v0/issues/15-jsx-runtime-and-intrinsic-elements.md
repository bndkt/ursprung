# 15 — The JSX runtime contract and the intrinsic element set

Type: grilling
Status: open
Blocked by: 09
Map: [Ursprung v0](../map.md)

## Question

Ursprung provides its own JSX runtime and an explicit list of intrinsic elements, and
deliberately does not inherit React's semantics. Ticket 09 settles what a component *is*;
this ticket settles the syntax-to-runtime contract and the typing surface.

Decide:

- **The runtime functions.** The automatic runtime convention is `jsx`, `jsxs`,
  `jsxDEV` and `Fragment` from a `/jsx-runtime` subpath. Do we follow it exactly, or
  define our own — and if our own, what do we lose in TypeScript and editor support?
  Is there a `jsxDEV` at all, given there is no dev mode (constraint 11)?
- **What does `jsx()` return?** Follows from ticket 09, but pin the concrete signature
  here: arguments, the shape of the props object, where `key` goes, how children arrive
  (single vs array, and why `jsxs` exists).
- **`key`.** With no VDOM and no diffing, does `key` mean anything? If lists are handled
  by whatever mechanism ticket 09 names, `key` may be required, may be meaningless, or
  may belong to that mechanism instead of to JSX. Decide, because it is the single most
  load-bearing piece of React folklore people will assume we have.
- **The intrinsic element list.** Which elements are in it, and — the real question —
  **how is it produced and maintained?** Hand-written, generated from a spec or from
  existing type packages, or generated at build time? It must also carry each element's
  attribute types, which is the bulk of the work.
- **Attributes.** Do we follow the DOM property names, the HTML attribute names, or the
  React-style hybrid (`className`, `htmlFor`)? "No legacy" argues for the platform's own
  names — say so explicitly, because it is a visible break with what everyone expects.
  Then: boolean attributes, `style` as string or object, `data-`/`aria-`, event handler
  naming, and how an attribute bound to a signal differs from a static one.
- **The TypeScript surface.** `jsxImportSource`, the `JSX` namespace members we must
  declare (`Element`, `IntrinsicElements`, `ElementType`, `ElementChildrenAttribute`,
  and which others actually matter), and what a component's props type must look like.
  Follow the current TypeScript JSX contract rather than the historical one.
- **Children typing.** What is a valid child — element, string, number, signal, array,
  `null`, `undefined`, promise? Each accepted type is a rendering rule ticket 18 must
  implement.
- **What we refuse.** Name the React behaviours we are explicitly not implementing —
  portals, context as JSX, `dangerouslySetInnerHTML`, refs — so the spec answers the
  question before it is asked.
