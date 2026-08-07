# 04 — ESM resolution and export conditions on workerd and in the browser

Type: research
Status: resolved
Blocked by: —
Map: [Ursprung v0](../map.md)

## Question

Constraint 7 means Ursprung resolves real npm packages; constraint 14 means ESM only;
constraint 13 means resolution is a pure read over a virtual filesystem. Ticket 13
writes our resolution rules. This ticket gathers the algorithm and the platform facts.

Establish from primary sources — the Node.js ESM resolution documentation and its
specified algorithm, the `workerd` source or Cloudflare's own docs, and the WinterCG /
Runtime Keys registry:

- The **ESM resolution algorithm** as Node specifies it, in enough detail to implement:
  `exports` maps (string, object, array, nested conditions, subpath patterns with `*`),
  the `imports` field and `#` specifiers, self-referencing by package name, `main` and
  `module` and when each applies, extension probing, directory index resolution, and
  the `type` field's role.
- Which parts of that algorithm are **load-bearing for ESM-only packages** and which
  exist only for CJS or legacy packages — we want to implement the smallest correct
  subset, so mark what we can skip.
- **Condition names**: the full registered set, what `workerd` recognises and in what
  order, what browsers/bundlers conventionally use, and how `development`/`production`
  interact. Recommend a concrete ordered condition list for our server target and our
  client target.
- How do real, current ESM-only packages actually declare themselves? Sample a handful
  of well-known ones and document the patterns that appear in practice, including the
  awkward ones (conditional `browser`/`worker` splits, subpath wildcards, packages that
  ship both).
- **How is a CJS-only package detectable** cheaply and reliably, so we can produce the
  hard error constraint 14 requires rather than failing mysteriously later?
- What does `nodejs_compat` actually provide on Workers today, which `node:*` builtins
  are covered, and how is it enabled? Constraint 15 leaves these external on the server.
- Are there any traps for a resolver that must run **inside a Worker** — case
  sensitivity, symlinks in `node_modules`, path length, or anything else that a
  real-filesystem resolver gets for free?

Write the findings to `.scratch/ursprung-v0/research/04-resolution.md`, citing sources.

## Answer

Findings: [`research/04-resolution.md`](../research/04-resolution.md). The algorithm is
transcribed implementably from Node's spec pseudocode (`nodejs/node` `main`, verified
byte-identical to `v24.x`), with a consolidated keep/skip table.

**What we can skip:** extension probing, directory indexes, the `require`,
`node-addons` and `module-sync` conditions, and wasm/addon formats.

**What we cannot skip, despite looking legacy:** `main` and bare-subpath fallback — our
own `signal-polyfill` dependency has no `exports` field at all, so this is load-bearing
on day one; `imports`/`#` specifiers (chalk uses them); self-reference; `*` subpath
patterns; and array and `null` targets.

**Conditions are a set, not an ordered list.** Node uses a `SafeSet`, and precedence
belongs entirely to the package author's key order in the manifest. An "ordered condition
list" — which this ticket asked for — is documentation only; what we actually choose is
membership. Recommended: server
`["workerd", "worker", "browser", "module", "production", "import"]` (Wrangler's own three
plus `import`/`module`/`production`), client
`["browser", "module", "production", "import"]`, with `types`, `require`, `node`,
`development` and `react-server` explicitly excluded.

**A methodological trap that already bit us**, and which ticket 13 must encode as a rule:
`registry.npmjs.org` **reorders manifest keys by length**, which destroys condition
precedence. capnweb looks misordered there but its real manifest has `workerd` first.
This ticket's finding corrected a wrong conclusion recorded on
[ticket 01](./01-capnweb-transport-and-capability-model.md). Manifest evidence must come
from the tarball or the repository, never the registry API.

**Two conflicts with the locked constraints:**

- **Constraint 15 is more broken than we thought.** unenv polyfills are injected by
  _Wrangler's esbuild pass_ — so with bundling disabled, which is the whole deployment
  plan, only workerd's natively-implemented `node:*` modules and stubs exist. Wrangler
  warns about exactly this combination. Worse, `nodejs_compat_v2` makes **unprefixed**
  builtins legal (`import "fs"`, 76 names), so a `/^node:/` externals rule leaks. This is
  a bigger amendment than the `cloudflare:*` one already pending.
- **Constraint 13's VFS is under-specified.** `ESM_RESOLVE` calls realpath, and this
  repo's own Bun `node_modules` is symlinks into `.bun/<name>@<ver>/node_modules/`. A VFS
  that mirrors that layout without resolving links gets the wrong dependencies and the
  wrong `"type"`. The interface needs directory-existence and a declared root, not just
  `readFile` — which lands directly on ticket 10.

**CJS detection is per-module, not per-package** — hono, zod and date-fns all ship both.
The only ambiguous case is a `.js` file with no `"type"`, where the recommendation is the
conservative "treat as CJS" rule, because the permissive alternative needs the scope model
constraint 8 rules out.

**Flagged as unstable:** workerd `main` now carries `$compatEnableDate("2026-08-04")` on
`nodejs_compat`, absent from tag `v1.20260804.1` and contradicting the documentation.

**And a small embarrassment worth fixing:** `ursprung`'s own `exports` points at
`./src/index.ts`, which its own resolver would classify as an unknown extension.
