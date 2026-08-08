# 14 — Emission: module naming, specifier rewriting, and what the printer writes

Type: grilling
Status: resolved
Blocked by: 11, 12, 27
Map: [ursprung v0](../map.md)

## Question

> **Rewritten 2026-08-08.** This ticket was originally titled "Bundle emission: flat ESM
> concatenation without a scope model" and existed to resolve a contradiction between
> constraint 8 (no scope model) and the old constraint 10 (one self-contained flat file per
> bundle). That constraint was replaced and the amendment landed: ursprung emits **real ESM
> modules on both sides**. Module scope comes free, so there is no renaming, no identifier
> collision, and no scope model anywhere — the contradiction is **dissolved rather than
> answered**, and the three options the old body weighed (IIFE wrappers, prefix renaming, a
> minimal scope model) are all moot. The historical body is preserved in git; the questions
> below are what remains. Two further sub-questions the old body listed are also dissolved
> and are **not** re-asked here: topological ordering (there is none — cycles are legal and
> the host owns evaluation order) and the Common-module extraction rule (a module reached by
> several entrypoints is emitted once by construction).

Emission is the last phase: the graph is built, coloured and audited, and every module has a
`(node, side)` emission unit. This ticket decides what those units are **called**, what their
import statements **say**, and what the printer **writes** for the cases that never had a
source module.

Decide:

- **Filename shape.** What an emitted module is called. Opaque `<hash>.js`, or a name derived
  from the source path with the hash as a suffix? Source maps are out of scope and production
  stack traces are accepted as unmappable — so the filename is the only surviving clue about
  where a deployed error came from, and this choice decides whether that clue exists.
- **The content hash itself.** `CONTEXT.md` fixes that filenames are content-hashed and that a
  query string is never used. It does not say what goes into the hash. **Cycles are legal
  (ticket 12, decision 7), so a hash over emitted bytes has no fixed point**: A's bytes name
  B's file, B's bytes name A's. Decide the hash domain and how a cycle is handled, or decide
  that one side does not hash at all.
- **Specifier form.** What an emitted import statement writes to name another emitted module —
  relative to the importer, or absolute from an output root — and whether the two sides answer
  the same way. `node:*` and `cloudflare:*` are the only specifiers that survive untouched
  (ticket 13).
- **Top-level await.** Ticket 11's grammar accepts it; ticket 27 found the legacy registry
  **hard-fails unsettled top-level await at first import**, which for a Route entrypoint is
  first-request-to-that-Route rather than deploy time. Is a server-reached module with
  top-level await a build error, and does the client answer differently?
- **`import.meta` and dynamic `import()` in application code.** `import.meta.url` in an
  emitted module names the emitted file, not the source. A dynamic `import()` is already an
  ordinary edge with a literal specifier (ticket 12, decision 3) and its specifier is
  rewritten like any other. Each needs a stated answer or an explicit ban.
- **The generated modules.** The Root entrypoint, the Route entrypoints and the route table
  have no source span — the printer synthesises them. Fix what each one exports, the Root
  entrypoint's export shape being the one Wrangler imports.
- **How ticket 20's RPC stubs are woven in.** The mechanism, not the security model: is the
  stub the client-side emission of the `.server.ts` node itself, or something spliced into the
  importer?
- **Emission records.** Ticket 12's post-emission audit reads them, not the graph. Fix the
  shape: per emitted module, its provenance node and the resolved target of every import
  specifier it writes.
- **Position tracking.** The maintainer's ruling below requires a position per printed node.
  Decide the granularity and how verbatim spans interact with it.

## Handed here by ticket 27

[Ticket 27](./27-workerd-dynamic-import-at-request-time.md) resolved the platform question
this ticket was blocked on: workerd permits request-time `import()` with no compatibility
flag, and its registry gives **one instance per resolved specifier**, so the shared-module
extraction the pending amendment describes is safe on the server as well as the client.

