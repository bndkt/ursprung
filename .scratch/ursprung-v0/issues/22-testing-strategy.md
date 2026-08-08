# 22 — Testing strategy for a from-scratch bundler and renderer

Type: grilling
Status: resolved
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
- **Determinism as a test.** [Ticket 10](./10-build-entry-point-and-vfs.md) answered yes,
  and in the **strong** form: byte-identical output for identical file contents,
  _independent of host_. That sharpens this bullet — **"build twice, compare" is not
  sufficient**, because it holds under the weak guarantee too. The test has to build the
  same fixture through two virtual filesystems whose `entries()` enumerate in **different
  orders** and assert byte equality, since host enumeration order leaking into output is
  the exact failure the strong guarantee exists to prevent. Ticket 10 handed this here as
  a named obligation.
- **What we do not test in v0**, stated explicitly, so gaps are decisions rather than
  oversights.

## Answer

Recorded as [ADR-0011](../../../docs/adr/0011-executed-output-is-the-assertion-of-record.md),
which holds the hard-to-reverse half — the layer ordering, and the ordering it forces on
implementation tickets.

**Two of the seven bullets were already answered elsewhere and are not re-decided here.** The
parser's unit of confidence is [ticket 11](./11-parser-subset-ast-and-errors.md)'s four
oracles, which say so themselves: _"the general strategy stays ticket 22's; these are the
parser's."_ Where the server-never-leaks invariant is _enforced_ is
[ticket 12](./12-module-graph-and-two-colour-derivation.md)'s two throwing layers. This ticket
owns the general strategy, and — for the invariant — what proves that enforcement code rather
than where it lives.

Three facts were established rather than assumed, and each collapsed a question the ticket
posed as open. Real workerd is drivable from `bun test` at **zero dependency cost**. A real
browser is not, and cost an approval. And `files` is an allowlist (`["src", …]`), so anything
outside `src/` is out of the published tarball already — the ticket's worry about where
fixtures may live dissolves.

### 1. Executed output is the assertion of record

Three layers, in this order of authority:

1. **Executed output.** Build a fixture application, run its output, assert behaviour.
2. **Structural assertions over emission records**, which localise a failure the first layer
   only detects.
3. **Per-phase unit tests**, only where a phase has a genuine value-shaped seam.

The ordering is not "integration tests are better". It follows from there being no upstream
project whose correctness v0 inherits. A structural assertion encodes **our own belief** about
what the output should look like, so when the belief is wrong the test passes anyway;
executing the output is the only oracle in reach that does not share the implementation's
assumptions. It is also, per the facts above, free on the server and cheap on the client.

Layer 3 is thin **by construction, not by preference**. Ticket 12 decision 9 chose one graph
**annotated in place** rather than a pipeline of immutable values, so a phase's output is not
a value a test can hold and assert on. That is a consequence to accept rather than a conflict
to fix, and it is what pushes the effort into layers 1 and 2.

### 2. Three executors, one runner

| Layer                        | Executor                                                        | Dependency cost |
| ---------------------------- | --------------------------------------------------------------- | --------------- |
| Server output                | Real workerd, from `bun test` via wrangler's programmatic API     | none            |
| Client runtime, semantics    | Recording Host, in Bun                                            | none            |
| Client runtime, the DOM Host | The real DOM Host against happy-dom, in Bun                       | happy-dom       |
| Client, end to end           | Chromium via `playwright-core`'s library API                      | playwright-core |

**workerd is free.** `wrangler` is already a dev dependency and exports both
`unstable_startWorker` and a purpose-built `createTestHarness` (`listen()`, `fetch()`,
`close()`, per-Worker dispatch); the `workerd` binary is already on disk via miniflare. No
approval was needed and none was sought.

**The Recording Host is the architecture used as designed, not a mock.** Constraint 2 and
[ticket 16](./16-host-interface-dom-agnostic-renderer.md) exist so the renderer talks to a Host
interface with the DOM as one implementation. A Host that records every operation it receives
is a third implementation beside the DOM one and the server-string one — which is why this
layer costs nothing and why §7's assertion is available at all.

