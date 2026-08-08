# First-party specifiers carry the source extension

A relative import in an ursprung application names the file **as it exists**, extension
included:

```ts
import { type Build, formatDuration } from "../format.shared.ts";
import WatchToggle from "./watch-toggle.client.tsx";
```

The specifier **is** a virtual filesystem path. The resolver performs no mapping on it —
no `.js` → `.ts` rewrite, no extension probing, no directory index. A specifier that does
not name an existing file is a build error, never a search.

The rule is not limited to first-party code; it is simply most visible there. Extensions
are classified by suffix and never by location, so `.ts` and `.tsx` are parsed and
type-stripped whether or not the real path runs through `node_modules`. That is forced
rather than chosen: the published `ursprung` package points its `exports` at
`./src/index.ts`, so ursprung's own resolver must accept TypeScript from a dependency.

## Considered options

**TypeScript's NodeNext convention** — the author writes `./format.shared.js` and the
resolver maps it back to `./format.shared.ts`. This is what `moduleResolution: "NodeNext"`
asks for and what most TypeScript users expect. Rejected because the specifier then names
a file that does not exist anywhere: not in the source tree, and not in the output either,
where the emitted module is content-hashed under a different name entirely. The mapping is
also not a single rule but a probe order — `.ts`, then `.tsx`, then the literal `.js` — and
a probe order is exactly the class of logic this project exists to delete.

**Extensionless specifiers with probing** — `./format.shared`. Rejected outright: Node's
ESM resolver does no extension searching, this is `require()` behaviour, and adopting it
would put ursprung further from the platform than the ecosystem's own bundlers are.

## Consequences

The resolver loses a whole category of code. There is no candidate list, no probe order, no
"did it mean the `.ts` or the `.js`" ambiguity, and no divergence between what the author
wrote and what the graph keys on. A specifier is a lookup in an immutable map, which is
also what makes the resolver table-driven testable with no host at all.

It costs surprise, and the surprise is permanent, because this is the authoring surface
rather than an implementation detail. Anyone arriving from Node or from a TypeScript
project configured for NodeNext will write `.js` first and get an error. The error is at
least exact — the file it names does not exist, and the file that does is one character
away.

It fixes an application's tsconfig: `allowImportingTsExtensions` must be on, with a
`moduleResolution` that permits it. This repo already sits there, and so does the ticket-07
demo-app prototype, which was written with literal `.ts` and `.tsx` extensions throughout
before this was decided — the convention was already load-bearing in practice.

The decision is reversible only in the expensive direction. Accepting `.js`-means-`.ts`
later is additive and would not break existing applications; going the other way, from a
NodeNext-style surface to literal extensions, would rewrite every import in every
application. Starting strict keeps the cheap move available.