The emitter obligation that follows is narrow and absolute: **one canonical specifier per
module, with content hashing in the filename and never in a query string.** The registry
keys on the specifier rather than the file, so emitting the same module under two
specifiers — including one bare and one query-suffixed — mints two instances, two reactive
graphs, and a silent freeze. Ticket 02 found this trap on the client; ticket 27 shows the
emitter can reintroduce it on both sides.

Emitted modules must also carry I/O-free and top-level-await-free top levels; the legacy
registry hard-fails unsettled top-level await at first import, which is
first-request-to-that-Route rather than deploy time.

## Input from ticket 12 — decided, not open

Two of this ticket's remaining sub-questions are **dissolved rather than answered**, and
one input is fixed.

- **Topological order is gone.** Ticket 12 dropped constraint 10's cycle ban (a proposed
  amendment on the map), so there is no topological order to underspecify — and real ESM
  needs none, because the host owns evaluation order. Emission ordering now only has to be
  **deterministic**: sort by path, per ticket 10's determinism guarantee.
- **The extraction rule is gone too.** Emitting real ESM means a module reached by several
  entrypoints is emitted once and imported by all of them *by construction*. Being a Common
  module is a position in the graph, not a decision this ticket makes.
- **The emission unit is a `(node, side)` pair, not a node.** A module reached by both
  sides is emitted twice — the outputs go to different places — and a `.client.tsx`
  importing a `.server.ts` prints differently per side.
- **This ticket owns half of the enforcement.** Ticket 12's post-emission audit reads
  **emission records**, so emission must record, per emitted client module, its provenance
  node and the resolved target of every import specifier it writes.

See [ticket 12](./12-module-graph-and-two-colour-derivation.md), decisions 1, 6, 7 and 9.

## Input from ticket 13 — two emission facts

[Ticket 13](./13-module-resolution-rules.md) fixes two things this ticket emits:

1. **Data modules.** A JSON import is emitted as
   `export default JSON.parse(<the original bytes as a JS string literal>)` — deliberately
   not a raw splice of the JSON text, where `{"__proto__": …}` would set a prototype, and
   deliberately not `JSON.stringify(JSON.parse(…))`, which reorders integer-like keys. The
   importing module's `with { type: "json" }` attribute is **stripped on emit**: the target
   is now a `.js` file, and asserting `json` on one is a hard error in both hosts.
2. **External specifiers survive rewriting verbatim.** `node:*` and `cloudflare:*` are the
   only specifiers the emitter must not rewrite or content-hash.

## Input from the maintainer, 2026-08-08 — the printer records positions

Source maps stay out of scope for v0 and unmappable production stack traces are accepted.
**The obligation this ticket carries is the other half of that ruling: the printer records a
position per printed node.** No `.map` files are emitted and nothing in the output changes —
this is purely so that emitting them later is additive.

The reason it is an obligation rather than a good intention: a printer written without
position tracking is retrofitted by touching every print site. That retrofit is what gets
more expensive with delay, not the map files, and it is the whole reason the decision was
worth making now rather than when someone first needs a stack trace.

Cheapest discharge is probably for the printer to thread an output offset alongside the
buffer it appends to, so that a node's `(original span, output offset)` pair falls out of
printing rather than being computed afterwards — but the shape is this ticket's to choose.
What is fixed is that the information must exist and must be testable.

## Answer

Recorded as [ADR-0010](../../../docs/adr/0010-emitted-filenames-are-content-hashed-over-the-condensation-graph.md),
which holds the hard-to-reverse half — the hash domain and the segment-list printer it forces.

Two of the answers below were not chosen so much as **discovered**: the printer cannot append
to a string (§4), and the Root entrypoint cannot be content-hashed (§7). Both are forced by
decisions already recorded elsewhere, and neither was visible from the ticket's own framing.

### 1. Filenames: one flat directory per side, `<basename>-<hash>.js`

Every emitted module lands in a single flat directory for its side. The name is the source
file's basename with its extension replaced by `.js`, plus the hash:

```
server/
  index.js                      <- Root entrypoint, see §7
  routes.js                     <- route table
  home-7d6c5b4a.js              <- Route entrypoint
  counter.client-1a2b3c4d.js
  format.shared-4b3c2d1e.js
  index-9f8e7d6c.js             <- node_modules/capnweb/index.js
client/
  counter.client-5e6f7a8b.js
  index-2c3d4e5f.js             <- node_modules/signal-polyfill/index.js
```