**One runner.** `playwright-core`'s library API is driven from ordinary `bun test` tests
rather than adopting `@playwright/test` and its separate runner, config and discovery.
`CLAUDE.md`'s "`bun test` — every test in the monorepo" stays true and CI keeps one step. The
usual reason to pay for the second runner is traces on failure, and that reason does not hold:
`context.tracing.start({ screenshots: true, snapshots: true })` is **library** API and the
trace opens in the same viewer. What is genuinely given up is retries, parallel workers and
the HTML report, over what will be a handful of tests.

**The browser target is local, and it gates `check.yml`.** Playwright drives the demo app
built by ursprung and served in-process through wrangler, on localhost. Driving the deployed
preview URL instead was rejected on a specific ground rather than on cost: `check.yml` (GitHub
Actions) and Workers Builds (Cloudflare) are **two CI systems with no handshake** — the preview
URL is announced as a pull request comment, which Actions has no handle on and no readiness
signal for — and Workers Builds does not build fork pull requests at all, so a gate depending
on it **fails open** for outside contributors. The coverage only a real deploy has (`noBundle`
upload, asset routing, `runWorkerFirst`, the custom domain) stays with
[ticket 21](./21-ursprung-to-wrangler-output-contract.md),
[ticket 23](./23-does-workers-builds-honour-build-command.md) and the per-release agent check
in §11.

**happy-dom and `playwright-core` are approved dev dependencies**, granted by the maintainer in
this session. That is constraint 6's stated mechanism working, the same shape as ticket 11's
`typescript` approval; its arithmetic changes again and the amendment is proposed on the map.
Both are test-only and never imported from `packages/ursprung/src`, so what someone installing
`ursprung` gets is unchanged.

### 3. Fixture applications: valid on disk, diagnostic inline

Ticket 10 made this a real choice rather than an obvious one. The virtual filesystem is a
**synchronous snapshot** exposing only `entries()` and `read()`, and the build derives every
path semantic from it — so a whole fixture application can be an object literal inside a test
file, with nothing on disk.

It is split instead, and **the split is the valid/invalid line**:

- A **valid** fixture application is a real directory under
  `packages/ursprung/tests/fixtures/<name>/`, read into a virtual filesystem snapshot by a test
  helper. Real `.tsx`, with editor support, covered by `bun run typecheck` and `oxlint`, and
  outside `src/` so the tarball excludes it without a rule being written.
- A fixture whose point is a **diagnostic** is an inline source literal in the test that
  asserts it.

The second half is what forces the split. A large class of fixtures is deliberately broken — a
non-erasable construct, an unsuffixed module, a CJS-only dependency, a duplicate route path.
As a directory each one breaks `bun run typecheck` and `bun run lint` for the whole repo, and
the remedy — exclude lists in `tsconfig` and `oxlint.config.ts` — hides the brokenness in a
config file far from the test that depends on it. Inline, the expected diagnostic sits beside
its input and the repo's own tooling never sees code that is broken on purpose. It also suits
ticket 10's batched diagnostics: error tests are many, small, and want locality.

### 4. Snapshots: inline only, structure only

Permitted, under two rules:

- **Never over generated code text.** The objection is not rot, it is that a code-text
  snapshot asserts the output is **unchanged** and never that it is **correct** — and validity
  is already covered properly by ticket 11's oracle 2 (every emitted module must parse), with
  behaviour above it at layer 1. A text snapshot sits underneath both and adds only churn, in
  the one place nobody will read the diff.
- **Inline only** (`toMatchInlineSnapshot`), never a file in `__snapshots__/`. A file snapshot
  updates invisibly; an inline one's blind update lands as a diff in the test file the reviewer
  already has open.

What they may cover is the **emission record** table — filename, provenance, generated kind,
each specifier and where it resolved, per-entrypoint reach. Small, semantic, reviewable.
Content hashes are normalised to a placeholder, since they change on every legitimate content
edit; hash **behaviour** gets explicit assertions instead (stable under reordering, changed on
content change, transitive over the condensation graph per ticket 14).

`bun test` supports both snapshot forms natively — verified, so this costs no tooling.

### 5. What proves the server-never-leaks invariant

