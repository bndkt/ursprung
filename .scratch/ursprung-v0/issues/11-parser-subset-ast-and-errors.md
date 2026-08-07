# 11 — The parser: accepted subset, AST shape, and error reporting

Type: grilling
Status: open
Blocked by: 06
Map: [ursprung v0](../map.md)

## Question

Constraint 8: a real AST for expressions, statements, imports and JSX; type syntax as
opaque delete-spans; no type model, no scope model; loud errors on non-erasable
constructs. Ticket 06 supplies the exhaustive lists of what to reject and what to delete.
This ticket decides how the parser is built. It is the largest single piece of
engineering in v0 and the one most likely to be underestimated.

Decide:

- **How much of JavaScript do we parse?** "The latest platform capabilities" is not a
  specification. We need an actual answer for the long tail: regex literals versus
  division ambiguity, ASI, template literals and nesting, destructuring patterns,
  optional chaining, classes with private fields and static blocks, generators, `using`
  declarations, top-level await, dynamic `import()`, `import.meta`. Which are in v0 and
  which are a build error?
- **Do we need a full expression parser at all?** Provocation worth taking seriously:
  our transformations are narrow — rewrite JSX, rewrite imports/exports, delete type
  spans. Everything else could in principle be passed through as opaque source. Argue
  whether a _partial_ parser that only builds structure where we transform is viable, or
  whether ambiguity (regex/division, JSX in expression position, ASI) makes it a trap.
  The answer decides the size of the whole bundler.
- **The AST shape.** ESTree-compatible, or our own? ESTree buys familiarity and a
  reference to check against; our own buys the freedom to carry delete-spans and
  ursprung-specific nodes without pretending to be something else. Neither is obviously
  right.
- **Erasure strategy.** Ticket 06 will report whether established implementations blank
  spans with whitespace to preserve source positions. Decide whether we do the same —
  it is the cheapest thing that keeps error positions honest without source maps, which
  are out of scope for v0.
- **JSX.** Where does JSX get transformed — during parse, or as a separate pass over the
  AST? How are the JSX-specific parse hazards handled (`<T>` in `.tsx`, entities,
  whitespace significance between elements, spread children, namespaced attributes)?
- **Error reporting.** Line/column, the offending source span, and a message that tells
  an agent what to write instead. Non-erasable constructs get a specific message naming
  the construct, not a parse failure. Decide the diagnostic shape here so every later
  build stage can use it.
- **How do we know it is correct?** Test262 is enormous and mostly irrelevant to us.
  Decide the strategy: a golden corpus, differential testing against another parser, or
  fuzzing round-trips. Coordinate with ticket 22.
- **Performance.** It runs inside a Worker under a CPU limit. Is there a budget, and does
  it change the design — single pass, no backtracking, no regex-based lexing?

## Established by ticket 06 — read before starting

[The erasable TypeScript research](../research/06-erasable-typescript.md) supplies both
exhaustive lists this ticket needs, and corrects one premise this ticket inherited:

- **`erasableSyntaxOnly` is not sufficient as our accepted subset.** It permits legacy
  decorators, standard decorators and `accessor`, all three of which are hard
  `SyntaxError`s on workerd. ursprung's reject list is strictly larger and is our own.
- The reject list is otherwise complete by construction: one error code (TS1294), six
  checker call sites. It is a _semantic_ diagnostic, so we reimplement rather than lift
  it from a parse.
- The delete list is 19 whole-statement forms and 38 fragment positions. JSX element type
  arguments are in it — erased by `tsc`, **missed by `ts-blank-space`** — and we parse JSX.
- **Stripping is not pure deletion in six places**, each with a documented rule. Both
  reference implementations still emit invalid JavaScript for `!x as any ** 2`; copying
  them inherits the bug.
- **Whitespace-preserving blanking is exact**, so error positions come free and the
  no-source-maps decision holds.
