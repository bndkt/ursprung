# 01 — capnweb: transport, capability model, and what it demands of a bundler

Type: research
Status: open
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
