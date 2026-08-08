# Executed output is the assertion of record

Everything in ursprung v0 — parser, resolver, graph, emitter, renderer, client runtime — is
written from scratch, so there is no upstream project whose correctness the tests inherit. The
layer a change must satisfy before it is believed is therefore **executed output**: build a
fixture application, run its output, assert behaviour. Structural assertions over emission
records sit underneath it to localise failures, and per-phase unit tests are written only where
a phase has a genuine value-shaped seam.

The reason is not that integration tests are better. A structural assertion encodes _our own
belief_ about what correct output looks like, so when the belief is wrong the test passes
anyway; executing the output is the only oracle in reach that does not share the
implementation's assumptions. It is also affordable: `wrangler` already exports
`unstable_startWorker` and `createTestHarness` and the `workerd` binary is already on disk, so
running the server output in real workerd from `bun test` costs nothing.

## Consequences

**Implementation tickets are ordered around a walking skeleton.** The assertion of record does
not exist until parser, resolver, graph and emitter all work, so a strict red-green loop would
have nothing to be red against on day one and the strongest oracle would sit unused through the
most design-unstable period. The first implementation ticket is therefore the thinnest
end-to-end slice — one route, one static server component, no client modules, no reactivity, no
API route — after which every capability lands test-first against a running application. The
cost is that parser, resolver, graph and emitter each get a deliberately incomplete first
version, in exactly the modules whose finished shape
[ADR-0007](./0007-the-emitter-prints-from-the-ast.md) and
[ADR-0008](./0008-the-module-graph-and-the-side-matrix.md) already specify in detail.

**Per-phase unit tests are thin by construction.** ADR-0008's graph is annotated in place by
each phase rather than being a pipeline of immutable values, so a phase's output is not a value
a test can hold. That is a consequence to accept, not a conflict to fix.

**The Host interface acquires a third implementation.** Beside the DOM Host and the
server-string Host there is a Recording Host, which is how the client runtime is tested without
a browser and how resumption is asserted at all — see
[ADR-0001](./0001-modules-declare-their-side-in-the-filename.md)'s renderer/host split and the
testing strategy in `.scratch/ursprung-v0/issues/22-testing-strategy.md`.

## Considered options

**Whole-build structural assertions as the primary layer** — assert on what `build` returns,
without running it. Fast, hermetic, precise about where a failure is, and a natural fit for a
build that is a pure function
([ADR-0003](./0003-the-build-is-a-pure-function-over-a-virtual-filesystem.md)). Rejected because
it is the option whose blind spot is invisible: every assertion restates the implementation's
own model of correct output, so a shared misconception passes.

**Per-phase unit tests as the primary layer** — best failure locality, and it would push every
module toward a testable seam. Rejected because it would effectively reopen ADR-0008's
single-annotated-graph decision, which was made for reasons that have nothing to do with
testing.