The side suffix is kept in the emitted basename. It is free information and it is what makes
a flat directory readable at all.

**The considered alternative was mirroring the source tree** — `routes/home-7d6c5b4a.js`,
`node_modules/capnweb/index-9f8e7d6c.js` — on the argument that source maps are out of scope,
so the filename is the only surviving clue about where a deployed error came from. The
maintainer chose flat. **The cost is real and is accepted**: a production stack trace naming
`index-9f8e7d6c.js` does not say which package, and there are as many plausible `index.js`
files as there are dependencies. What recovers it is the emission records (§12), which name
the provenance node of every emitted file and which the build host can keep beside the
output; flat naming makes that record load-bearing rather than merely useful.

### 2. The content hash: transitive, over the condensation graph

`CONTEXT.md` already fixes that filenames are content-hashed and that a query string is never
used. What it did not say is what goes into the hash — and **cycles being legal (ticket 12
§7) means the obvious answer has no fixed point**: A's emitted bytes contain B's filename,
B's contain A's, and neither can be computed first.

Hash input for an emission unit, all three parts required:

1. the module's **own printed text with every rewritable specifier replaced by the
   dependency's real path** — so the text depends on no name that has not been assigned yet;
2. the module's **own real path**;
3. the **already-computed hashes of its dependencies outside its own SCC**, sorted.

Computed by running Tarjan over the emission graph for that side, then walking the
condensation in reverse-topological order. For a multi-member SCC, one combined value is
computed over every member's parts 1 and 2, members sorted by real path, together with part 3
for the SCC as a whole; each member's hash is then that combined value plus its own real path.

```
hash(M)        = H( ownText(M), realPath(M), sorted[hash(D) for D in deps(M)] )

for a cycle {A, B}:
  scc          = H( ownText(A), realPath(A), ownText(B), realPath(B),
                    sorted[hash(D) for D in deps({A,B}) outside the SCC] )
  hash(A)      = H( scc, realPath(A) )
  hash(B)      = H( scc, realPath(B) )
```

**Why transitive rather than own-content-only.** Hashing a module's own text alone is one
pass and needs no ordering, and it is wrong in a way that only shows up in production. A
change to a leaf changes its importer's *bytes* — the importer's specifier now names a
different file — without changing the importer's *name*. A browser holding the importer under
an immutable cache entry then fetches a dependency filename this deployment no longer
contains, and 404s. Transitive hashing is what makes the immutable-cache promise true.

**The accepted cost is over-invalidation inside a cycle**: changing any member of an SCC
renames every member. Cycles are legal but not common, and the alternative is a fixed point
that does not exist.

**Uniqueness is proved, not assumed.** Two emission units in one directory have different
real paths (ticket 12 §1 interns one node per realpathed path), so their hash inputs differ in
part 2. A filename collision therefore requires a hash collision, which emission detects and
**throws** on — ticket 10's rule, since it means ursprung is broken and there is no user
action to suggest.

### 3. The hash function is ursprung's own, and that is forced rather than chosen

Three recorded decisions collide here and leave exactly one option:

- `build` is **synchronous** ([ADR-0006](../../../docs/adr/0006-the-virtual-filesystem-is-a-synchronous-snapshot.md)).
- The only digest in the web platform is `crypto.subtle.digest`, which is **async**.
- `node:crypto`'s `createHash` is synchronous but is a Node API, which **constraint 4**
  forbids the build from touching; and **constraint 6** caps runtime dependencies at two,
  neither of which hashes.

So ursprung implements the hash itself, synchronously, in about twenty lines. **A 64-bit
FNV-1a over the input bytes, rendered base36, truncated to the first eight characters in the
filename.**

It is deliberately **not** cryptographic and does not need to be. The input is the
application's own source, there is no adversary, and the only property required is that
different inputs almost never collide — with "almost never" backed by §2's assertion rather
than by a proof. Eight base36 characters is about 41 bits, which is comfortable at any
plausible module count and is checked anyway.

