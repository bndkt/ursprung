# What writing it surfaced

**This file is the ticket's real output.** The app is scaffolding; these are the
places where writing it felt wrong, forced a decision there was no basis for, or
quietly assumed something nobody has decided. Each is tagged with the ticket it
belongs to.

Numbers match the `NOTES.md #n` markers in the source.

---

## Decided by writing it

### 9. The route file has to be a literal, which rules variant C out

→ **ticket 08**

The bundler discovers the route tree by reading the route file. It cannot
_evaluate_ the route file: evaluating it means building it first, and building is
the thing that needs the route tree. Constraint 8 leaves no scope model to
constant-fold with either.

So the route tree has to be readable as **data** from the AST. Variants A and B
are single literals and qualify. Variant C is a chain of function calls and does
not — not on ergonomic grounds but on a hard build constraint. **C is dead unless
someone can show the bundler a way to evaluate it.**

That leaves A versus B as a genuine choice, and it is the one decision this
prototype exists to tee up:

|                             | A — nested literal             | B — record array               |
| --------------------------- | ------------------------------ | ------------------------------ |
| Structure                   | visual, cannot dangle          | referential, can dangle/cycle  |
| Adding a leaf               | positional edit at depth       | append one line                |
| Two agents editing at once  | same block, conflicts          | different lines, no conflict   |
| Reading a deep tree         | good                           | poor                           |
| Extra concepts              | none                           | ids, a second namespace        |

A fourth shape came out of that comparison — **D**, flat with full paths and no
ids, in `variants/d-flat-lazy/` — which keeps B's append-only diffability and
drops the id namespace by inferring nesting from path prefixes.

**Decided: A.** Prefix inference cannot express a **pathless layout** — a node
that wraps children but adds no URL segment — and it cannot express a layout
wrapping a path it does not prefix. Both are real needs, and in a nested literal
a pathless layout falls out for free as a node with `children` and no `path`.
That outweighed the diffability argument. The winning file is `routes.ts` at the
prototype root; `variants/` keeps the three rejected shapes for the record.

**Separately decided: lazy module references.** Orthogonal to the tree shape and
arguably the bigger change — see #10 and #19 below.

### 8. API routes have no suffix of their own

→ **ticket 08**

Constraint 9 admits exactly `.server.`, `.client.`, `.shared.` — so an API route
is spelled `.server.ts` like any other Server module, and **nothing in the
filename says it is a route.** What makes it one is being referenced as one from
the route file. That is defensible, but it means the suffix system encodes _side_
and the route file encodes _role_, and a reader has to hold both.

Second, contested within that: **named exports per method** versus **a
default-exported object** versus — the shape that won — **methods declared in
the route file**, mapped to arbitrarily-named exports.

**Decided: methods in the route file.** No uppercase-export convention has to
exist, and `builds.server.ts` exports `readBuild`/`createBuild`/`removeBuild`,
named for what they do. The decisive upside is not ergonomic: it makes the route
file the application's **entire declared HTTP surface**, and naming the callable
exports in one place *is* an allowlist — the thing capnweb does not provide
(ticket 01) and ticket 20 has to invent. See #1.

The cost is real and was accepted: reading `builds.server.ts` no longer tells you
`removeBuild` is HTTP-reachable, and adding an endpoint is a two-file edit.

---

## The server boundary

### 1. Nothing marks which server exports are callable from the client

→ **ticket 20**

`trigger.server.ts` exports `startBuild` (imported by a Client module — genuinely
RPC) and `deleteBuild` (imported only by the API route — a plain server call).
**The source does not distinguish them**, and under ticket 01's finding —
capabilities are reachable by construction, no allowlist — that is a security
question, not a style one. Writing an app made it concrete: nobody writing this
file would notice they had published `deleteBuild`.

### 17. RPC arguments and returns have no build-time check

→ **ticket 20**

`startBuild` returns a `Build` — plain object, fine. Had it returned a `Date` or
a `Map`, capnweb 0.10.0 throws `TypeError` **at runtime, at the sender** (ticket
01), and with no type model the build cannot catch it. The call site looks like
an ordinary function call and gives no hint that its signature is constrained.

### 15. Props crossing into a Client component must be serialisable

→ **tickets 19, 09**

`<WatchToggle initialRef="main" />` is written by a Server component. That prop
has to survive into the Resumability payload for the browser to have it. Same
class of problem as #17 and equally unmarked — a prop that happened to be a
function or a class instance would fail late.

---

## Resumption and reactivity

### 2. A Client component's body runs on the server and never in the browser

→ **tickets 19, 17, 09**

`WatchToggle` creates its signals in its body. That body executes during Server
rendering. Under Resumption it **does not execute again**, so the browser must
end up holding those same signals, with their identities intact, reconstructed
from the payload. Ticket 02's indirection cell is presumably the mechanism.

Writing it exposed that "component body" and "where state is created" are the
same place in the source and must be different places at runtime — the sharpest
thing this prototype turned up, and it lands on the two hardest tickets.

### 3. The event handler is a closure, and closures do not serialise

→ **ticket 19**

`onToggle` closes over `watching`, `latest` and `props`. Resumption needs a
stable reference to the function _and_ to everything it captured. Ticket 03's
finding — Qwik does state as a whole-document post-pass — reads as a direct
consequence of exactly this.

### 14. A signal used directly as a JSX child

→ **tickets 09, 15**

