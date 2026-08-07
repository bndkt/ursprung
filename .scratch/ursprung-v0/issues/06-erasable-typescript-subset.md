# 06 — The erasable TypeScript subset: exactly what survives type stripping

Type: research
Status: resolved
Blocked by: —
Map: [ursprung v0](../map.md)

## Question

Constraint 8 says our parser treats type syntax as opaque delete-spans and errors loudly
on anything non-erasable. That promise is only as good as our list of what "erasable"
means. Ticket 11 designs the parser against this list, so the list has to be exhaustive
and precise, not approximate.

Establish from primary sources — the TypeScript documentation and release notes for
`erasableSyntaxOnly`, TypeScript's own implementation of that check, the Node.js type
stripping documentation, and the relevant TC39/Node proposals:

- The **complete list of constructs `erasableSyntaxOnly` rejects**, with an example of
  each: `enum` (and `const enum`), `namespace`/`module` with a runtime value,
  parameter properties, `import =`/`export =`, legacy decorators, and anything else the
  compiler actually flags. Quote the error codes.
- The **complete list of erasable type syntax** a stripper must recognise and delete,
  which is the harder half: type annotations on variables, parameters, returns and
  properties; `interface` and `type` declarations; generic parameter and argument lists;
  `as` and `satisfies` and angle-bracket assertions; non-null `!`; `declare` on every
  declaration form; `abstract`; `implements` clauses; `public`/`private`/`protected`/
  `readonly`/`override` modifiers; optional markers on parameters and members; index
  signatures; `import type` and inline `type` specifiers; definite assignment `!:`;
  overload signatures with no implementation; `this` parameters; `accessor` — and
  anything this list has missed.
- The **genuinely ambiguous cases** where stripping is not a pure deletion and a naive
  stripper gets it wrong. Node's documentation and the type-stripping implementations
  discuss these. Specifically: why erasure must preserve source positions or produce a
  source map, what happens to a type-only import that also has value imports, how
  `<T>(x)` in a `.tsx` file is parsed, and the ASI hazards of deleting a span.
- **Does `.tsx` change the answer?** Document where TSX and TS parse differently — angle
  bracket assertions, generic arrow functions requiring a trailing comma — since we parse
  both.
- Whether **whitespace-preserving erasure** (blanking a span rather than removing it) is
  what the established implementations do, and why. This decides whether we need source
  maps at all, which matters because constraint on the map rules source maps out of v0.
- How TypeScript's `verbatimModuleSyntax` and `isolatedModules` relate, and whether we
  should require applications to enable any of these flags.

Write the findings to `.scratch/ursprung-v0/research/06-erasable-typescript.md`, citing
sources. The deliverable that matters most is the two exhaustive lists — reject, and
delete — since ticket 11 will turn them directly into parser behaviour.

## Answer

Findings: [`research/06-erasable-typescript.md`](../research/06-erasable-typescript.md).
Claims are tagged [V] where executed against TypeScript 5.9.3/6.0.3, `ts-blank-space`,
`amaro` and this repo's `workerd` binary over ~150 hand-built cases, and [D] where read
from documentation or source.

**The reject list is complete by construction.** `erasableSyntaxOnly` has exactly one
error code — TS1294 — and exactly six checker call sites: `enum`, parameter property,
instantiated namespace/module, `import =`, `export =`, and `<T>expr` assertions. Because
it is a _semantic_ diagnostic rather than a syntactic one, it cannot be lifted from a
parse; ursprung reimplements the check rather than inheriting it.

**This ticket's premise was wrong, and the correction matters.** `erasableSyntaxOnly`
does **not** reject legacy decorators, standard decorators, or `accessor` — all three
compile clean. Verified here directly: given a file containing a decorated method, an
`accessor` field and an `enum`, `tsc` flags only the `enum`. All three are nonetheless
hard `SyntaxError`s on workerd. So **ursprung's reject list must be strictly larger than
TypeScript's**, and "we accept whatever `erasableSyntaxOnly` accepts" — which is roughly
how the map's constraint 8 is phrased — is not a safe rule. Ticket 11 owns this.

**The delete list** is 19 whole-statement forms and 38 fragment positions, enumerated
against TypeScript's `SyntaxKind` table rather than from memory. One entry is a live
hazard for us: JSX element type arguments are erased by `tsc` but **missed by
`ts-blank-space`** — and we parse JSX.

**Stripping is not pure deletion in six places**, each documented with the rule:
the `f<a>(b)` speculation, `as`/`satisfies` binary regrouping, illegal `??` mixing, ASI
semicolon injection, and two line-break-sensitive paren moves. Both reference
implementations still emit invalid JavaScript for `!x as any ** 2` — a bug ursprung
would inherit by copying them.

**Whitespace-preserving blanking is universal and exact**, which confirms the map's
decision to ship no source maps in v0: build diagnostics get original positions for free.

**One genuine conflict with the map.** With no type model, ursprung cannot perform import
elision. So `verbatimModuleSyntax` semantics have to become a documented hard requirement
on the application's `tsconfig`, and — importantly for ticket 12 — `import { type A }`
leaves a live `import {} from "x"` graph edge while `import type { A }` removes it
entirely. Colouring must distinguish the two. This surfaced a question nobody had asked,
now ticket 24.