### 4. The printer emits a segment list, not a buffer — forced by §2 plus the position obligation

The hash must be computed **before** the final specifiers are known, and the emitted bytes
**contain** those specifiers. The naive discharge — print with placeholders, then substitute —
silently breaks the maintainer's position-tracking obligation: substituting a real path for a
final filename changes byte length, so every recorded output position after the first import
shifts. The breakage would not surface until someone first tried to emit a source map, which
is precisely the retrofit the obligation exists to prevent.

So **the printer does not append to a string.** It appends to an ordered list of segments,
each either literal bytes or a **specifier slot** naming a dependency. Two walks follow:

- **Hashing** walks the segments substituting each slot with the dependency's **real path**
  (§2, part 1). Independent of every name not yet assigned.
- **Assembly** walks them again substituting each slot with the dependency's **final
  filename**, and resolves position records to absolute output offsets as it goes.

Positions are therefore recorded during printing as `(segment index, offset within segment)`
and resolved at assembly. One print, one assembly, no second parse — and the position records
survive specifier substitution **by construction rather than by care**, which is the property
worth having.

### 5. Position tracking: one record per print site, and verbatim spans need only one

The maintainer's ruling asks for a position per printed node. The discharge is a record per
**print site**, which is coarser than per node and loses nothing, because ticket 11's printer
has a verbatim leaf case: a pure subtree is copied byte-for-byte, so one record for the whole
span is sufficient and any interior node's output offset is
`recordedOutputOffset + (nodeSourceOffset - spanSourceStart)`.

Records are emitted at every node the printer prints structurally, and exactly once per
verbatim span. No `.map` files are emitted and nothing in the output changes.

**The obligation is testable, which was the other half of the ruling.** For every record,
slicing the assembled output at the recorded output offset yields the printed form of the node
at the recorded source span. That is a property test over the corpus, not a golden file.

### 6. Specifier form: relative, and never anything else

Every rewritten specifier is `./<filename>`. Flat directories (§1) make this exact on both
sides with no `../` ever appearing. workerd's legacy registry is `kj::Path`-keyed and resolves
a relative specifier against the importer's module name; the browser resolves against the
importer's URL. Both land in the same directory.

- **Never root-absolute.** `/_ursprung/x.js` would hard-code the assets base path into every
  emitted module, so moving the output directory would mean re-emitting the whole graph.
  Relative survives the move, which keeps ticket 21 free to place the directory.
- **Never a query string.** Ticket 27's obligation, restated here because this is the code
  that would violate it. **Corrected 2026-08-08 by
  [research §28](../research/28-new-module-registry.md), which established the two registries
  fail differently and this bullet had conflated them.** On the legacy registry `./x.js?v=2`
  does not resolve at all — `kj::Path` has no notion of a query, and the import throws
  `No such module "x.js?v=2".` On the new registry it resolves to the same *definition* but a
  distinct *instantiation*: a second `v8::Module`, a second evaluation, and a second copy of
  live module state persisting across requests — which is ticket 02's silent cross-copy freeze
  arriving through the emitter. So the hazard this rule guards against is **silent only on the
  new registry**, and the rule is satisfied by construction here, since ADR-0010 hashes into
  the filename and §6 emits `./<filename>` and nothing else.
- **`node:*` and `cloudflare:*` survive verbatim** — ticket 13, the only specifiers the
  emitter must not rewrite.

### 7. The Root entrypoint is the one module that is not hashed — also forced

Wrangler is configured with the Root entrypoint **by name** (ticket 05). A content-hashed name
would change on every build and the configuration would have to be rewritten to match, which
the build cannot do: the config is the host's input, not the build's output. So the Root
entrypoint is emitted under a **fixed, stable name**, and it is the only content-unhashed
emitted module. The exact string is ticket 21's, since it is one half of the Wrangler-facing
contract; what is fixed here is that it is stable and unhashed.

This costs nothing — a server module has no HTTP cache to bust, so its name needs only to be
stable and known.