Four things, and two of them are not obvious.

1. **A named smuggling corpus.** One case per known escape route, each asserting a **specific**
   diagnostic or a specific emission-record shape — never "this string is absent from the
   output", which only catches the leak you thought to plant. The routes v0 starts with:
   re-export chains, `export *`, a dynamic `import()` of a server module, a shared module
   importing a server module, a third-party module reaching first-party server code, a
   type-only import of a server module, a Data module reached from both sides, and
   `new URL(<server module>, import.meta.url)`. Grown by one case per bug, mirroring ticket
   11's golden-corpus discipline.
2. **A vacuity guard on every case.** An adversarial case is meaningful only if the construct
   it attacks was actually in the graph. A renamed suffix, a specifier that stops resolving or
   a route dropped from the table turns **every** leak test green at once — the worst failure
   mode a security test has. So each case first asserts its boundary edge is present, then
   asserts the outcome. Ticket 12 decision 9 materialises the **boundary-edge list** as a
   derived index so ticket 20 need not recompute it, which makes the guard a lookup rather than
   a second walker that can disagree with the first.
3. **A global provenance assertion** over every valid fixture build: no emitted client module's
   provenance is a server node except an `rpc-stub`, per ticket 12's refined decision 6.
4. **The byte-level re-parse ticket 12 declined.** Ticket 12 called it "the only thing that
   would also catch a server function body reaching the client through a mis-built stub" and
   declined it because it costs a second full parse of everything client-side **on every
   build**. That is a build cost. In the test suite it is nearly free, because ticket 11's
   oracle 2 already parses every emitted module for validity and the assertion rides a parse
   that is happening anyway. So v0 closes the gap ticket 12 named without production paying
   for it — and ticket 12's "if ticket 20's stub design turns out to be delicate, that is the
   lever to pull" no longer has to wait for delicacy to show up.

### 6. Determinism: three fixed orders, plus a lint ban

Ticket 10 ruled the hard part — byte-identical output for identical file contents **independent
of host** — and handed the test here as a named obligation, noting that "build twice, compare"
is insufficient because it holds under the weak guarantee too.

Every valid fixture is built through **three** virtual filesystems whose `entries()` enumerate
differently — **sorted**, **reversed**, and one **shuffle seeded from the fixture's own name** —
asserting byte equality across all three. All three are fixed, so a failure reproduces and
bisects. A randomised shuffle per run was rejected for exactly that: for a byte-equality
invariant, a red build that does not reproduce is close to unusable.

Enumeration order is one nondeterminism source; `Math.random()`, `Date.now()`, `new Date()` and
`crypto.getRandomValues()` are others, and no permutation catches them — they would make every
comparison fail intermittently instead. Those are **banned by lint** rather than tested for,
via `no-restricted-properties` and `no-restricted-globals` in an `overrides` entry scoped to
`packages/ursprung/src` in `oxlint.config.ts`. Both rules were verified to fire on this repo's
oxlint.

### 7. Resumption: the falsifiable "did not re-render" check

[Ticket 19](./19-resumability-wire-format.md) is owed a falsifiable check rather than a slogan.
It reads, in order of authority:

- **The assertion of record** is the Recording Host: after resumption and one dispatched event,
  **zero node-creation operations** and **exactly** the property writes the interaction should
  cause. It is falsifiable in both directions — a re-render shows up as a nonzero creation
  count, and an over-broad patch shows up as extra Host operations rather than passing quietly.
  It is sound here for an architecture-specific reason: ursprung has **no virtual DOM and no
  diffing**, so a component that re-executed would necessarily build an element tree, and
  building one means calling the Host.
- **Direct corroboration** on resumability fixtures, whose components increment a counter in a
  shared module the test reads. This exists because the Host assertion is an **inference** —
  it concludes "no component ran" from "no nodes were created" — and the inference holds only
  as long as the no-VDOM property does. A runtime test hook would be uniform and impossible to
  forget, and was rejected: it is production surface and a branch in the client hot path, in a
  framework whose entire pitch is that nothing runs on the client that does not have to. The
  accepted cost is that a fixture can forget to instrument, so the direct check covers only
  fixtures that opt in.
