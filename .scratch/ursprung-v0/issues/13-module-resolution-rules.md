# 13 — Module resolution rules for v0

Type: grilling
Status: resolved
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

## Input from ticket 12 — decided, not open

**There are two condition sets, one per side, and this ticket owns both lists.** Ticket 12
fixed only the consequence for the graph: because a specifier can resolve to different
files under the two sets, **an edge carries a specifier and not a target**, and traversal
runs once per side with nodes interned by real path across both runs. Erroring on a
specifier that resolves differently per side was considered and rejected — it outlaws the
commonest reason a package ships a `browser` condition at all.

Two further inputs: resolution is over **realpathed** paths (ticket 10), and **first-party
means no `node_modules` segment in the real path**, which is the test that decides whether
constraint 9 or constraint 16 applies to a module.

See [ticket 12](./12-module-graph-and-two-colour-derivation.md), decisions 3 and 8.

## Answer

The resolver is **Node's `ESM_RESOLVE`, minus a documented skip list, plus three ursprung
rules** — externals, format classification, and the JSON transform — all three applied at
one place: between steps 7c and 7e, on the resolved file, after the real path is known.
Research §2's transcription is adopted as written. Nothing below re-derives it; this
answer records only what ursprung decides on top.

The single most load-bearing sentence, repeated here because a reader will assume the
opposite: **conditions are a set, not an ordered list.** Precedence belongs to the package
author's key order. The lists below are documentation and diagnostics; sorting them
changes nothing, and a resolver written to honour their order is wrong.

### 1. Specifier kinds

| Kind                     | Example                        | v0                                                     |
| ------------------------ | ------------------------------ | ------------------------------------------------------ |
| Relative                 | `./format.shared.ts`           | supported                                              |
| Bare package             | `capnweb`                      | supported                                              |
| Scoped package           | `@scope/pkg`                   | supported                                              |
| Subpath                  | `ursprung/client`              | supported                                              |
| `#` internal import      | `#supports-color`              | supported                                              |
| Self-reference           | `ursprung` from inside itself  | supported                                              |
| `node:` prefixed         | `node:path`                    | server: external if permitted (§8); client: error      |
| `cloudflare:`            | `cloudflare:workers`           | server: external; client: error                        |
| Unprefixed builtin       | `fs`                           | **error, both sides** (constraint 15)                  |
| Absolute path            | `/src/x.ts`                    | error                                                  |
| `file:`/`http(s):`/`data:` | `https://esm.sh/x`           | error                                                  |
| Carrying `?` or `#`      | `./x.ts?raw`                   | error                                                  |
| Containing `%2F`/`%5C`   | —                              | error                                                  |

**Unprefixed builtins do not shadow installed packages.** Node's algorithm checks its
builtin list *first* (`PACKAGE_RESOLVE` step 3), so an installed package named `events` is
unreachable there. ursprung does the opposite: the `node_modules` walk runs first, and the
builtin-name list is consulted **only to improve the diagnostic** when the walk found
nothing. A real `events` package therefore resolves normally, and `import "fs"` in a
project without an `fs` package reports URS2002 naming the `node:` prefix as the fix rather
than a bare _module not found_. Constraint 15 makes the unprefixed spelling an error either
way, so this costs nothing and removes a silent shadowing.

### 2. Extension policy — literal source extensions, no probing (Q1)

A first-party relative specifier carries the **extension of the file on disk**:
`import { formatDuration } from "../format.shared.ts"`. The specifier **is** a virtual
filesystem path, so the resolver performs no mapping at all — no `.js` → `.ts` rewrite, no
probing, no directory index. This is what this repo and the ticket-07 prototype already
write, and it is one rule for first-party and third-party alike: a package shipping `.js`
is named with `.js`, and `ursprung`'s own `exports` pointing at `./src/index.ts` needs no
special case.

Extensions are classified by suffix, **never by location**: `.ts`/`.tsx` are parsed and
type-stripped whether or not the real path runs through `node_modules`. This is forced —
the published `ursprung` package ships TypeScript source as its entry point — and it is the
same rule, not an exception.

`.mts` and `.cts` are **not** accepted in v0: they exist to disambiguate module format,
which our `.ts`-is-always-ESM rule already settles. `.mjs`/`.cjs` are accepted from
third-party packages, where they carry format meaning (§6).

