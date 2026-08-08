# The module graph and the side matrix

There is one graph, built from the Config file, and one node in it per **realpathed**
module path. A node carries two independent facts, and keeping them apart is the whole
design:

- its **Side** — declared in the filename for a first-party module (ADR-0001), absent for
  a third-party one;
- its **reach**, a derived set ⊆ `{server, client}` saying which outputs the traversal
  actually put it in.

The 3×3 matrix below is a rule about Side. The invariant that matters most in the
framework — server code never reaches the client output — is a claim about reach. They are
not the same field, and answering "is colour a set or a value" with either alone produces
a model that has to special-case something.

| importer ↓ / imported → | `.server.`                                                                            | `.client.`                                                      | `.shared.`   |
| ----------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------ |
| **`.server.`**          | plain import                                                                          | plain import — Client components render during Server rendering | plain import |
| **`.client.`**          | **Server boundary** — an RPC stub in the client output, the real import on the server | plain import                                                    | plain import |
| **`.shared.`**          | **hard error**                                                                        | plain import                                                    | plain import |

The matrix does not apply to third-party modules, which declare nothing. A side suffix on a
file under `node_modules` is not a claim in ursprung's vocabulary.

An **edge carries a specifier, not a target**. Export conditions are a set and the two
sides resolve under different ones, so one specifier in one `.shared.ts` legitimately names
two different files. Traversal runs once per side; nodes are interned by real path across
both runs.

## Considered options

**One node per `(path, side)` pair** — two disjoint graphs over a shared parse cache, with
emission mapping 1:1 onto nodes. Rejected because every question about "this module"
becomes a question about two objects, and the invariant degrades from a property of one
structure into a claim about the relationship between two.

**One node per path with a single tri-state colour** (`server` / `client` / `both`),
collapsing the declaration into the colour at seeding. Rejected because it destroys the
distinction between _declared shared_ and _reached from both_, and the matrix needs the
first while enforcement needs the second.

**`shared → server` as a boundary**, symmetric with `client → server`. Rejected: the same
source line would be a direct call on the server and a network round-trip on the client
with nothing syntactic to tell them apart. A module that means two different things
depending on who imported it is the one thing a shared module must not be.

**`shared → server` legal, erroring only when client-reached.** Never rejects a safe
program, but the diagnostic points at an importer several hops away and must print the
whole chain to be intelligible. The chosen rule is checkable from a single file with no
colouring at all, which is the test that matters for agent authors.

**Erroring on `shared → client` as well**, restricting shared modules to shared and
third-party imports. Rejected for costing a real case — a shared module composing or
re-exporting a Client component — to prevent nothing: Client modules run on both sides.

**Resolving once under a merged condition set**, so an edge could carry a target and the
graph would be one structure rather than two traversals. Rejected on correctness: whichever
condition wins, one side receives a module built for the other, which is precisely what the
`browser` and `workerd` conditions exist to prevent. Erroring on divergence instead was
also rejected — it outlaws the commonest reason a package ships a `browser` condition, so a
large slice of npm would become unusable from a shared module.

## Consequences

**A module is emitted once per side it reaches, not once.** The server output goes to
workerd and the client output to the assets directory, so a dual-reached module is emitted
twice however the graph is shaped. A `.client.tsx` importing a `.server.ts` also _prints_
differently per side. The emission unit is therefore a derived `(node, reachedSide)` pair,
and holding it apart from node identity is what keeps that difference out of every query.

**Being a Common module is automatic, not a decision.** Emitting real ESM means a module
reached by several entrypoints is emitted once and imported by all of them by construction.
There is no extraction rule to write, and per-entrypoint reach survives only as the input
to preload hints.

**Every Client module is server-reached.** Client roots are exactly the modules at a
`→ client` crossing, so the server traversal has already walked them. Reach is not
evaluation: it means the module is present in the server output for rendering.

**A module that imports server code is not shared.** That sentence is the whole of the
`shared → server` rule, and it is the remedy the diagnostic carries: rename it `.server.ts`,
or move the import into a `.client.tsx` where the boundary becomes explicit.

**An import whose every named specifier is `type`-marked is elided.** No edge, not printed,
decided at parse time before colouring. The keyword is syntax, so no type model is involved
and ADR-0001's declaration rules are untouched; the `import { Foo }` case, where `Foo`
merely happens to be a type, stays impossible. This diverges from `verbatimModuleSyntax`,
which keeps `import {} from "x"` so side effects survive — under ursprung a module reachable
only through an all-`type` clause stops being evaluated, and a clause-less `import "x"` is
the fix.

**Circular imports are legal.** The ban could not survive its own justification: flat
concatenation cannot express a cycle, and ursprung no longer concatenates. Both hosts own
cycle semantics natively. With cycles legal there is no topological order — and real ESM
needs none, because the host owns evaluation order, so emission ordering reduces to being
deterministic.

**First-party means no `node_modules` segment in the real path.** Exact under ADR-0006's
realpathing: an isolated layout keeps a published package under `node_modules`, while a
workspace member resolves out to its source. A workspace member is our source, so it
declares its side — at the cost that a workspace package which is also published carries
ursprung's suffixes in filenames its other consumers see. The alternative loses the
invariant exactly where it is easiest to lose.

**The invariant is enforced twice, and both throw.** A graph assertion before emission —
no server-declared node has `client` in its reach — and an audit after it, over the
emission records rather than the graph, so a wrong traversal cannot satisfy the check by
being wrong consistently. A violation means ursprung is broken, not that the input is, so
neither produces a diagnostic.
