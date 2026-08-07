# 10 — The build entry point and the virtual filesystem interface

Type: grilling
Status: resolved
Blocked by: —
Map: [ursprung v0](../map.md)

## Question

Constraints 4, 11 and 13 together say: `ursprung build` is a pure function from a virtual
filesystem to a set of output files, touching no Node API, with the caller responsible
for populating the filesystem. This ticket turns that sentence into an interface. It is
takeable now — nothing upstream constrains it — and every build-side ticket depends on it.

Decide:

- **The VFS interface.** What methods, exactly? Reading a file, checking existence,
  listing a directory, and stat-like metadata are the obvious candidates — but each one
  we add is a burden on every implementor, so justify each. What does a read return —
  bytes or text? Who owns encoding?
- **Sync or async?** Async is the honest choice for R2 and for the Workers runtime; sync
  makes the whole bundler dramatically simpler to write and to reason about. This is a
  real trade-off with consequences in every module. Decide it here and live with it.
- **Path semantics.** POSIX-style strings, or an opaque path type? Absolute or relative
  to a root? Case sensitivity, normalisation, and `..` handling — a Worker VFS has none
  of the filesystem's built-in answers, so we supply them.
- **What does `build` take and return?** Does it write files, or return a map of path to
  contents and let the caller write? Constraint 4 argues for returning — but the output
  contract with Wrangler (ticket 21) may argue otherwise.
- **Diagnostics.** Are errors thrown, or returned as a result value alongside partial
  output? A build with three unrelated errors should probably report all three rather
  than the first — decide whether that shapes the return type.
- **Cancellation and limits.** A Worker has CPU time limits. Is there a cancellation
  signal, a budget, or nothing at all in v0?
- **The two implementations.** Sketch both: the local CLI mounting the real filesystem,
  and an in-memory one for a Worker. If either is awkward, the interface is wrong.
- **Determinism.** Same VFS contents in, byte-identical output every time? Say yes or no
  explicitly — it decides whether we may ever use iteration order of a hash map, a
  timestamp, or a random name anywhere in the build.

The output of this ticket is a written interface, not prose about one.

## Established by ticket 04 — read before starting

[The resolution research](../research/04-resolution.md) puts a hard floor under this
ticket's "what methods, exactly?" question: `ESM_RESOLVE` calls **realpath**, and this
repo's own Bun `node_modules` is symlinks into `.bun/<name>@<ver>/node_modules/`. So the
VFS interface needs **directory existence, a declared root, and a way to resolve links** —
not just `readFile`. A VFS that mirrors a symlinked tree without resolving links returns
the wrong dependencies and the wrong `"type"`, silently.

## Input from ticket 08 — decided, not open

[Ticket 08](./08-route-and-config-authoring-api.md) settled where the build *starts*:

- **The Config file is evaluated by the host, before the build.** `ursprung build`
  evaluates `ursprung.config.ts` with a native `import()` — Node ≥22.18 strips types
  natively, Bun runs `.ts` directly, and no esbuild or loader hook is involved. Wrangler
  does exactly this for its own config; its `registerHooks` machinery exists only for
  watch-mode cache-busting (which constraint 11 rules out) and the `cf-worker` import
  attribute.
- **The build function receives `{ vfs, config }`**, where `config` is already plain
  evaluated data. It touches no Node API and performs no evaluation, so **constraint 4 is
  untouched** — a Worker host supplies the evaluated data by whatever means it has
  (Dynamic Workers via the `worker_loaders` binding is the mechanism, since `eval()` and
  `new Function()` are disallowed on workerd).
- **The host normalises evaluated references to VFS-relative paths at the boundary.**
  Module references are `new URL(specifier, import.meta.url)`, which evaluates to a
  host-shaped identifier — a `file://` URL under Bun, something else in a Worker. Turning
  those into VFS paths is the host's job, on the near side of the phase boundary, so the
  build only ever sees VFS paths.

