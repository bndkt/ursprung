# 28 — workerd's new module registry: status, semantics, and what it would mean for ursprung

Type: research
Status: resolved
Blocked by: —
Map: [ursprung v0](../map.md)
Graduated from: [14 — Emission: module naming, specifier rewriting](./14-emission-naming-and-specifier-rewriting.md)

## Question

[Ticket 14](./14-emission-naming-and-specifier-rewriting.md) §8 ruled that ursprung designs for
workerd's **legacy** module registry, rejecting a proposal to target `new_module_registry`
instead. That ruling rested on three claims, two of which were inferences rather than
established facts: that an `$experimental` flag cannot be set on a deployed Worker, and that the
trade is bad on its merits.

The ruling deserves the evidence it was made on. Establish, from primary sources:

- **Status.** Is `newModuleRegistry` still `$experimental` with no `$compatEnableDate`? What has
  changed since ticket 27 read workerd at `22b2a002`, and is there a public rollout signal?
- **Availability.** Can an `$experimental` flag reach a production Worker at all — and does any
  local tooling warn if it cannot?
- **What the new registry is**, architecturally, and **every behavioural difference** from the
  legacy one.
- **What it would mean for ursprung**, checked against the resolved decisions rather than in the
  abstract: ticket 14 §2/§6/§8, ADR-0010, ticket 13, ticket 12, ticket 27.
- **The bottom line**: keep designing for legacy? What would have to become true to revisit, and
  what should ursprung do now to stay cheap to migrate?

## Answer

Full findings in [research §28](../research/28-new-module-registry.md), pinned to workerd
`a955a877` (2026-08-08, `main`). Unusually for a research ticket, much of it is **executed**
rather than read — the repo's own workerd `1.20260730.1` run under `wrangler dev` with and
without the flag, marked `[RUN]`.

**The ruling holds, and two of its three grounds got stronger.** Keep designing for the legacy
registry — not as a compromise, but because the legacy-safe rule set is strictly safer *and*
valid on the new registry.

### 1. Status: unchanged, but visibly being prepared

`newModuleRegistry @52` is still `$experimental` with **no `$compatEnableDate`**; the annotation
lines are byte-identical to `22b2a002`. The direction of travel is unmistakable — a commit
"Make module tests registry-agnostic **ahead of NMR enablement**", a merge of branch
`jsnell/nmr-**ga**-review`, and a `features.h` comment reading "once the flag gains an enable
date" — but there is no public rollout issue, and the flag is still absent from Cloudflare's
compatibility-flags page. **Landed in workerd ≠ shipped on Cloudflare**, the same warning the map
already carries about `nodeJsCompat`'s `$compatEnableDate("2026-08-04")`.

### 2. Availability: settled, and worse than ticket 14 assumed

