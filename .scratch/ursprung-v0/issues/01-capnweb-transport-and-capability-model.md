# 01 — capnweb: transport, capability model, and what it demands of a bundler

Type: research
Status: resolved
Blocked by: —
Map: [Ursprung v0](../map.md)

## Question

Ursprung uses Cloudflare's **capnweb** for client↔server RPC. Before we can design the
server-boundary transform (ticket 20), we need the facts about what capnweb actually is
and what it requires of the code we generate on both sides.

Establish from primary sources — the capnweb repository, its source, and Cloudflare's
own documentation, not secondary write-ups:

- What is the published package, its current version, its licence, and its dependency
  set? Is it ESM? Does it ship TypeScript source or a build artifact? (Constraint 14
  means a CJS-only dependency is a problem we need to know about now.)
- What is the transport? HTTP, WebSocket, both? Is there a batching or pipelining model,
  and does it require a persistent connection?
- What is the object/capability model? How is a callable exposed on the server, and how
  does a client obtain a reference to it? Is there a notion of a root capability from
  which others are derived, and can capabilities be passed as arguments or returned?
- How are arguments and return values serialised? What types survive the wire — plain
  objects, `Date`, `Map`, typed arrays, streams, functions? What happens to something
  unserialisable?
- What are the exact server-side and client-side setup shapes — the minimum code to
  stand up an endpoint in a Worker and to call it from a browser?
- What is the security posture? Is anything exposed on a capability reachable by
  construction, or is there an explicit allowlist step? What does capnweb assume the
  application does about authentication and authorisation?
- Does it depend on any Node API or anything unavailable in a browser?
- What are its known limitations, and is it stable enough to build a framework's
  entire RPC story on?

Write the findings to `.scratch/ursprung-v0/research/01-capnweb.md`, citing the source
for each claim. Flag anything that conflicts with the locked constraints on the map.

## Answer

Findings: [`research/01-capnweb.md`](../research/01-capnweb.md).

**capnweb 0.10.0**, MIT, **zero runtime dependencies**, `"type": "module"` — confirmed
independently against the npm registry. It ships `dist/` build artifacts only, no
TypeScript source. Both ESM and CJS builds exist but every `import` condition resolves to
ESM, so **constraint 14 is safe**. Its one `node:http` import is type-only and fully
erased from the shipped JavaScript, so **constraint 15 is safe** as far as `node:*` goes.
Each `dist` entry is self-contained with zero internal imports, which suits constraint 10
exactly.

**The security finding is the important one.** Capabilities are reachable **by
construction — there is no allowlist.** Every prototype method and getter on the root
`RpcTarget` is callable by anyone who can reach the endpoint. Only `#private` fields and
own instance properties are hidden, and TypeScript's `private` hides nothing at runtime.
This means the root object that ticket 20's transform generates **is** the security
perimeter, and it settles that ticket's central question in the harshest possible way:
if we expose every export of every reachable `.server.ts`, every one of them is a public
HTTP endpoint. Ticket 20 must decide on an explicit opt-in marker or accept that.

**And there is no runtime validation available to us.** `capnweb-validate` — the only
validation story — is unreachable by construction: it needs a decorator (non-erasable,
constraint 8), the TypeScript checker (no type model, constraint 8), and a second
dependency (constraint 6). Three locked constraints conspire here, so v0's RPC boundary
has no runtime argument validation unless we write our own. That is a real finding, not a
gap in the research.

Other consequences:

- **Serialisation in 0.10.0 is narrower than the README on `main` claims.** Verified:
  `Map`, `Set`, `RegExp`, `URL`, `ArrayBuffer`, every typed array except `Uint8Array`,
  null-prototype objects, non-`RpcTarget` class instances, and cycles all throw
  `TypeError` at the sender. `URL` and typed-array support exist only on unreleased
  `main`. With no type model these are runtime errors we cannot catch at build time.
- **HTTP batch is one-shot and one-directional.** Three dependent calls pipeline into a
  single POST; after the batch the stub is dead; a server→client callback the server
  awaits hangs forever. Bidirectional calling requires WebSocket, which in a stateless
  Worker counts as one request against CPU limits.
- **Stability:** Cloudflare's own words are "new and still highly experimental", it is
  not documented on developers.cloudflare.com at all — the README is the spec — it is
  `0.x` with a wire-format break already shipped in 0.9.0, and 22 issues are open.
  Recommend an exact version pin rather than a caret range.

**A gap in the locked constraints.** capnweb's `workerd` condition resolves to
`dist/index-workers.js`, which begins `import * as cfw from "cloudflare:workers"`. So
**`cloudflare:*` needs externalising on the server, and constraint 15 names only
`node:*`.** Flagged on the map as a pending amendment.

**One correction to the research.** The agent reported that the `workerd` condition
yields `index-workers.js`. That does not follow automatically, and the reason matters for
ticket 13. capnweb's `exports` object has key order `bun, types, import, require,
workerd`, and Node resolves conditions in **object key order**, first match wins — not in
the order the resolver prefers them. A resolver honouring both `import` and `workerd`
therefore matches `import` first and gets `dist/index.js`, the generic build. **Condition
ordering is not ours to control; the package author's key order decides.** Ticket 13 must
design against that, and we need to establish empirically what our own server target
actually resolves capnweb to before ticket 20 relies on either build.
