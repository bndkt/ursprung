# 07 — The canonical demo app, written as if ursprung v0 already existed

Type: prototype
Status: resolved
Blocked by: —
Map: [ursprung v0](../map.md)

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

- the ursprung config file, the single entry point the bundler starts from
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

## Answer

> ⚠️ **Amended by [ticket 08](./08-route-and-config-authoring-api.md) on 2026-08-07.**
> The premise below — "the bundler reads the route file and cannot evaluate it, since
> evaluating means building first" — **does not hold**, and the argument must not be
> reused. It conflates two graphs: building the *config* graph needs resolution and type
> stripping, neither of which needs the route tree, which is required only to emit *route*
> bundles. Two phases, no cycle. The config is now evaluated by the host before the build.
>
> What changes: **variant C's rejection is void as reasoned** — builder calls are
> evaluable — though the conclusion survives, because the nested literal also won on
> readability and on pathless layouts falling out for free. The route tree no longer has
> to be a literal at all. **Lazy thunks are gone**, superseded by `new URL(specifier,
> import.meta.url)`, because a thunk is opaque to an evaluator and must never be called.
>
> What stands, untouched: **API methods declared in the route file**, and the property
> that makes it load-bearing for ticket 20 — the route file is the application's entire
> declared HTTP surface, and naming the callable exports in one place **is** the allowlist
> capnweb does not provide.

Prototype: [`prototypes/07-demo-app/`](../prototypes/07-demo-app/). The surfaced
ambiguities are [`NOTES.md`](../prototypes/07-demo-app/NOTES.md) — nineteen, each tagged
with its destination ticket. That file, not the app, is this ticket's output.

### The route file: variant A, carrying lazy references

Four shapes were written. **Variant C (builder calls) was ruled out by the prototype
itself, not by taste**: the bundler discovers the route tree by _reading_ the route file
and cannot _evaluate_ it — evaluating means building first, and building is what needs
the tree — while constraint 8 leaves no scope model to constant-fold with. The route tree
must be readable as data from the AST, so a chain of function calls is not viable.

Comparing A (nested literal) against B (flat records with ids) produced a fourth shape,
**D** — flat, full paths, nesting inferred from path prefixes, no id namespace — which
keeps B's append-only diffability and drops its dangling-`parent` risk.

**A won.** Prefix inference cannot express a **pathless layout** — a node that wraps
children but adds no URL segment — nor a layout wrapping a path it does not prefix. Both
are real needs; in a nested literal a pathless layout is just a node with `children` and
no `path`. That outweighed the diffability argument that favoured B and D.

### Lazy module references, decided separately

Orthogonal to the tree shape, and the more consequential of the two. Components and API
handlers are referenced as `() => import("./src/root.server.tsx")` rather than imported
at the top of the route file.

The force: with eager imports, a Route bundle carrying the route table drags **every**
route's component into **every** Route bundle. Constraint 10 accepts duplication across
bundles; it does not accept every bundle being the whole application. The specifier stays
a string literal in the AST, so nothing is evaluated and constraint 8 holds.

It **dissolves most of NOTES #10** — the Config file and route file no longer transitively
import every Client module, so colouring is no longer stressed by the route file at all.

> **Superseded later the same day.** This answer originally said the thunks are "never
> called as written" because constraint 10 forbids a runtime loader, and that ticket 14
> would rewrite each into a direct reference at emit. **That is no longer true.** The
> maintainer has since proposed emitting a module graph on both sides, linked by workerd's
> registry and the browser's module map, so the thunks stay **real dynamic imports** and
> the laziness is genuine at runtime. See the map's Pending amendments. If ticket 27 comes
> back negative on workerd dynamic import, the original claim returns for the server only.

### API routes: methods declared in the route file

Not one of the two options offered — the maintainer proposed a third and it is better.
Methods map to arbitrarily-named exports (`readBuild`, `createBuild`, `removeBuild`), so
no uppercase-export convention exists.

The decisive upside is not ergonomic. It makes the route file the application's **entire
declared HTTP surface**, and naming the callable exports in one place _is_ an allowlist —
precisely what capnweb does not provide (ticket 01, capabilities reachable by
construction) and what **ticket 20 was going to have to invent**. Accepted cost: reading
`builds.server.ts` no longer tells you `removeBuild` is HTTP-reachable, and adding an
endpoint is a two-file edit.

### Where the ambiguities landed

- **Ticket 08** — #8 (API routes have no suffix of their own), #12 (are the Config and
  route files exempt from constraint 9? narrowed, not answered), #19 (the
  `.then((m) => m.export)` pattern-match, and route specificity), #10 (now taste).
- **Ticket 09** — #5 (`props.children` vs `<Outlet />`), #6 (route param typing),
  #13 (no keys, and no story for list updates), #14 (a signal as a JSX child).
- **Tickets 19 / 17** — #2 (a Client component's body runs on the server and never in
  the browser — the sharpest thing the prototype found), #3 (handlers are closures and
  closures do not serialise), #15 (props crossing into a Client component must be
  serialisable), #18 (payload placement relative to a stalled stream).
- **Ticket 20** — #1 (nothing marks which server exports are callable; partly answered by
  the route-file allowlist above), #17 (RPC arguments have no build-time check).
- **Ticket 14** — #16 (namespace import), #19 (the emit-time thunk rewrite).
- **Ticket 21** — #11 (three config files, and a compatibility date in two of them).

### Two tickets graduated

- **[25 — How bindings reach server code](./25-bindings-and-per-request-context.md)**,
  from #4. Three files needed `env` and all three faked it with `declare const env`.
  Bindings arrive per-request on the `fetch` handler and are never module scope, so this
  blocks writing any real server code — and it fitted no existing ticket. Blocks 09
  and 20.
- **[26 — Errors and status codes after the stream has started](./26-errors-after-stream-start.md)**,
  from #7, graduated out of the map's "Error handling" fog. `BuildDetail` cannot set a
  404: its parent's markup has already flushed. In-order streaming (constraint 12) makes
  this structural. Error _boundaries_ stay in the fog; this instance was sharp.
