# 08 — The route and configuration authoring API

Type: grilling
Status: open
Blocked by: 07
Map: [Ursprung v0](../map.md)

## Question

An Ursprung application is defined by a single entry point — the config file — from
which the bundler discovers the route configuration and traverses everything else.
This ticket settles what those two files actually look like. React to the variants
prototyped in ticket 07 rather than starting from scratch.

Decide:

- **The config file.** Its name, what it default-exports, and whether it is a plain
  object or a `defineConfig`-style call. What belongs in it beyond the route file
  pointer — output directory, target, base path? What deliberately does not?
- **The route declaration.** Nested object literal, builder calls, or an array of route
  records? Constraint: agents generate and diff these, so favour a shape that is
  mechanically producible and where a change touches one place.
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

Each route becomes a client bundle entry point, so this decision directly shapes ticket
12's graph model and ticket 14's emission.