**Every other server module is hashed anyway**, even though the server has no HTTP cache
either. One rule costs less to specify than a per-side exception, the machinery exists for the
client regardless, and it buys one real thing: a deploy diff shows exactly which modules
changed. The route table is hashed like anything else, since only the Root entrypoint is named
from outside the build.

### 8. Top-level await is a build error on the server traversal only

Checked **per traversal**, exactly like constraint 15's `node:*` rule (ticket 12 §4). Any
top-level `await` in a module the server traversal reaches is a hard error; the same module is
legal if only the client reaches it, because a browser has no registry to hard-fail. The
diagnostic **names the import chain** — for a third-party package the offending line is in code
the author cannot edit — and the remedy is "move the await inside a function".

**The reason recorded is forward-compatibility, not legacy support**, and the distinction was
the maintainer's ruling rather than a detail of wording. workerd ships two module registries:
the legacy one, `kj::Path`-keyed, the default and what production Workers run on; and one
behind `new_module_registry`, which is `$experimental` with **no `$compatEnableDate`** and
appears nowhere on Cloudflare's public compatibility-flags page. The registries differ here —
legacy drains the microtask queue once and throws `"Top-level await in module is unsettled."`,
the new one returns the real promise — but **the rule is valid under both**, because the new
registry is strictly more permissive.

**Sharpened 2026-08-08 by [research §28](../research/28-new-module-registry.md).** This
originally read "nothing changes if the flag ever ships", which was too generous. Measured
against both registries, an unsettleable top-level await **rejects** on legacy and **stays
pending forever** on the new one — so for a Route entrypoint the router awaits, "strictly more
permissive" is in practice "hangs instead of failing", killed later by hang detection with no
message naming the module. If the flag ships this rule therefore **matters more, not less**: the
build error becomes the only legible report of the problem. The decision is unchanged; only its
reason.

Targeting the new registry outright was proposed, in the spirit of preferring modern platform
capabilities over reach, and rejected on three grounds:

- **It is unshipped, not merely newer.** This is not the `nodejs_compat` → `nodejs_compat_v2`
  shape where the modern option is there for the taking. Targeting it means the canonical demo
  app does not deploy, which collides with constraint 3 and with the destination.
- **The trade is bad even ignoring availability.** It buys one thing — top-level await stops
  being an error — and costs two: Route-entrypoint evaluation charges to **request CPU**
  instead of legacy's separate budget, and a query string in a specifier becomes **URL-parsed
  rather than loudly fatal**, converting a build bug that dies noisily into ticket 02's silent
  freeze.
- **The rule sets are not symmetric.** Legacy-safe rules hold on the new registry; new-registry
  rules do not run today. Choosing legacy here is choosing the rule set valid under both, not
  choosing old over new.

The narrow band that would have worked on legacy — an `await` settling within one microtask
drain, which given the no-I/O-at-top-level rule means awaiting something already resolved — is
rejected with eyes open, because the build cannot distinguish it statically.

**This changes no constraint**, so there is no amendment to propose; it is recorded here and
gisted on the map.

### 9. `import.meta` and dynamic `import()`

- **`import.meta` is emitted verbatim and never rewritten.** `import.meta.url` therefore names
  the *emitted* module, not the source. That is correct rather than regrettable: it is the
  module's real identity at runtime.
- **The sharp edge, stated because it will bite.** `new URL("./data.json", import.meta.url)` —
  the idiomatic way to name a sibling asset — resolves against the flat emitted directory,
  where no such file exists. **ursprung does not analyse that pattern**, and a build that
  silently emits a URL to nothing is worse than one that refuses. This is the same shape as
  ticket 08's Module reference, which works only because the *host* normalises it before the
  build begins. Handed to the **static assets** fog patch, where the answer belongs.
- **Dynamic `import()` with a literal specifier** has its specifier rewritten exactly like a
  static one; ticket 12 §3 already makes it an ordinary edge, and a non-literal specifier is
  already a hard build error.

### 10. The generated modules

Five kinds of emitted module have no parsed source and are printed from synthesised AST —
native rather than a splice, per ticket 11 §2.

