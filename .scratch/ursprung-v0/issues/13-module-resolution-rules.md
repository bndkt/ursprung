# 13 — Module resolution rules for v0

Type: grilling
Status: open
Blocked by: 04
Map: [Ursprung v0](../map.md)

## Question

Constraint 7 admits npm dependencies; constraint 14 restricts them to ESM; constraint 13
makes resolution a pure read over the VFS. Ticket 04 supplies the algorithm and the
platform facts. This ticket decides the smallest correct subset we implement.

Decide:

- **Specifier kinds we accept**: relative, bare package, scoped package, subpath,
  `#` internal imports, self-reference by name, absolute paths, URLs. For each: supported
  in v0, or a build error with a specific message?
- **Extension policy for first-party code.** This repo already writes explicit `.ts`
  extensions on relative imports (`allowImportingTsExtensions`). Do we require that of
  applications and skip extension probing entirely? Requiring it is a "formerly
  unreasonable expectation" that deletes a whole class of resolution logic — exactly the
  trade the vision asks for.
- **The `exports` map subset.** Which condition forms do we implement — nested objects,
  arrays as fallbacks, subpath patterns with `*`? Ticket 04 will report what real ESM
  packages actually use; implement that and error clearly on the rest rather than
  implementing the whole specification speculatively.
- **Condition ordering** for the server target and the client target, as concrete
  ordered lists. Do we support `development`/`production`, and if so what selects them
  given there is no dev server (constraint 11)?
- **Legacy fields.** `main`, `module`, `browser`. Does a package without `exports`
  resolve at all in v0, or is `exports` mandatory? Mandatory is simpler and excludes real
  packages — decide with eyes open.
- **The CJS rejection.** How is a CJS package detected, at what point, and what does the
  error say? It must name the package, the version, and the import chain that reached it,
  because the fix is "use a different package" and the author needs to know which.
- **`node:*` imports.** Constraint 15: external on the server, hard error on the client.
  Where in resolution does that decision live, and does the error name the chain?
- **Resolution caching.** Same specifier from the same directory resolves once. What is
  the cache key, and does it survive between the server and client passes over the graph?
- **Symlinks and realpath.** Package managers link heavily. Ticket 04 will report the
  traps; decide whether we resolve symlinks and what identity a module has if we don't —
  the same file reachable by two paths must not become two nodes in ticket 12's graph.
