# 24 — What ursprung requires of an application's tsconfig

Type: grilling
Status: open
Blocked by: —
Map: [ursprung v0](../map.md)
Graduated from: [06 — The erasable TypeScript subset](./06-erasable-typescript-subset.md)

## Question

Nobody had asked this until ticket 06 forced it. ursprung has no type model and no type
checker, so there is a class of correctness that it **cannot** establish and must instead
require the application to have established. That requirement has to be written down,
and we have to decide whether it is enforced or merely documented.

Ticket 06 found the specific trigger: **without a type model, ursprung cannot perform
import elision.** TypeScript normally drops an import that turns out to be type-only; we
cannot know that. So `verbatimModuleSyntax` semantics become load-bearing —
`import { type A } from "x"` leaves a live `import {} from "x"` edge in the graph, while
`import type { A } from "x"` removes it entirely. Two spellings the language treats as
near-equivalent are, for us, the difference between a module being in the bundle and not.

Decide:

- **The required compiler options**, each with the reason it is required rather than
  merely recommended. `verbatimModuleSyntax` and `erasableSyntaxOnly` are the obvious
  candidates; ticket 06's findings will suggest others, and note that `erasableSyntaxOnly`
  is **not sufficient** — it permits decorators and `accessor`, which are `SyntaxError`s
  on workerd, so ursprung's own reject list is strictly larger.
- **Does ursprung read and validate the application's `tsconfig.json`?** Validating means
  parsing JSONC and resolving `extends` chains — real work, and constraint 13 means we
  cannot assume a real filesystem, though we do have the VFS. Not validating means a
  misconfigured app fails later with a confusing error. There is a third option: ignore
  the tsconfig entirely and enforce the same rules directly in the parser, where the
  error can point at the offending line. That may be strictly better — argue it.
- **What the failure looks like.** If an app writes `import { type A }` without
  `verbatimModuleSyntax`, what does the author see? Silence and a mysteriously large
  bundle is the worst outcome, and it is the default one.
- **Does ursprung ship a base tsconfig** for applications to extend, and does the
  published package expose it? This repo already has a `tsconfig.base.json` pattern to
  copy from.
- **Type checking is not our job — say so explicitly.** ursprung never type-checks; the
  author runs `tsc --noEmit` themselves. Decide whether that is documented guidance or
  whether the CLI has anything to say about it, and make sure the spec states plainly
  that a build succeeding implies nothing about type correctness.
- **The `jsx`/`jsxImportSource` options** required for ticket 15's runtime — they belong
  in this list too.