| Emitted module | What it exports | Hashed? |
| --- | --- | --- |
| **Root entrypoint** | `export default { fetch }` — the module-Worker shape | no (§7) |
| **Route table** | the route set the router matches (ticket 08) | yes |
| **Route entrypoint**, one per Route | its layout chain, component and api handlers | yes |
| **Stub module**, one per boundary-reached server node | the server module's own export names (§11) | yes |
| **Data module**, one per reached JSON file | `export default JSON.parse(<original bytes>)` (ticket 13) | yes |

A data module is the one entry with a provenance node but no AST — it prints from bytes.
Ticket 21 owns the rest of the Wrangler-facing contract; what is fixed here is the export
shape.

### 11. An RPC stub is a module, not a splice

For a `.server.ts` node reached across a boundary edge, **the client emission of that
`(node, client)` pair is the stub**. Same directory, same naming scheme, exporting the same
names the server module exports, each bound to a capnweb call instead of the real function.
Ticket 20 still owns what those bindings do and which exports are callable; this fixes only
the mechanism.

Three things fall out, and together they are why splicing into the importer is the wrong shape:

- **The importer is unchanged except for its specifiers.** A `.client.tsx` prints identically
  on both sides apart from where its specifiers point, so there is no per-side divergence in
  any module body.
- **One instance per specifier holds for stubs too.** Two client modules importing the same
  server module get the same stub module, hence one capnweb session object rather than two —
  which is ticket 02's trap arriving by a different road, and closed by the same property.
- **It is the emission unit ticket 12 already defined.** `(node, side)` was chosen partly
  because a `.client.tsx` importing a `.server.ts` "prints differently per side"; the stub is
  simply what the server node's *client* print is.

**One refinement handed back to ticket 12.** Its post-emission audit says every emitted client
module's provenance is a client, shared or third-party node — and a stub's provenance node is a
**server** node, so the audit as written throws on every stub. The rule is refined rather than
weakened: an emitted client module is either printed from a client/shared/third-party/data
node, **or** is a generated module whose record carries a `generated` kind. For an
`rpc-stub` the audit then checks the stronger and more useful property — that no AST from the
server node reached the printer at all. A comment is appended to ticket 12.

### 12. Emission records

Ticket 12's audit reads these rather than the graph, which is the point: a wrong traversal
cannot satisfy the audit by being wrong consistently. Per emitted module:

- the output filename and the side;
- **provenance** — either a graph node's real path, or `generated` with a kind
  (`root-entrypoint` | `route-table` | `route-entrypoint` | `rpc-stub`); an `rpc-stub` also
  records the server node it stubs;
- for **every specifier it writes**: the text as emitted, and the resolved target — an emitted
  filename, or an external specifier;
- the position records (§5);
- the content hash.

That is enough for the audit to run without consulting the graph. §1's flat naming makes the
provenance field carry a second job it did not originally have: it is the only thing that maps
`index-9f8e7d6c.js` back to a package.

### 13. Ordering and determinism

Emission order is **sorted by real path** — ticket 12 §7 and ticket 10's byte-identical-output
guarantee. There is no topological order and none is needed, because the host owns evaluation
order. Nothing below emission may use a timestamp, a random value or host-supplied ordering,
and the SCC computation in §2 is made deterministic by iterating nodes in that same sorted
order.

### Handed to other tickets

- **Ticket 21** — the Root entrypoint's exact stable name (§7); where the two flat directories
  live, which §6's relative specifiers deliberately leave free; and the emission records as the
  input to modulepreload hints alongside ticket 12's per-entrypoint reach.
- **Ticket 20** — the stub is a module with the server module's export names (§11), not a
  splice; and the audit refinement that lets a stub exist at all.
- **Ticket 12** — the audit refinement in §11, appended there as a comment.
- **Ticket 19** — client roots are reachable only under their hashed filenames, so whatever
  names modules in the HTML reads emission records rather than source paths.
- **The static assets fog patch** — `new URL(spec, import.meta.url)` (§9), which is the second
  half of that patch arriving from a direction nobody was watching.
