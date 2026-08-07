# 01 — capnweb: transport, capability model, and what it demands of a bundler

Type: research
Status: resolved
Blocked by: —
Map: [ursprung v0](../map.md)

## Question

ursprung uses Cloudflare's **capnweb** for client↔server RPC. Before we can design the
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

**A methodological trap, worth more than the fact it nearly cost us.** Node resolves
export conditions in **object key order** — first match wins — so which build you get
depends entirely on the package author's key order, not on the order a resolver prefers
its conditions in. Reading capnweb's `exports` from `registry.npmjs.org` gives the order
`bun, types, import, require, workerd`, from which it follows that `import` matches first
and a Workers target gets the _generic_ build. That conclusion was recorded here and is
**wrong**: the npm registry reorders JSON object keys by length then alphabetically
(verified — both the `/latest` and the versioned `/capnweb/0.10.0` endpoints return the
same mangled order, and the whole manifest is sorted that way). The authored order, from
the repository, is `workerd, bun, types, import, require` — **`workerd` first**, so a
Workers target does get `dist/index-workers.js` and the `cloudflare:workers` import above
is real. Ticket 04 caught this independently; credit to it.

Two things follow. **Never read a manifest's condition order from the registry API** —
only from the tarball or the repository — which ticket 13 must encode as a rule, since
ursprung reads manifests for a living. And condition _ordering_ is not a thing we
configure: what we choose is a condition **set**, and the package decides precedence.

_Caveat on this verification:_ the authored order was read from the repository's `main`
branch; the `v0.10.0` tag path returned 404, so the tag itself was not checked. The
tarball could not be fetched from here — the proxy terminated the connection — so this
should be re-confirmed against the installed package once capnweb is a real dependency.