This ticket still owns the VFS interface itself and the exact signature of the build
function; it inherits the phase boundary rather than deciding it.

## Answer

The virtual filesystem is a **synchronous snapshot**, complete before `build` is called,
exposing **two methods**. Everything else — directory existence, `realpath`, decoding,
normalisation — is derived by the build from that snapshot, once, at handover.

```ts
/** An entry in the snapshot. Contents are fetched separately, via read(). */
export type Entry =
  | { readonly kind: "file" }
  | { readonly kind: "directory" }
  | { readonly kind: "link"; readonly target: string };

/**
 * The snapshot the build host hands over, complete before build() is called.
 * Paths are root-relative POSIX strings, no leading slash; "" is the root.
 * Every path is already normalised: no ".", no "..", no duplicate or
 * trailing slashes.
 */
export interface VirtualFileSystem {
  /** Every entry. Called once, at handover. Order is not significant. */
  entries(): Iterable<readonly [string, Entry]>;
  /** The bytes at `path`, or null if no file is there. Real paths only. */
  read(path: string): Uint8Array | null;
}

export type BuildResult =
  | { readonly ok: true;  readonly output: ReadonlyMap<string, Uint8Array>;
                          readonly warnings: readonly Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export function build(input: {
  readonly vfs: VirtualFileSystem;
  readonly config: Config; // already evaluated by the host — ADR-0005
}): BuildResult;
```

### The decisions, and why

**Snapshot, and therefore synchronous.** The ticket framed this as "sync or async?", but
the real question is *when the I/O happens*, and ADR-0005 had already set the precedent:
the host does the impure work at a phase boundary and the build receives plain data. A
Worker host `await`s its R2 gets before calling `build`; the asynchrony lives beside
config evaluation, on the host's side. Async in the build would infect the parser,
resolver, graph walk and emitter permanently, and constraint 11 (no dev server, no watch,
no HMR) means there is no incremental case whose absence we would regret. A read miss is
a build error, not an I/O failure.

Confirmed against prior art: `@cloudflare/worker-bundler`'s `FileSystem` is fully
synchronous (`read`/`write`/`delete`/`list`; only `flush()` is async), and its
`createFileSystemSnapshot` is documented as "the bridge between async storage backends
(e.g. a Durable Object `Workspace` backed by SQLite/R2) and the **synchronous
`FileSystem` interface required by the bundler**". Cloudflare's own in-Worker bundler
makes the same move.

**The virtual filesystem models links; the build resolves them.** This **departs from
research §8.1's recommendation**, deliberately. §8.1 preferred a documented precondition
("the caller populates with real paths") with `realpath` as an escape hatch, weighing it
against a *live* interface where `realpath` would cost an I/O round trip. The snapshot
inverts that costing:

- `realpath` becomes a **pure map lookup** over a link table built at handover — no I/O,
  and the host already walks the tree to build the directory index §8.4 requires.
- The precondition becomes **expensive**. It cannot mean deleting link paths, because
  `node_modules/lint-staged` must stay navigable or the bare specifier never resolves at
  all. It has to mean duplicating each package's bytes at every path pointing to it —
  paid in memory, in a host with a 128 MB ceiling. The isolated layouts exist precisely
  to avoid that.

`--preserve-symlinks` semantics stay rejected: wrong for the isolated layouts Bun and
pnpm produce, which is this repo's own, and it fails as a *silent* missing dependency.

**Enumerate + read; the build derives the rest.** The deciding question was **who
implements `realpath`**. It is the subtlest operation on the list — link chains, links to
links, dangling links — and it is load-bearing at every hop of package resolution. Left
to each host, two hosts resolve the same tree differently and the bug surfaces as a
missing dependency. Derived by the build from an enumerated link table, one implementation
runs everywhere, it is directly unit-testable with no host at all, and it is a
precondition for the determinism guarantee below.