Rejected: TypeScript's NodeNext convention (write `.js`, resolve `.ts`), because the
specifier then names a file that does not exist and a probe order comes back; and
extensionless probing, which Node's algorithm forbids outright. Recorded as
[ADR-0009](../../../docs/adr/0009-first-party-specifiers-carry-the-source-extension.md).

### 3. The `exports` / `imports` subset — research's KEEP list, whole

Implemented: nested conditions **with fall-through**, array fallback targets, `null`
targets, `*` subpath patterns with `PATTERN_KEY_COMPARE`, the bare-conditions form, the
string-sugar form, the `main` fallback, the bare-subpath fallback for `exports`-less
packages, `imports`/`#` specifiers **including the `isImports` branch that permits bare
external targets**, self-reference, and the encapsulation errors. There is no smaller
correct subset: every one of these is exercised by a package ursprung already depends on or
by one in the top tier of npm.

Skipped: extension probing, directory indexes, the `require` / `node-addons` /
`module-sync` conditions, wasm and addon formats, `data:` specifiers, and Node's
unreleased package maps.

One implementation rule is promoted from a footnote to a requirement, because getting it
wrong is silent: **condition and subpath lookups are own-property lookups**. `JSON.parse`
yields objects with `Object.prototype` on the chain, so a naive `target[p] !== undefined`
treats `constructor`, `toString` and `valueOf` as conditions the package declared. Use
`Object.hasOwn`, and keep `PACKAGE_TARGET_RESOLVE`'s array-index-key check, which exists
because JS objects order integer-like keys first and would otherwise silently reorder a
package's conditions.

### 4. The two condition sets

```
server  = ["workerd", "worker", "browser", "module", "production", "import"]
client  = ["browser", "module", "production", "import"]
```

