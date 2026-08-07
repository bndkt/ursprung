# The virtual filesystem is a synchronous snapshot

The build host materialises every file **before** calling `build`, and the build reads
them synchronously. The interface is two methods — `entries()`, which enumerates
`[path, kind]` once at handover, and `read(path)`, which returns bytes. Directory
existence, `realpath`, decoding and normalisation are all **derived by the build** from
that enumeration, not implemented by the host.

ADR-0003 established that the build is a pure function over an injected virtual
filesystem; ADR-0005 established that the host evaluates the config before the build
begins. This is the same phase boundary applied to file access: all asynchrony lives on
the host's side of it. A Worker host `await`s its R2 gets, then calls a synchronous build.

## Considered options

**A live asynchronous interface.** The honest-looking choice for R2 and for workerd, and
it reads only what the module graph actually reaches. Rejected because `async` would
infect the parser, resolver, graph walk and emitter permanently, and buy nothing: there is
no incremental consumer, since constraint 11 rules out a dev server, watch mode and HMR.
The laziness argument is also weaker than it appears — the resolution research requires a
directory index built in one pass at handover regardless, because "does directory `p`
exist" over a flat map is a prefix scan.

**A precondition that the host supply real paths.** The resolution research's own
recommendation, and rejected here after the snapshot decision inverted its cost. It cannot
mean removing link paths — `node_modules/lint-staged` must stay navigable or the bare
specifier never resolves — so it means duplicating each package's bytes at every path
pointing to it, paid in memory against a Worker's ceiling. Meanwhile `realpath` over a
snapshot is a map lookup, not I/O.

**A flat, hoisted `node_modules` required of the host.** What `@cloudflare/worker-bundler`
does; its resolver reads only `node_modules/<pkg>/package.json`, with no chain walk and no
links. Affordable there because that package ships an installer and owns the layout.
Constraint 13 forbids it here — ursprung is never a package manager — and it cannot
represent two versions of one package at all.

**`--preserve-symlinks` semantics.** Skipping `ESM_RESOLVE` step 7d entirely. Wrong for
the isolated `node_modules` layouts Bun and pnpm produce, which is this repo's own, and it
fails as a silent missing-dependency error.

## Consequences

**The build owns every path semantic, so hosts implement none.** `realpath` is the reason:
link chains, links to links and dangling links are the subtlest thing on the list and it is
load-bearing at every hop of package resolution. One implementation, derived from the link
table, is unit-testable with no host at all — where per-host implementations would diverge
and surface as missing dependencies.

**Paths are root-relative POSIX strings with no leading slash, and `""` is the root.**
`PACKAGE_RESOLVE` step 10 and `LOOKUP_PACKAGE_SCOPE` are loops that walk up until they
reach the root; with root-relative paths that termination is structural — the loop ends
when the path empties — rather than an explicit comparison against a declared root that
can be got wrong. Matching is exact and case-sensitive, which is stricter than macOS and
matches Linux and CI.

**`read` returns bytes, and the build decodes.** UTF-8, leading BOM stripped, invalid
sequences a loud build error rather than replacement characters entering the parser. This
is what makes determinism a claim about something we control, and it is required for
content hashing to be a function of source alone.

**Output is byte-identical for identical file contents, independent of host.** The risk is
not hash-map ordering — JavaScript `Map` iterates in insertion order — but that `entries()`
is implemented by the host, so enumeration order would otherwise leak into the output while
nothing in the code looked wrong. The build sorts the enumeration once at handover. Nothing
below that point may use a timestamp, a random name, or host-supplied ordering. A CRLF
checkout differing from an LF one is not a violation: those are different bytes, and
normalising line endings inside the build would be the error.

**There is no cancellation signal and no budget.** A synchronous build has no preemption
point, and a polled `AbortSignal` would make output depend on wall-clock timing,
contradicting the determinism guarantee. If a limit is ever added it must be count-shaped
(refuse a graph beyond N modules), never time-shaped.

**Failure is returned, not thrown.** `build` returns a discriminated result carrying every
diagnostic from the phase that failed, because ursprung treats AI agents as first-class
users and one-error-per-build costs an agent a full build per fact learned. Collection is
per phase — if the entry point does not resolve there is no graph to walk. A diagnostic
means the input is wrong; a `throw` means ursprung is broken, and the two must not be
conflated.
