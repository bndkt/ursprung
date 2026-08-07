# 06 — The erasable TypeScript subset: exactly what survives type stripping

Type: research
Status: open
Blocked by: —
Map: [Ursprung v0](../map.md)

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
