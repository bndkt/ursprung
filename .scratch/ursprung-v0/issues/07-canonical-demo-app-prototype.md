# 07 — The canonical demo app, written as if Ursprung v0 already existed

Type: prototype
Status: open
Blocked by: —
Map: [Ursprung v0](../map.md)

## Question

The destination names one falsifiable proof of v0: a demo app exercising every
architectural claim. This ticket writes that app's **source code** — as an aspirational
sketch, against a framework that does not exist yet — so there is something concrete to
react to before any API is designed.

This is the highest-leverage ticket on the map. Written first, it pins the authoring
surface, the component model, the suffix discipline and the RPC ergonomics all at once,
and every downstream grilling ticket argues with a real artifact instead of a blank page.
Written last, it would merely transcribe decisions already made.

**Build:** a throwaway directory of TypeScript files — the app a developer or agent would
write — plus a short README stating the questions it is trying to settle. No
implementation, no framework code, nothing that runs. Rough is the point.

It must contain, because the destination says so:

- the Ursprung config file, the single entry point the bundler starts from
- a route file declaring a **root route with nested children**
- an **API route** with handlers for two different HTTP methods
- a **server component** (`.server.tsx`) that reads something server-only
- a **client component** (`.client.tsx`) with a signal-driven interaction
- a **shared module** (`.shared.ts`), to show what that suffix is actually for
- a client component **importing a function from a `.server.ts`** and calling it — the
  RPC transform, written as if it were an ordinary import
- something that forces the streaming question: an async server component whose data
  arrives late

Write it in at least **two variants** wherever the shape is genuinely contested — most
importantly the route declaration itself (a nested object literal? builder calls? an
array of route records?) — so the choice can be made by looking at both rather than
described in the abstract. Constraint: agents are the first-class users, so favour
explicit and verbose over clever, and prefer shapes that are trivial to generate and to
diff.

Note every place where writing it felt wrong, ambiguous, or forced a decision you had no
basis for. Those notes are the real output — they become the agenda for tickets 08 and 09.

Live at `.scratch/ursprung-v0/prototypes/07-demo-app/`, clearly marked throwaway.

## Answer should record

Which variant won and why; the list of surfaced ambiguities and which ticket each one
belongs to.
