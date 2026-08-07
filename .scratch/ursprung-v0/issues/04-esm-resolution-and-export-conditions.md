# 04 — ESM resolution and export conditions on workerd and in the browser

Type: research
Status: open
Blocked by: —
Map: [Ursprung v0](../map.md)

## Question

Constraint 7 means Ursprung resolves real npm packages; constraint 14 means ESM only;
constraint 13 means resolution is a pure read over a virtual filesystem. Ticket 13
writes our resolution rules. This ticket gathers the algorithm and the platform facts.

Establish from primary sources — the Node.js ESM resolution documentation and its
specified algorithm, the `workerd` source or Cloudflare's own docs, and the WinterCG /
Runtime Keys registry:

- The **ESM resolution algorithm** as Node specifies it, in enough detail to implement:
  `exports` maps (string, object, array, nested conditions, subpath patterns with `*`),
  the `imports` field and `#` specifiers, self-referencing by package name, `main` and
  `module` and when each applies, extension probing, directory index resolution, and
  the `type` field's role.
- Which parts of that algorithm are **load-bearing for ESM-only packages** and which
  exist only for CJS or legacy packages — we want to implement the smallest correct
  subset, so mark what we can skip.
- **Condition names**: the full registered set, what `workerd` recognises and in what
  order, what browsers/bundlers conventionally use, and how `development`/`production`
  interact. Recommend a concrete ordered condition list for our server target and our
  client target.
- How do real, current ESM-only packages actually declare themselves? Sample a handful
  of well-known ones and document the patterns that appear in practice, including the
  awkward ones (conditional `browser`/`worker` splits, subpath wildcards, packages that
  ship both).
- **How is a CJS-only package detectable** cheaply and reliably, so we can produce the
  hard error constraint 14 requires rather than failing mysteriously later?
- What does `nodejs_compat` actually provide on Workers today, which `node:*` builtins
  are covered, and how is it enabled? Constraint 15 leaves these external on the server.
- Are there any traps for a resolver that must run **inside a Worker** — case
  sensitivity, symlinks in `node_modules`, path length, or anything else that a
  real-filesystem resolver gets for free?

Write the findings to `.scratch/ursprung-v0/research/04-resolution.md`, citing sources.