`read` is kept separate from the enumeration on purpose: the host enumerates paths
cheaply and serves bytes on demand, so a KV-backed host never holds every file's contents
in JS memory at once.

`read` is called with **real paths only** — the build realpaths before reading — which is
what keeps hosts free of path semantics entirely.

**Bytes, not text; the build decodes.** UTF-8, a leading BOM stripped, invalid sequences a
**loud build error** rather than U+FFFD replacement characters silently entering the
parser. Three reasons: determinism is only a claim about something we control if the build
is a pure function of bytes; content hashing (which the pending constraint 10 amendment
introduces) must hash bytes, and hashing a decoded-then-re-encoded string is a different
and subtly wrong value; and static assets — in the fog, not out of scope — then cost
nothing later. This also avoids worker-bundler's asymmetry, where `read` returns `string`
but `write` accepts `string | { data: Uint8Array }`, so binary can go in and never come
back out.

**Root-relative POSIX strings, no leading slash, `""` is the root.** This looked like
taste and is not. `PACKAGE_RESOLVE` step 10 and `LOOKUP_PACKAGE_SCOPE` are both loops that
walk up until they reach the root. With absolute paths that termination is an explicit
comparison against a declared root — the off-by-one that runs off the top. With
root-relative paths the loop ends when the path empties, so **termination stops being a
comparison anyone can get wrong and becomes structural**. §8.4 listed "a defined
filesystem root" as something a virtual filesystem must supply; this is how we stop
needing one.

Plain `string`, not a branded type: there is no *second* kind of path in this system to
confuse a virtual filesystem path with — ticket 08 put the host's normalisation of its own
identifiers on the far side of the boundary — so branding would guard a mistake that
cannot be made, at the cost of ceremony on every key, fixture and error message.

Three riders, all from the research and all accepted:

- Keys are already normalised. The build normalises a specifier before lookup, and a path
  that would escape the root is a **build error**, never a clamp to `""`.
- **Exact-match, case-sensitively** (§8.2). Stricter than macOS, matching Linux and CI,
  which is the correct direction: `import "./Button.tsx"` against `button.tsx` should fail
  on the developer's machine rather than first in production. On a miss, one
  case-insensitive scan purely to produce "did you mean `./button.tsx`?" — diagnostics,
  never resolution.
- Reject the URL-isms rather than half-supporting them (§8.3): `%2F` and `%5C` in a
  specifier, and `?query` / `#fragment` on third-party specifiers, are errors.

**`build` returns its output; it does not write.** Effectively forced: the virtual
filesystem is read-only, constraint 4 forbids touching a Node API, and worker-bundler's
`createWorker` returns `{ mainModule, modules }` for the same reasons. Ticket 21 owns what
is *in* the output; this ticket fixes only its type, path → bytes.

**Diagnostics are returned, not thrown** — a discriminated result. The reason is stronger
than good manners: `CONTEXT.md` states ursprung targets Workers "with AI agents as its
first-class users", and an agent that receives one error per build round-trips N times
through a full build to learn N facts. Batch diagnostics are a headline feature here, and
`throw` gives you exactly one.

Two honest limits, recorded so they are not discovered later:

- **"All errors" means "all errors in the earliest phase that failed."** Parse every module
  and report every parse error, yes; resolve every specifier and report every failure, yes.
  But if the entry point does not resolve there is no graph to walk. Collection is within a
  phase; the build stops at the phase boundary.
- **A diagnostic means the input is wrong; a `throw` means ursprung is broken.** Invariant
  violations inside the bundler still throw, loudly, and must never be dressed as
  diagnostics — otherwise our bugs are reported to users as if they wrote bad code.

No partial output on failure: a half-emitted module graph is not deployable, and returning
it invites a host to deploy it anyway.

