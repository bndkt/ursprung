# Emitted filenames are content-hashed over the condensation graph

Every emitted module is named `<basename>-<hash>.js` in one flat directory per side, and the
hash is **transitive**: a module's hash covers its own printed text, its own real path, and the
hashes of its dependencies.

Circular imports are legal ([ADR-0008](./0008-the-module-graph-and-the-side-matrix.md)), so a
hash over a module's emitted bytes has no fixed point — A's bytes contain B's filename and B's
contain A's. Hashing therefore runs over the **condensation graph**: strongly-connected
components are collapsed, the condensation is walked in reverse-topological order, and every
member of a cycle takes a hash derived from one value computed over the whole component.

```
hash(M) = H( ownText(M), realPath(M), sorted[hash(D) for D in deps(M)] )
```

`ownText` is the module's printed text with every rewritable specifier replaced by the
dependency's **real path**, so it depends on no name that has not been assigned yet. Real path
is in the input so that two same-basename modules in one flat directory cannot collide except
through a hash collision, which emission detects and throws on.

The Root entrypoint is the single exception: Wrangler is configured with it by name, so it is
emitted under a fixed, unhashed name.

## Considered options

**Hashing a module's own content only** — one pass, no ordering, and cycles stop mattering.
Rejected because it breaks the immutable-cache promise in a way that only appears in
production. Changing a leaf changes its importer's _bytes_, since the importer's specifier now
names a different file, without changing the importer's _name_. A browser holding that importer
under an immutable cache entry then requests a dependency filename the current deployment does
not contain, and 404s. The failure needs two deployments and a warm cache to reproduce.

**A build hash in the directory instead of per-file hashes** — `/_ursprung/<build>/home.js`,
with short stable names inside. This dissolves the fixed-point problem completely, because no
filename depends on any other file's content. Rejected because it forfeits cross-deployment
caching entirely: one changed module re-fetches the whole client output. It would also revise
`CONTEXT.md`, which already fixes that emitted filenames are content-hashed.

**Mirroring the source tree in the output** — `routes/home-<hash>.js`. Rejected in favour of
flat directories. Source maps are out of scope and production stack traces are accepted as
unmappable, so a path-derived name would have been the last surviving clue about where a
deployed error came from; flat naming gives that job to the emission records instead.

## Consequences

**The printer cannot append to a string.** The hash must be computed before final specifiers
are known, and the emitted bytes contain those specifiers. Printing with placeholders and
substituting afterwards changes byte lengths, which shifts every recorded output position after
the first import — silently breaking the obligation that the printer record a position per
printed node ([ADR-0007](./0007-the-emitter-prints-from-the-ast.md)), and breaking it invisibly
until someone first tries to emit a source map.

So the printer appends to an ordered **segment list**, each segment either literal bytes or a
specifier slot. Hashing walks it substituting real paths; assembly walks it substituting final
filenames and resolving positions to absolute output offsets. Position records survive
substitution by construction rather than by care. This is a constraint on the printer's
interface, which is why it is recorded here rather than left to the emitter.

**ursprung implements its own hash function.** The build is synchronous
([ADR-0006](./0006-the-virtual-filesystem-is-a-synchronous-snapshot.md)), the web platform's
only digest is the asynchronous `crypto.subtle.digest`, `node:crypto` is a Node API the build
may not touch, and neither permitted runtime dependency hashes. A 64-bit FNV-1a in about twenty
lines, rendered base36 and truncated to eight characters. It is deliberately not cryptographic:
the input is the application's own source, there is no adversary, and collision safety is
bought by an assertion at emission rather than by hash strength.

**A change inside a cycle renames every member of that cycle.** Accepted. Cycles are legal but
uncommon, and the alternative is a fixed point that does not exist.

**Filename uniqueness is proved rather than assumed.** One node exists per realpathed path, so
two emission units in one directory always differ in the hash input. A collision means ursprung
is broken, so emission throws rather than producing a diagnostic.

The decision is reversible in one direction only. Moving from transitive hashing to something
cheaper is a silent correctness regression discoverable only in production; moving the other
way is additive. The segment-list printer is the expensive half to undo, since it shapes an
interface every print site sees.
