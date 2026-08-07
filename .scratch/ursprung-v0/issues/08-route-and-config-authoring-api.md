# 08 — The route and configuration authoring API

Type: grilling
Status: open
Blocked by: 07 (resolved — read the input block below before the questions)
Map: [ursprung v0](../map.md)

## Question

An ursprung application is defined by a single entry point — the config file — from
which the bundler discovers the route configuration and traverses everything else.
This ticket settles what those two files actually look like. React to the variants
prototyped in ticket 07 rather than starting from scratch.

Decide:

- **The config file.** Its name, what it default-exports, and whether it is a plain
  object or a `defineConfig`-style call. What belongs in it beyond the route file
  pointer — output directory, target, base path? What deliberately does not?
- ~~**The route declaration.** Nested object literal, builder calls, or an array of route
  records?~~ **Settled by ticket 07 — do not reopen.** See the input block below.
- **Route identity.** How a route's path is expressed, how nesting composes paths, and
  how a root route differs from its children.
- **Path parameters.** Syntax, how they reach a component or handler, and whether they
  are typed — and if typed, whether that costs us anything given constraint 8's no-type-
  model parser. Wildcards and optional segments: in or out for v0?
- **Page routes vs API routes.** Are they two variants of one declaration or two
  different constructs? An API route declares handlers per HTTP method — what is the
  handler signature, and what does it receive and return?
- **Layouts.** Does a nested route's parent contribute wrapping UI? If so, is that the
  same thing as the parent's component, or a separate slot? This is the decision most
  likely to be regretted later.
- **Data loading.** Does v0 have a loader concept at all, or do server components fetch
  inline? Server components can be async (constraint 12), which may make loaders
  redundant — argue it out rather than assuming.
- **What the bundler needs statically.** Whatever shape wins must let the bundler
  determine the complete route set **without executing arbitrary application code**, or
  by executing it in a way that is safe inside a Worker. Any dynamic route construction
  the shape permits is a problem — decide explicitly what is forbidden.

Each route becomes a client entry point, so this decision directly shapes ticket 12's
graph model and ticket 14's emission.

## Established by ticket 07 — treat as input, not open

The [demo app prototype](../prototypes/07-demo-app/) settled three of this ticket's
questions and sharpened the rest. The winning shape is
[`routes.ts`](../prototypes/07-demo-app/routes.ts); the rejected alternatives are under
`variants/`, each with an account of what it cost.

- **The route declaration is a nested object literal.** Builder calls are **not
  viable** — the bundler reads the route tree as data from the AST and cannot evaluate
  it, since evaluating means building first. Flat shapes lost because prefix inference
  cannot express a pathless layout. This answers the "what the bundler needs statically"
  question below too: the route file must be a literal, and any dynamic construction is
  forbidden by that alone.
- **Components and handlers are referenced lazily**, as `() => import("./x.server.tsx")`,
  not imported at the top of the route file. The specifier stays a string literal in the
  AST, so nothing is evaluated. This is also what stops a Route entry dragging in every
  other route's code.
- **API route methods are declared in the route file**, mapped to arbitrarily-named
  exports — so there is no uppercase-export convention, and the route file is the
  application's entire declared HTTP surface. That property is load-bearing for ticket
  20: naming the callable exports in one place **is** the allowlist capnweb does not
  provide.

Still open, and now sharper — these are the real agenda:

- **The `.then((m) => m.export)` pattern-match.** The bundler must recognise that exact
  AST shape to learn the export name. Typed and navigable, but fragile: a developer who
  writes it any other way gets a build error for no visible reason. A `{ module, export }`
  pair would be robust and untyped. Decide deliberately (NOTES #19).
- **Route specificity.** `/builds/new` versus `/builds/:id` needs a rule. Source order
  looks meaningful in a nested literal and must not be.
- **Are the Config file and the route file exempt from constraint 9?** Both are
  unsuffixed. The lazy-reference decision narrowed this — the route file imports no
  component, so the case for it being a Server module is weak — but the thunks are still
  code. **A one-line rule settles it and this ticket owes that line** (NOTES #12).
- **How the Config file reaches the routes**, by path string or import, is now a matter of
  taste rather than force: lazy references removed the colouring pressure that made the
  import form dangerous (NOTES #10).
- **Route params typing** (NOTES #6) and **`props.children` versus `<Outlet />`**
  (NOTES #5) surfaced here but belong to this ticket and ticket 09 respectively.
