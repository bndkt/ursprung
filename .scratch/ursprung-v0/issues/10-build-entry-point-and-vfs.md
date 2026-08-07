# 10 — The build entry point and the virtual filesystem interface

Type: grilling
Status: open
Blocked by: —
Map: [Ursprung v0](../map.md)

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
