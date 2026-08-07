# 09 — The component and rendering model

Type: grilling
Status: open
Blocked by: 07, 25
Map: [ursprung v0](../map.md)

## Question

With no virtual DOM and no diffing, "what a component is" is a genuinely open question —
we cannot borrow React's answer, and the vision explicitly refuses to. This ticket
settles the semantics that tickets 15, 17, 18 and 19 all build on.

Decide:

- **What is a component?** A function from props to… what? And what does JSX _evaluate_
  to — a description the renderer walks, or something that constructs output directly?
  With no VDOM there is no reconciliation pass, so the tree may only ever be built once.
  Say plainly what exists at runtime after a component has run.
- **How often does a component function run?** In a fine-grained system the answer
  should be "once" — updates flow through signals to specific DOM positions, not through
  re-invocation. Confirm that, and name every case where it is not true.
- **Server vs client components — what actually differs?** Both can run on the server
  (a client component renders during SSR). So the distinction is not "where it runs" but
  something narrower. Define it precisely: what may a `.server.tsx` do that a
  `.client.tsx` may not, and vice versa? What happens at the boundary when a server
  component renders a client component?
- **Props across the boundary.** A server component passing props to a client component
  is a serialisation event — those props must survive to the client for resumption.
  What types are allowed? What happens to a function prop, or a prop closing over
  server-only state? Is this checked, and if so when — build time or runtime?
- **Children across the boundary.** Can a server component pass rendered children into a
  client component, and what does that mean when the client resumes?
- **Async components.** Constraint 12 allows an async component to block the stream at
  its position. Which components may be async — server only, or client too? What does an
  async client component mean during SSR versus on the client?
- **Component-local state and lifecycle.** Where does state live if a component runs
  once? Is there a cleanup/disposal concept, and who owns it?
- **Conditional and list rendering.** The hardest part of a no-VDOM system: what happens
  when a signal flips a conditional branch, or reorders a list? Something has to
  create and destroy DOM. Name that mechanism now — it is the thing most likely to be
  missing when the design meets reality.

`/domain-modeling` applies heavily here: several of these terms go straight into
`CONTEXT.md`.
