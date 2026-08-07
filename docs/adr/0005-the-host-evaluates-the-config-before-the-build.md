# The host evaluates the config before the build

The Config file is a TypeScript module, and it is **evaluated** — by the host, before the
build function is called. `ursprung build` performs a native `import()` of
`ursprung.config.ts` and hands the build `{ vfs, config }`, where `config` is already
plain data. The build itself evaluates nothing.

We first designed the opposite: the bundler would read the route tree as data out of the
AST, never running it. That was rejected because a `.ts` file that is read rather than run
is a trap — `process.env`, `new Date()`, a loop over locales all typecheck, all look
correct, and all silently do nothing. Evaluating it also buys what the read-only form
could not: dynamic configuration, and route subtrees composed from other files.

## Considered options

**Read the route tree from the AST.** The original design. Its stated justification was
that evaluating the config would require building it first, and building is what needs the
route tree. **That argument is wrong and must not be reused**: it conflates two graphs.
Building the _config_ graph needs resolution and type stripping, neither of which needs
the route tree; the route tree is required only to emit _route_ bundles. Two phases, no
cycle.

**Evaluate inside the build, through an injected evaluator.** Uniform with the injected
virtual filesystem, but it puts a second capability into the build's interface and makes
every host implement code execution. `eval()` and `new Function()` are disallowed on
workerd, so a Worker host would need the Dynamic Workers `worker_loaders` binding — a
beta API, and unresearched.

**Make the config JSON.** Honest by construction, and it answers the affordance objection
the other way. It costs typed configuration, typed route trees, references resolved
against `import.meta.url`, and any composition across files.

## Consequences

**Constraint 4 survives unamended.** It binds _build modules_ — "every build module takes
an injected virtual filesystem and touches no Node API". Evaluation happens outside the
build entirely, so the build stays pure and build-in-a-Worker stays reachable: such a host
supplies the evaluated data by whatever means it has.

**The build never sees the Config file or the Route file.** Neither is a module in the
graph, so neither carries a `.server.`/`.client.`/`.shared.` suffix, and any module in the
graph that imports one is a constraint 9 error. The runtime router therefore cannot import
the Route file — the route table is generated and emitted by the bundler instead.

**Module references had to become data.** A `() => import("./x.server.tsx")` thunk is
opaque to an evaluator; the build cannot look inside it and must not call it, since that
would execute application modules at build time. References are
`new URL(specifier, import.meta.url)`, which composes across files because each resolves
against its own module. The accepted cost is that a reference carries no type link to the
module it names, so an API route's export name is an unchecked string.

**Evaluation produces host-shaped identifiers**, so the host normalises them to
VFS-relative paths at the boundary. `import.meta.url` is a `file://` URL under Bun and
something else in a Worker; the build only ever sees VFS paths.

Wrangler loads its own experimental TypeScript config exactly this way — a bare
`await import(pathToFileURL(configPath))`, relying on Node ≥22.18's native type stripping,
which is where that version floor comes from. Its `registerHooks` machinery is not part of
the evaluation: it exists for watch-mode cache-busting, which constraint 11 rules out here,
and for the `cf-worker` import attribute.