**An `$experimental` flag cannot be used on a Worker deployed to Cloudflare.** workerd says so in
the annotation's own definition — *"Experimental flags cannot be used in Workers deployed on
Cloudflare except by test accounts belonging to Cloudflare team members"* — and enforces it in
`compileCompatibilityFlags`, whose `CURRENT_DATE_FOR_CLOUDFLARE` branch (documented "This should
ONLY be used by Cloudflare") emits *"is experimental and cannot yet be used in Workers deployed
to Cloudflare."* The `allowedExperimentalFlags` escape hatch is a validator parameter, not
reachable from a `compatibility_flags` array.

**The trap worth remembering: neither `wrangler deploy --dry-run` nor `wrangler dev` gives any
signal.** Wrangler performs no client-side flag validation, and locally the flag simply works.
The failure arrives only at a real deploy.

### 3. The behavioural differences that matter

- **A query string mints a real second instance with duplicated live module state** — proven by
  a counter probe, not by reading a fixture. Ticket 27 §6.2 reached the right conclusion from a
  workerd test that exports only constants and therefore proves nothing about state.
- **Compilation really is lazy.** An unreferenced syntax-error module stops the legacy Worker
  booting and is ignored by the new one.
- **Unsettleable top-level await degrades from a throw to a hang.** Legacy rejects with
  `Top-level await in module is unsettled.`; the new registry leaves the `import()` pending
  indefinitely. A TLA settling within one microtask works on both; one awaiting a timer fails on
  both, since the `IoContext` is suppressed either way.
- **Specifier shape diverges in both directions.** The new registry is stricter about paths
  (`/x.js` and `.//x.js` both fail) and looser about URL syntax. `./<sibling>.js` — ticket 14
  §6's choice — is the only form safe on both.

### 4. Consequences for the resolved decisions

**ADR-0010's content hashing, ticket 13's resolution rules and ticket 12's
one-instance-per-specifier reasoning are all untouched.** Two corrections landed, both to a
stated *reason* rather than to a decision, and both are folded in:

- **Ticket 14 §6** described a legacy failure mode that does not exist: legacy `./x.js?v=2`
  throws `No such module`, it does not mint a second instance. The silent duplication is
  **new-registry-only**. Corrected in place.
- **Ticket 14 §8's** "nothing changes if the flag ever ships" was too generous. Given the
  throw-to-hang degradation, the build error becomes the *only* legible report if the flag ships,
  so the rule matters **more**, not less. Sharpened in place.
- **Ticket 27 §3.2** quantified the request-CPU charge against a 30 s ceiling. That is the
  **Paid** plan; the **Free** plan is **10 ms**, a hundred times *smaller* than the 1 s startup
  budget the charge moves off. Commented on ticket 27.

### 5. What the new registry would enable

**One thing that changes an architectural claim: lazy compilation.** Ticket 27's unanticipated
finding — every uploaded module is V8-compiled at startup regardless, so splitting by Route does
not keep startup flat — is a **legacy-registry** fact. On the new registry, splitting by Route
*does* keep startup flat, which is what would let the Route-per-module architecture scale to a
large route tree. That is the real prize, and it is the reason to keep watching.

The rest is minor: a defined `import.meta.url` (which would quieten, not fix, ticket 14 §9's
hole), real import attributes (blocked anyway by Wrangler's `rules`), and free cross-isolate
compile caching.

### 6. The revisit trigger, and what to do now

**One observable, cheap to check: `newModuleRegistry` gains a `$compatEnableDate`, or loses
`$experimental`.** Nothing else counts — GA-review branches are intent, not availability.

**Migration cost is already near zero, which is a result rather than an absence**: every rule
already recorded is valid under both registries, so the emitted output is identical either way
and the day the flag ships ursprung's modules run unchanged and get lazy compilation for free.
Three cheap disciplines, two now done:

1. Restate the no-query-string reason per registry — **done**, ticket 14 §6.
2. Amend ticket 14 §8's reason, not its decision — **done**.
3. **Never pattern-match a workerd module-error string.** Every message differs between
   registries. Nothing does this today; the discipline costs nothing and discovering it later
   costs a broken test suite on the day the flag flips.

**And one thing not to do:** no `new_module_registry` escape hatch, config toggle or second
emission mode "for later". The whole point of a rule set valid under both is that no second mode
is needed.

### Nothing left open — one raised question was already answered

The research file's §6.2 closes by asking whether a query-bearing specifier written in
**application code** — `import("./thing.js?raw")` — should be a build error, on the reading that
ticket 12 §3 would resolve it and rewrite the query silently away.

**It is already a build error, and has been since ticket 13.** §1's specifier-kind table lists
`Carrying ? or #` → *error*, with `./x.ts?raw` as its own example, and §10 gives it a dedicated
diagnostic code, **`URS2006` — `?query` or `#fragment` in a specifier**. A dynamic `import()`
with a literal specifier resolves through the same resolver as a static one, so it is rejected on
the same rule. The premise that the query "would vanish" is wrong: resolution never gets far
enough to rewrite anything.

So the no-query-string discipline is enforced at **both** ends independently — the resolver
refuses to accept one on input (ticket 13), and the emitter has no code path that could produce
one on output (ADR-0010 hashes into the filename; ticket 14 §6 emits `./<filename>` and nothing
else). That is the right shape for a rule whose violation is silent on one of the two registries,
and it needs no addition.
