# 22 — Testing strategy for a from-scratch bundler and renderer

Type: grilling
Status: open
Blocked by: —
Map: [ursprung v0](../map.md)

## Question

Everything in v0 is written from scratch — parser, resolver, graph, emitter, renderer,
client runtime — which means there is no upstream project whose correctness we inherit.
This is takeable now, and it should be settled early, because the answer changes how the
modules in every other ticket are shaped. `/codebase-design` and `/tdd` both apply.

Decide:

- **What is the unit of confidence for the parser?** Options: a golden corpus of
  source→output pairs; differential testing against another implementation (TypeScript
  itself, or Node's type stripping) over a large sample of real files; property-based
  round-trips. Differential testing is by far the strongest signal available and costs
  a devDependency — which needs explicit approval under constraint 6. Decide whether to
  ask for it.
- **How is the server-never-leaks invariant tested?** Ticket 12 asks where enforcement
  lives; this ticket asks what proves it. A negative test ("this string does not appear
  in the output") is weak. Is there a structural assertion, and can it be made
  adversarial — a fixture app that tries every trick to smuggle server code across?
- **How is resumability tested?** Ticket 19 asks for a falsifiable "did not re-render"
  check. Turn it into a test harness: what runs, in what environment, and what does it
  assert? Does this need a real browser, and does that mean a devDependency?
- **What runs where.** `bun test` is this repo's runner (see `CLAUDE.md`), but the build
  must work under workerd and the client runtime under a browser. Decide which layers are
  tested in Bun, which need `workerd`, which need a browser, and whether v0 accepts gaps.
- **Fixture applications.** The demo app from ticket 07 is one. Do we need a corpus of
  small fixture apps, each isolating one behaviour, and where do they live given
  `packages/ursprung`'s `files` field excludes tests from the tarball?
- **Snapshot testing of emitted bundles.** Tempting and cheap, but snapshots of generated
  code rot and get blindly updated. Decide whether they are allowed, and if so where.
- **Determinism as a test.** If ticket 10 says byte-identical output, that is directly
  assertable: build twice, compare. Cheap and catches a whole class of bugs.
- **What we do not test in v0**, stated explicitly, so gaps are decisions rather than
  oversights.