**Determinism: yes, the strong form.** Same file contents in, byte-identical output out,
**independent of host**. The non-obvious part is where the risk actually lives.
JavaScript's `Map` iterates in insertion order — reliably — so the hazard is not hash-map
nondeterminism, which JS does not have. It is that **`entries()` is implemented by the
host**, so a Node host's directory walk, a Durable Object's `kv.list()` and a Map-backed
test host each enumerate differently, and the build faithfully propagates whatever order
it was handed while nothing in the code looks wrong. Under the pending constraint 10
amendment that surfaces as shared modules emitted in a different order, or identical
sources producing different content hashes.

Bought by **sorting the enumeration once at handover** — O(n log n), paid once. It forbids
timestamps, random names, and any dependence on host-supplied ordering anywhere below that
point.

One clarification, so nobody later "fixes" it: a CRLF checkout producing different output
from an LF one is **not** a determinism violation. Those are different bytes, hence
different input. Normalising line endings inside the build would be the actual error.

**Cancellation and limits: nothing in v0.** A synchronous build has no preemption point —
an `AbortSignal` cannot interrupt it, only be polled at points we remember to write, and a
polled signal makes output depend on wall-clock timing, which **directly contradicts the
determinism guarantee above**. The distinction that survives is time-shaped versus
count-shaped: a time budget is nondeterministic for the same reason, while a count budget
(refuse a graph beyond N modules) is a pure function of the input. Even that is not needed
in v0, because constraint 4 keeps the build-in-a-Worker *product* out of scope, so every
host that actually runs an ursprung build in v0 is the local CLI, with no CPU limit at all.

Recorded for later: **if a limit is ever added it must be count-shaped, never
time-shaped.**

### The two implementations, as sketched

- **Local CLI.** Walks the project root, emits `[path, kind]` per entry with `kind: "link"`
  wherever `lstat` reports a symlink and `target` from `readlink`; `read` is
  `readFileSync`, which already returns a `Buffer` — a `Uint8Array`. No conversion.
- **In-memory / Worker.** A `Map<string, Entry>` plus a `Map<string, Uint8Array>`, or a
  Durable Object KV backing served synchronously (worker-bundler ships exactly this shape
  in `DurableObjectRawFileSystem`). Links present only if the populating agent created any.

Neither is awkward, which is the check the ticket asked for.

### Deliberately not settled here

- **`Diagnostic`'s shape.** This ticket fixes that diagnostics come back as an array;
  message format and source positions remain the map's "Build diagnostics" fog patch.
- **What is *in* `output`.** Ticket 21 owns layout and naming.
- **The determinism test.** Handed to [ticket 22](./22-testing-strategy.md) as a named
  obligation, and sharpened there: "build twice, compare" is **not sufficient** — the test
  must build through two hosts whose enumeration orders differ, since that is the only
  thing the strong guarantee adds over the weak one.

### Prior art consulted

`@cloudflare/worker-bundler` (`cloudflare/agents`, MIT), read at source. It validates the
synchronous-snapshot shape outright. It does **not** answer the symlink question — it
sidesteps it: `resolvePackage` looks only at top-level `node_modules/<pkg>/package.json`,
with no chain walk, no nesting, no `#imports` and no package-scope lookup, which is
affordable only because the package ships an `installer.ts` that fetches tarballs and
writes a flat `node_modules` itself. Constraint 13 forbids us that: ursprung is never a
package manager, and the caller populating the filesystem is exactly how a symlinked tree
arrives.

Two features of it are warnings rather than models. Its `conditions?: string[]` is
documented "Order matters — earlier conditions take precedence", which is the precise trap
[ticket 04](./04-esm-resolution-and-export-conditions.md) established as wrong — conditions
are a **set**, and the package author's key order decides. And its `read`/`write`
asymmetry is the encoding wart Q4 avoids. It is prior art for the *interface*; nothing
below it transfers, since it carries nine dependencies and delegates bundling to
`esbuild-wasm`, `sucrase` and `typescript`, against our constraint 6.

Recorded as
[ADR-0006](../../../docs/adr/0006-the-virtual-filesystem-is-a-synchronous-snapshot.md).
