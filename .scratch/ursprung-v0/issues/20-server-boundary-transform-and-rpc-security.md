# 20 — The server-boundary transform and the RPC security model

Type: grilling
Status: open
Blocked by: 01, 12, 25
Map: [Ursprung v0](../map.md)

## Question

A client component imports a function from a `.server.ts` and calls it like any other
function. The bundler replaces it in the client bundle with a stub, keeps the real
function in the server bundle, and exposes it over capnweb. Ticket 01 supplies capnweb's
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
- **What the client bundle must not contain.** The stub must carry no trace of the server
  function's body, its imports, or its closed-over values. Name the check that proves it
  (see ticket 12's enforcement question).

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
