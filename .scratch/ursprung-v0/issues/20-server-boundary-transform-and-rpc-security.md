# 20 — The server-boundary transform and the RPC security model

Type: grilling
Status: open
Blocked by: 01, 12, 25
Map: [ursprung v0](../map.md)

## Question

A client component imports a function from a `.server.ts` and calls it like any other
function. The bundler replaces it in the client output with a stub, keeps the real
function in the server output, and exposes it over capnweb. Ticket 01 supplies capnweb's
capability model; ticket 12 supplies the boundary edges in the graph. This ticket
designs the transform.

Decide:

- **What exactly is transformable?** Only exported functions, or any export? What about
  an exported object with methods, a class, a re-export, a default export, or a function
  returned by another function? Constrain this hard — "agents as first-class users"
  means a rule an agent can check by looking at one file beats a rule requiring analysis.
- **The generated stub.** What does the client-side replacement look like, and how does
  it identify its target — a stable name, a hash, an index? The identifier appears on the
  wire, so it is part of the public attack surface; consider whether it should be
  unguessable and whether it must be stable across deploys.
- **Signatures and serialisation.** Arguments and return values cross the wire under
  capnweb's rules. What types are allowed? Is the constraint checked at build time from
  the type annotations — which constraint 8's no-type-model parser makes hard — or only
  at runtime? Be honest about which, because "it looks like a normal import" invites
  authors to pass things that cannot cross.
- **The security model, which is the important half.** If every exported function of
  every reachable `.server.ts` is callable by anyone who can open the page, then every
  such export is a public HTTP endpoint. Decide: is that the model, with authorisation
  the author's responsibility on every function — or is there an explicit opt-in marker?
  Whatever we pick, the spec must state it in one unmissable sentence, because the
  failure mode is a silently public endpoint.
- **Authentication context.** What does a server function receive besides its arguments —
  the request, headers, cookies, bindings? How, given the signature is the author's?
  An ambient accessor is magic (which the vision disfavours); an extra parameter changes
  the call site on the client. Decide.
- **Errors.** What does a thrown server error look like on the client, and how do we
  avoid leaking stack traces or internal messages to the browser?
- **Where the endpoint lives.** One RPC route for the whole app, or per route? How does
  it coexist with the API routes from ticket 08, and who generates it?
- **Server-only imports that are not functions** — a `.server.ts` exporting a constant,
  imported by a client component. Error, or inlined value? Inlining is a data-leak vector.
- **What the client output must not contain.** The stub must carry no trace of the server
  function's body, its imports, or its closed-over values. Name the check that proves it
  (see ticket 12's enforcement question).

## Established by ticket 07 — read before starting

**This ticket's central question has a proposed answer already, and it did not come from
here.** Ticket 07 decided that an API route's HTTP methods are declared in the route file,
mapped to arbitrarily-named exports. The consequence is bigger than the ergonomics that
motivated it: **the route file names every callable export in one place, which is an
allowlist** — precisely the thing ticket 01 found capnweb does not have.

So the "explicit opt-in marker versus every export is public" question below may already
be settled in favour of an allowlist, with the route file as its home rather than a
per-function marker. Decide whether the same mechanism covers RPC exports reached from a
Client component, which the route file does **not** currently name — a `.server.ts`
imported by a `.client.tsx` appears nowhere in the route file. That gap is the live part
of this question.

One more thing changed under it. The pending constraint 10 amendment splits the server
into a root entrypoint plus one module per Route, so **"where the endpoint lives" is no
longer a free choice**: an RPC call arrives at the root, which is the only thing always
loaded, and must dispatch to a server function that may live in any Route's module. Either
the root carries a static dispatch table naming every RPC-exposed export — which is the
allowlist again, in a second place — or it lazily imports the module owning the target.
Both are answerable; neither was in scope when this ticket was written.

## Established by ticket 01 — read before starting

[capnweb research](../research/01-capnweb.md) answers this ticket's security question in
the harshest available way: **capabilities are reachable by construction, with no
allowlist.** Every prototype method and getter on the root `RpcTarget` is callable by
anyone who can reach the endpoint; only `#private` fields and own instance properties are
hidden, and TypeScript's `private` hides nothing at runtime. The root object this
transform generates _is_ the security perimeter — there is no second line of defence.

Also settled, and constraining:

- **No runtime argument validation is available.** `capnweb-validate` needs a decorator
  (non-erasable), the TypeScript checker (no type model), and a second dependency — three
  locked constraints rule it out. If v0 validates RPC arguments at all, we write it.
- **Serialisation is narrower than advertised**: `Map`, `Set`, `RegExp`, `URL`,
  `ArrayBuffer`, every typed array except `Uint8Array`, null-prototype objects, class
  instances and cycles all throw at the sender in 0.10.0. With no type model these are
  runtime failures we cannot catch at build time — which sharpens this ticket's question
  about whether the signature constraint is checkable.
- **HTTP batch is one-shot and one-directional**; bidirectional needs WebSocket.
- Pin capnweb to an **exact version** — 0.x, wire format already broken once in 0.9.0,
  undocumented outside its README, Cloudflare's own word is "highly experimental".

## Input from ticket 12 — decided, not open

- **The boundary edges arrive materialised.** The graph carries a boundary-edge list and
  per-node export records; this ticket reads them rather than re-walking. That is
  deliberate — the RPC surface should not be derived by a second walker that can disagree
  with the first.
- **The client traversal cuts at a boundary edge**, so the stub is the only thing standing
  where the import was. The server traversal walks straight through, which is why a
  `.server.ts` reached *only* through a boundary still lands in the server output.
- **`.shared.` can never be an importer here.** `shared → server` is a hard error, so the
  boundary is exactly `client → server` and nothing else.
- **Zero-binding boundaries do not exist.** An all-`type` import clause is elided before
  colouring, so this ticket never sees an edge with no callable names — the case that would
  otherwise have arrived from `import { type BuildRow } from "./api.server.ts"`.
- **The allowlist gap ticket 12 could not close**, restated because it is this ticket's:
  the Route file names every callable export for API routes, but a `.server.ts` reached
  from a `.client.tsx` appears nowhere in it.

See [ticket 12](./12-module-graph-and-two-colour-derivation.md), decisions 2, 3, 4 and 9.