- **The browser layer asserts node identity**, since it can observe neither counter: mark
  server-rendered nodes, dispatch the interaction, assert the same node objects are still in
  place and only the intended text or attribute changed.

### 8. The published package is smoke-tested from a tarball

`bun pm pack`, install the tarball into a temporary directory, import every subpath. About
fifteen lines, and it covers a bug class **no in-repo test can see**, because the workspace
symlink resolves whatever `exports` and `files` say. `packages/ursprung` is genuinely
published, ships `src/index.ts` rather than a build artifact, and constraint 5 gives it four
subpaths (`ursprung/jsx-runtime`, `ursprung/client`, `ursprung/server`, `ursprung/build`) —
four ways for the manifest to be wrong in a way that only surfaces as a broken release.

### 9. Test-first, and the ordering it forces

Q1's answer creates a problem worth facing rather than working around: if the assertion of
record is executed output, then **the assertion of record does not exist** until parser,
resolver, graph and emitter all work. A strict red-green loop has nothing to be red against on
day one, and the strongest oracle would sit unused through exactly the period when the design
is most in flux.

So the **walking skeleton comes first**: the thinnest end-to-end slice — one route, one static
server component, no client modules, no reactivity, no API route — is the first implementation
ticket, so that a fixture application builds and runs before any feature exists. Every
capability after it lands test-first against a running application.

This is recorded as a **constraint on how implementation tickets are ordered** when they are cut
from the spec, not as a workflow preference. The cost is real and worth naming: the parser,
resolver, graph and emitter each get a deliberately incomplete first version, which is
uncomfortable precisely where tickets 11 and 12 have already specified the finished shape in
detail.

### 10. Coverage is measured, never gated

`bun test --coverage` stays available for finding a module nobody has tested; `check.yml`
enforces no threshold. A threshold stops measuring confidence and becomes a number tests are
written to satisfy — which on a from-scratch parser is especially easy, since executing a
branch and asserting anything about it are very different things.

### 11. What v0 does not test

Stated so the gaps are decisions. Five of these are forced by rulings above or elsewhere:

- **The real edge.** `noBundle` upload, asset routing, `runWorkerFirst`, the custom domain.
  Never in CI (§2); verified once per release by an agent against the branch preview URL —
  Chromium is available to agents and `chrome-devtools` is already declared in `.mcp.json`.
- **Cross-browser.** Chromium only. No Firefox, no WebKit, no mobile emulation.
- **Performance.** Ticket 11 §9 ruled no numeric CPU budget in v0; nothing measures build time
  or output size and no test fails on a regression in either.
- **`nodejs_compat` being enabled.** Constraint 15 states ursprung cannot check it; a fixture
  cannot either. It stays a startup failure, not a build failure.
- **Parser fuzzing, and Test262.** Ticket 11 rejected Test262 explicitly: with the parser a
  conservative acceptor, its value is in negative tests ursprung has decided not to implement.
- **Source maps** — out of scope. But the **obligation** is tested: that the emitter records a
  position per printed node is asserted directly, so the thing that keeps maps additive rather
  than a retrofit cannot rot silently.
- **Accessibility, visual regression, load and concurrency.**

### Obligations this hands to other tickets

- **[Ticket 16](./16-host-interface-dom-agnostic-renderer.md)** — the Host interface must be
  implementable as a **Recording Host**, and its operations must distinguish node creation from
  property writes, because §7's assertion counts the two separately. This is a constraint on
  the interface's shape, not merely on its existence.
- **[Ticket 19](./19-resumability-wire-format.md)** — the falsifiable check it was owed is §7;
  it inherits the harness rather than inventing one.
- **[Ticket 20](./20-server-boundary-transform-and-rpc-security.md)** — §5's smuggling corpus
  is the adversarial half of its security model, and §5.4 means a mis-built stub is caught in
  tests rather than only at review.
- **[Ticket 21](./21-ursprung-to-wrangler-output-contract.md)** — the deploy-shaped coverage
  CI declines in §2 lands on it, alongside the `nodejs_compat` rider ticket 13 already handed
  over.