`{label}` and `{computed(() => ...)}` are written as children. If that is how
fine-grained binding is expressed, then the JSX runtime must treat a signal child
as a live binding rather than something to stringify once — a real contract, and
currently an assumption I made without basis.

### 13. No keys on the list, and no story for list updates

→ **tickets 09, 17**

`builds.map(...)` has no `key`, correctly — there is no VDOM and no
reconciliation. But nothing in the model says what happens when a list changes
after Resumption. Fine-grained updates need _some_ identity for list items;
"no keys" is the right default and an unfinished thought.

---

## Rendering and routing

### 5. How a parent route renders its matched child

→ **tickets 09, 08**

`props.children` (written) versus an imported `<Outlet />` (sketched in the same
file). `children` keeps the component honest — everything it renders is an input
— and avoids ambient per-request state, which is awkward both under Resumption
and on Workers where module scope is per-isolate. `<Outlet />` reads better in a
deep tree. Written as `children` on those grounds; not decided.

### 6. Route params: typed how?

→ **ticket 08**

`RouteProps<{ id: string }>` restates by hand what `path: ":id"` already says.
Inferring it would mean template-literal inference over a string literal sitting
in a data structure the _bundler_ reads — the type system would have to be told
separately. The honest alternative is `Record<string, string>` and a cast in
every route component, which is worse for agents. No good option surfaced.

### 18. Streaming order and the Client component

→ **tickets 18, 19**

`BuildsIndex` awaits, then renders `WatchToggle`. So the Client component's
markup sits inside the blocked region, and its Resumability payload is emitted
somewhere after a stall of unbounded length. Where the payload goes relative to
the markup it resumes is not something in-order streaming answers by itself.

### 4. Where bindings come from inside a Server module

→ **ticket 08** (or a fresh ticket — it fits none cleanly)

Three files needed `env` and all three faked it with `declare const env`. On
Workers, bindings arrive **per-request on the `fetch` handler** — they are not
module scope, and module scope is per-isolate. So either the framework threads
env through every component and server function as a parameter, or it provides
ambient per-request access via `AsyncLocalStorage`-shaped machinery, which is a
runtime capability and a dependency question under constraint 6.

**This one has no home ticket, and it blocks writing any real server code.**

### 7. A 404 raised after the response has started

→ **fog: error handling** — sharp enough to ticket now

`BuildDetail` cannot set a status code: its parent's markup has already flushed.
In-order streaming (constraint 12) makes this structural, not incidental. The
map's fog lists "Error handling" as too fuzzy to ticket; this instance is sharp.

---

## Build and packaging

### 10. Does the config reach the routes by path or by import? — mostly dissolved

→ **tickets 08, 12**

Originally: a path string means the bundler _reads_ the route file and the graph
has two roots; an import means one root, but then the Config file, a Server
module, transitively imports every Client component in the app, and colouring has
to understand that `component` is a **reference, not an inclusion**, or the
Server bundle swallows everything.

**The lazy-reference decision removes that force.** With `component: () =>
import(...)` the route file has no eager edge to any component, so importing it
from the Config file costs nothing. Either form now works; ticket 08 picks on
taste. Written as a path string because the bundler reads the tree from the AST
rather than evaluating it, and a string says so honestly.

### 19. Lazy thunks describe a laziness the output does not have

→ **tickets 08, 14**

New, and a direct consequence of the decision. Constraint 10 forbids a runtime
loader, so `() => import("./src/root.server.tsx")` is **never called as
written** — the bundler rewrites each thunk at emit into a direct reference
inside the bundle. The source is honest about build-time intent and misleading
about runtime behaviour, and ticket 14 owns the rewrite.

Two sharp sub-questions for ticket 08:

- `.then((m) => m.readBuild)` is an AST shape the bundler must **pattern-match**
  to learn the export name. Typed and navigable, but fragile — a developer who
  writes it any other way gets a build error for no visible reason. A
  `{ module, export }` pair would be robust and untyped.
- Route **specificity**: `/builds/new` versus `/builds/:id` needs a rule. Source
  order looks meaningful in a nested literal and must not be.

### 12. Are the config file and the route file exempt from constraint 9?

→ **ticket 08**

Constraint 9: an unsuffixed `.ts`/`.tsx` reached by the graph is a build error.
`ursprung.config.ts` is unsuffixed, and the winning route file is written as
`routes.ts`, also unsuffixed. Is the Config file the root of the graph rather
than "reached by" it, and therefore exempt? Is the route file server-side code,
or build-time data that is neither?

**Narrowed by the lazy-reference decision, not answered.** The route file no
longer imports any component, so the case for it being a Server module is much
weaker — but the thunks are still code, so constraint 9 arguably still bites.
The bundler never executes them. **A one-line rule settles it; ticket 08 owes
that line.**

### 16. Namespace import of the API route

→ **ticket 14**

`import * as BuildsApi` is the only namespace import in the app, and flat ESM
concatenation with no scope model has to turn it into something. Worth knowing it
exists before ticket 14 assumes only named imports.

### 11. Three config files, and a compatibility date in two of them

→ **tickets 08, 21**

The app root ends up with `ursprung.config.ts`, `cloudflare.config.ts` and
`wrangler.config.ts`. Worse: constraint 15 pins the permitted `node:*` set as a
function of the compatibility date, so **Ursprung needs a value that lives in
Wrangler's file.** Either it reads Wrangler's experimental config (coupling to an
unstable format) or it asks for the date twice and the two drift silently.
