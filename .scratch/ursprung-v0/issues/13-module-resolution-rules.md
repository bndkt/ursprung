# 13 — Module resolution rules for v0

Type: grilling
Status: open
Blocked by: 04
Map: [ursprung v0](../map.md)

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

## Established by ticket 04 — read before starting

[The resolution research](../research/04-resolution.md) transcribes Node's algorithm
implementably and answers several of this ticket's questions outright:

- **`exports` cannot be mandatory.** Our own `signal-polyfill` dependency has no
  `exports` field at all — only `main`. Bare-subpath fallback is load-bearing on day one.
- **Not skippable despite looking legacy:** `main`, `imports`/`#` specifiers,
  self-reference, `*` subpath patterns, array targets and `null` targets.
- **Skippable:** extension probing, directory indexes, the `require`/`node-addons`/
  `module-sync` conditions, wasm and addon formats.
- **Conditions are a set, not an ordered list** — this ticket's framing was wrong. Node
  uses a `SafeSet`; precedence is the package author's key order. Recommended membership:
  server `["workerd", "worker", "browser", "module", "production", "import"]`, client
  `["browser", "module", "production", "import"]`, excluding `types`, `require`, `node`,
  `development`, `react-server`.
- **Encode as a hard rule: never read a manifest from the npm registry API.** It reorders
  keys by length, destroying condition precedence. This already produced one wrong
  conclusion on ticket 01. Tarball or repository only.
- **CJS detection is per-module, not per-package** — hono, zod and date-fns ship both.
  The one ambiguous case is `.js` with no `"type"`; the recommendation is the
  conservative "treat as CJS" rule, since the permissive one needs the scope model
  constraint 8 rules out.
- **Symlinks are not optional.** `ESM_RESOLVE` realpaths, and this repo's own Bun
  `node_modules` is symlinks into `.bun/<name>@<ver>/node_modules/`. Without link
  resolution a VFS gets the wrong dependencies and the wrong `"type"` — and the same file
  reached by two paths must not become two nodes in ticket 12's graph.

## Amended constraint 15 — the externals rule this ticket must implement

Constraint 15 was tightened on 2026-08-07 (see
[ADR-0004](../../../docs/adr/0004-no-polyfills-workerd-natives-only.md)) and it lands
squarely on this ticket:

- Server externals are exactly `cloudflare:*` plus the `node:*` specifiers workerd
  implements **natively**. Anything else is a hard build error naming the package and the
  import chain.
- The `node:` prefix is required; unprefixed builtins are an error even though
  `nodejs_compat_v2` legalises them.
- Client: every `node:*` import is an error.

Two things this ticket now owns as a result. **Where does the list of natively-implemented
modules come from**, given it grows with the compatibility date — is it generated from
workerd, hand-maintained with a pinned date, or read from the application's compatibility
date at build time? And **what does the error say**, since "use a different package" is
the only fix and the author needs the chain to know which one.