`default` is always active and is **never listed**. Excluded deliberately: `require`
(constraint 14 — including it would silently resolve CJS instead of erroring), `node`
(pulls the branches written for Node's builtins, which constraint 15 leaves external),
`types` (resolves to `.d.ts`, and is conventionally the *first* key in most conditional
exports objects, so including it by accident is catastrophic and silent — assert against
it), `development` (mutually exclusive with `production`, and constraint 11 means every
build is a production build), `react-server`, and the other runtimes' keys. `edge-light` is
tempting because Vercel Edge is workerd-shaped, but it is a different registered runtime
key and claiming it is a lie about our identity.

**Fixed, not application-configurable.** An app-supplied condition set makes every build a
function of app config, multiplies the resolver's test matrix, and buys the destination
nothing.

`workerd` is not optional: `capnweb` — a locked dependency — orders `workerd` first, and
without it we silently get the generic build.

### 5. Legacy fields — `main` yes, `module` no, `browser` map no (Q4)

`main` is kept because `signal-polyfill`, a locked dependency, has no `exports` field at
all. The `module` **field** is not read, exactly as Node does not read it, and neither is
the legacy `browser` file-substitution map.

The known cost, accepted with eyes open: a package shaped like `path-to-regexp@6.3.0` — no
`exports`, CJS `main`, ESM `module` — is a hard error although an ESM build sits on disk.
The diagnostic names the `module` field and says ursprung does not read it, so the author
is not left guessing why a package their bundler handles fails here. Reading it later is
about three lines; nothing we depend on forces it today, and every other legacy
accommodation (extension probing, directory indexes, CJS) is already refused.

### 6. CJS rejection — per module, not per package

Classification runs on the **resolved file**, after realpath:

```
.mjs                        -> ESM
.cjs                        -> CJS            -> URS2012
.ts / .tsx                  -> ESM (stripped)
.js  + scope type "module"  -> ESM
.js  + scope type "commonjs"-> CJS            -> URS2012
.js  + no type field        -> URS2013
.json                       -> data module (§7)
anything else               -> URS2014
```

A *package* is never classified. `hono`, `zod`, `date-fns` and `pathe` all ship both formats
and are perfectly usable; a manifest-level "is this CJS" check would reject them wrongly.

**The ambiguous `.js` is an error, not a syntax-detection probe.** Node's
`DETECT_MODULE_SYNTAX` was reconsidered in light of ticket 11's full ECMAScript parser and
rejected on a stronger ground than research §6.2's: detection requires reading module
**source inside the resolve phase**, and ticket 10 fixed resolution as a phase that reports
*every* failure at once, before anything is parsed. Threading a parse into it trades that
batching — a headline feature for the agents ticket 10 named as first-class users — for a
population of packages that is legacy and shrinking. Node's own clause about a top-level
lexical redeclaration of `require` needs the scope model constraint 8 rules out, so partial
detection would be silently wrong on exactly the ambiguous cases. The diagnostic names the
missing `"type": "module"`, which is the fix the package author must make.

Two manifest-only pre-flight checks sharpen the message, both free: an `exports` subpath
reachable only under `require`, and a resolution that landed via `main` on a `.cjs` file.

### 7. JSON modules — resolved, transformed to JavaScript (Q2)

A `.json` specifier resolves, and the build emits it as a JavaScript module. Four rules,
all derived from that choice:

- **The `with { type: "json" }` attribute is required** (URS2015), and an import attribute
  on a non-JSON specifier is an error (URS2016). This matches Node and the browsers, keeps
  the door open to emitting real JSON modules later, and makes the edge's kind visible in
  the AST. The attribute is **stripped on emit**, because the emitted target is a `.js`
  file and asserting `json` on it is a hard error in both hosts.
- **Default export only** (URS2017), as the platform specifies.
- **The emitted form is `export default JSON.parse(<original bytes as a string literal>)`.**
  Not a raw splice of the JSON text: JSON is *almost* a subset of JS expression syntax, but
  `{"__proto__": …}` is an ordinary key in JSON and sets the prototype in an object literal.
  Not `JSON.stringify(JSON.parse(…))` either: that reorders integer-like keys, the same JS
  hazard §3 flags for condition objects. Parsing the original text is semantically exact,
  byte-preserving and deterministic — and V8 parses JSON faster than the equivalent object
  literal, so the runtime cost is negative.
- **A data module is uncoloured.** Its Side is inferred from reachability, exactly as a
  third-party module's is. This is forced rather than chosen: the motivating file is
  `package.json`, whose name is not ours to pick, so a `.server.`/`.client.`/`.shared.`
  suffix cannot be required. Constraint 9 is untouched — it speaks of unsuffixed `.ts`/
  `.tsx`, and says nothing about `.json`.

Invalid JSON is a build diagnostic (URS2018), reported from the resolve phase's own read.

This adds a **second node kind** to ticket 12's graph, which is an amendment to a resolved
ticket rather than a free extension; a comment is appended there. The alternative — hard-
erroring on JSON — would have forced `packages/ursprung/src/index.ts` to stop reading its
own manifest, against CLAUDE.md's rule that the manifest is the single source of truth for
`name` and `version`.

### 8. `node:*` externals — a generated, date-keyed table (Q3)

The permitted server set is `cloudflare:*` plus the `node:*` specifiers workerd resolves at
the application's `compatibilityDate`, which ticket 08 already made a required Config field.
ursprung ships a **date-keyed table generated by a script** from workerd's
`compatibility-date.capnp` — where each `enable_nodejs_<name>_module` flag carries its own
`$compatEnableDate` — plus Cloudflare's published tables, with a test that diffs the
checked-in table against the source. On the client every `node:*` import is an error
(URS2004), and on the server a specifier outside the table for that date is an error
(URS2003) naming the date it was checked against.

**The non-functional stubs count as permitted.** Packages routinely import `node:tty` or
`node:child_process` at module scope for feature detection and never call them; rejecting a
stub breaks working code to prevent a throw that may never happen.

**The build assumes `nodejs_compat` is enabled and cannot verify it.** Compatibility flags
are not in the Config, and adding them was rejected as more surface than the check is worth.
The accepted cost is precise: an application that omits the flag gets a Worker that fails at
startup rather than a build that fails at build time. ursprung documents the flag as a
precondition. Two things soften it — research §7.5 found `$compatEnableDate("2026-08-04")`
on `nodeJsCompat` in workerd's `main` (landed, unshipped, and contradicting the docs), so
the assumption becomes true by default for modern dates if it ships; and **ticket 21 is
handed the rider** that the Wrangler-facing output contract is the one place the flag can
actually be checked.

The table carries research §9's caveat in its header: Cloudflare's documentation lists *API
names*, not module specifiers, so the mapping from "Query strings" to `node:querystring` is
inference and wants a runtime smoke test. The stub table is specifier-exact.

### 9. Caching — two caches, different lifetimes

- **Resolution results** are keyed on `(side, parent directory real path, specifier)`. Side
  is in the key because the two condition sets can send one specifier to two files —
  ticket 12's reason for an edge carrying a specifier rather than a target — so this cache
  **does not** survive between the server and client passes.
- **`READ_PACKAGE_JSON` and `LOOKUP_PACKAGE_SCOPE`** are keyed on real path alone. They are
  side-independent and pure, they are called many times per module, and they **do** survive
  across both passes. Research §8.4 is right that this is where the time goes.

Both are pure-function memoisation over an immutable snapshot, so neither has an
invalidation story to get wrong.

### 10. Symlinks, case, and paths — inherited, not re-decided

Ticket 10 settled these and this ticket only consumes them: the virtual filesystem models
links and the **build** derives realpath from a link table built at handover; resolution
runs over realpathed, root-relative POSIX paths with `""` as the root, which is what makes
`PACKAGE_RESOLVE`'s walk and `LOOKUP_PACKAGE_SCOPE` terminate structurally rather than by a
comparison someone can get wrong. Lookups are exact and case-sensitive, with one
case-insensitive scan on a miss purely to produce "did you mean `./button.tsx`?" —
diagnostics, never resolution. First-party means no `node_modules` segment in the real path
(ticket 12), which is what makes a workspace-linked `ursprung` first-party and a published
one third-party.

### 11. Diagnostics

Resolution diagnostics use ticket 11's `Diagnostic` shape with codes in the **URS2xxx**
band. A resolution failure has no span in the file that failed — the failure is *about*
another module — so `module` and `span` point at **the importing module and the specifier's
own span**, and the import chain from an entrypoint goes in `message`. That chain is not
decoration: for a CJS rejection the only fix is "use a different package", and the author
cannot act without knowing which of their dependencies dragged it in.

| Code      | Meaning                                             |
| --------- | --------------------------------------------------- |
| `URS2001` | module not found                                    |
| `URS2002` | unprefixed Node builtin — write the `node:` prefix  |
| `URS2003` | `node:*` not served at this compatibility date      |
| `URS2004` | `node:*` imported on the client                     |
| `URS2005` | unsupported specifier scheme or absolute path       |
| `URS2006` | `?query` or `#fragment` in a specifier              |
| `URS2007` | percent-encoded separator in a specifier or target  |
| `URS2008` | package path not exported                           |
| `URS2009` | package import not defined                          |
| `URS2010` | invalid package configuration                       |
| `URS2011` | invalid package target                              |
| `URS2012` | CommonJS module reached                             |
| `URS2013` | ambiguous `.js` — package declares no `"type"`      |
| `URS2014` | unsupported file extension                          |
| `URS2015` | JSON import without `with { type: "json" }`         |
| `URS2016` | import attribute on a non-JSON specifier            |
| `URS2017` | named import from a JSON module                     |
| `URS2018` | invalid JSON                                        |

URS2008 must print **the condition set we sent and the keys the package offered**.
`preact@10.29.8` has no `default` key in `"."` at all, so "not exported" with no further
detail is a real failure mode, not a hypothetical.

### The costs, stated in one place

1. **`path-to-regexp`-shaped packages are rejected** — no `exports`, CJS `main`, ESM
   `module` (§5).
2. **A package that forgot `"type": "module"` is rejected** (§6).
3. **`ws` resolves to `browser.js`** and throws "ws does not work in the browser" at
   runtime. Correct behaviour under our condition set, unhelpful message — the price of
   `browser` in the server set, which wrangler and Vite's webworker target both pay.
4. **`nodejs_compat` is unverifiable from the build** (§8).
5. **Literal `.ts` extensions will surprise people**, and they are the authoring surface, so
   the surprise is unavoidable and permanent.

### Handed to other tickets

- **Ticket 14** — the emission form for a data module (§7), and that external specifiers
  pass through specifier rewriting **untouched**: `node:path` and `cloudflare:workers` are
  the only strings in the output the emitter must not content-hash.
- **Ticket 21** — the `nodejs_compat` rider (§8), and the externals set as part of what the
  output declares to Wrangler.
- **Ticket 24** — mostly *decided*, not merely narrowed: §2 fixes an application's tsconfig
  as `allowImportingTsExtensions` with a `moduleResolution` that permits it. What is left
  there is the rest of the compiler surface, not the extension question.
- **Ticket 22** — the resolver is a pure function over a snapshot, so it is table-driven
  testable with no host; and because research established Node's algorithm text is
  byte-identical between `main` and `v24.x`, a differential oracle against Node's own
  resolver is available for the subset we keep.
- **Ticket 12** — the second node kind (§7), appended there as a comment.
