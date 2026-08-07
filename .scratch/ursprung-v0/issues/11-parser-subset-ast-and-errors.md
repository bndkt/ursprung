# 11 — The parser: accepted subset, AST shape, and error reporting

Type: grilling
Status: resolved
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

## Answer

Recorded as [ADR-0007](../../../docs/adr/0007-the-emitter-prints-from-the-ast.md), which
holds the hard-to-reverse half.

### 1. A full parser, and the reason the cheap option dies

**ursprung builds a complete ECMAScript statement and expression parser**, with operator
precedence and bounded backtracking. Type syntax is parsed only far enough to find where
it ends — research §3C's grammar, never a type AST. No binding model, no scope model, no
type model, so constraint 8 survives intact.

The ticket's own provocation — a partial parser that builds structure only where we
transform — was taken seriously and does not survive. It has to get past four independent
ambiguities and gets past none of them:

- **Regex versus division.** `/` is only classifiable from the parse context, and the two
  tokens that most need disambiguating are the two a lexer cannot read: `}` (block end or
  object literal end) and `)` (an `if` head, after which a regex may start, or a call, after
  which it may not).
- **The arrow-parameter colon.** `(a: T) => x` versus `a ? b : c`. Knowing that `: T` is a
  deletable annotation and not a conditional's colon requires knowing you are in a
  parameter list, which requires having parsed one.
- **`.tsx`'s bare `<`.** Either a JSX element or a generic arrow's type parameters.
- **Research §5.1's `f<a>(b)` speculation**, which the research already established needs
  backtracking and cannot be decided locally.

The three hazards research §5 flagged as "not local" — the speculation, the `as` precedence
check, the ASI bit threaded through statement-list walking — are therefore all in, and were
budgeted rather than discovered, which was that section's ask.

### 2. Output is printed from the AST, with verbatim spans for pure JavaScript

Not the whitespace-blanking edit list every reference implementation uses. **The printer's
leaf case is "copy this source span byte-for-byte."** During parse each subtree carries a
purity flag, computed bottom-up in the same pass: a subtree is pure when it contains no
erasable syntax and no JSX. Pure subtrees print verbatim; everything else prints properly.

This is the ticket's largest decision and it pays for itself four times over. **It dissolves
four of research §5's six hazards outright**, because all four are emit problems that a
precedence-aware printer simply does not have:

| Research §5 hazard | Under a printer |
| --- | --- |
| §5.2 binary regrouping — `1 + 1 as any / 2` | prints `(1 + 1) / 2`. **Accepted, not rejected** |
| §5.3 illegal `??` mix — `a ?? b as any && c` | prints `a ?? (b && c)`. **Accepted** |
| §5.4 unary base before `**` — `!x as any ** 2` | prints `(!x) ** 2`. **Accepted** |
| §5.5 ASI semicolon injection | printed statements carry explicit semicolons |
| §5.6 two line-break paren moves | the printer chooses the line breaks |
| B18 JSX element type arguments | not printed |

So **ursprung is strictly more correct here than both reference implementations** —
`ts-blank-space` and `amaro` reject the first two and silently emit invalid JavaScript for
the third — and **ursprung's reject list shrinks** rather than growing as research §6
projected. Only two of §5's cases survive, and both survive because they are parse-time
rather than emit-time: §5.1's speculation, and §5.7's `import { type A }` leaving a live
graph edge where `import type { A }` removes it, which is ticket 12's to carry.

It also makes synthesis native rather than a splice. ursprung has to *generate* code in at
least three places — the JSX call form, ticket 20's RPC stubs, ticket 08's generated route
table — and none of those has a source span to edit.

Two further consequences fall out for free:

- **Never re-escaping a literal.** Strings, templates, regexes and numeric literals contain
  no type syntax and no JSX, so they are always pure and always verbatim. The printer never
  has to reproduce an escape sequence or a numeric format.
- **A third-party module is almost entirely verbatim.** It has no TypeScript and no JSX, so
  its whole body is pure; only import and export statements print, and only because their
  specifiers may need rewriting. Emission of npm dependencies is close to a byte copy
  without that being a special case anyone wrote.

**The cost, stated plainly, because it reverses a recorded finding.** Ticket 06 concluded
that whitespace-preserving blanking is exact "so error positions come free and the
no-source-maps decision holds". Half of that is still true and half is now void. Build
diagnostics are unaffected — they are computed against the original module text and always
were. But **printing breaks output positions**, and verbatim spans do not rescue them: a
verbatim subtree preserves its own bytes, not its offset, so one printed statement earlier
in the file shifts everything after it. A production stack trace from workerd therefore
cannot be mapped back to a module. See the proposal on the map: source maps are still out
of scope, but the *reason* recorded for that is now wrong, and it is the maintainer's call.

### 3. The parser is a conservative acceptor, not a JavaScript validator

It reports a syntax error where it genuinely cannot build an AST — unbalanced delimiters,
unexpected tokens, malformed literals — which is essentially every real typo. It implements
**none of ECMAScript's early errors**: duplicate `let` bindings, invalid assignment targets,
`delete x` under strict mode, duplicate `__proto__`, `await` in the wrong context. Several
of those need the binding model constraint 8 rules out, the rest are an arbitrary line
drawn through one spec chapter, and V8 reports all of them anyway.

Said positively: **ursprung's diagnostics are about ursprung's rules** — the reject list,
side declarations, resolution, colouring. JavaScript validity belongs to `tsc` and to the
host. The published subset must say this out loud, because "the build succeeded" will not
mean "this is valid JavaScript".

### 4. The accepted grammar: a pinned edition plus ten named rejections

The grammar is **written down as a pinned edition — ES2025 plus named stage-4 additions —
and covers the whole long tail** the ticket listed: regex literals, ASI, nested template
literals, destructuring patterns, optional chaining, private fields and `#x in obj`, static
blocks, generators, `using` and `await using`, top-level await, dynamic `import()`,
`import.meta`. Nothing is excluded for economy, because **rejecting a construct costs the
same as parsing it** — you cannot report what you did not recognise.

**There is no target-support policy.** ursprung downlevels nothing, so syntax a host lacks
is a runtime error there, exactly as with any non-transpiling bundler. The alternative —
deriving the accepted grammar from the pinned compatibility date, symmetric with
constraint 15's native-module rule — was rejected on two grounds: it needs a research
ticket to establish the set and re-derivation on every compat-date bump, and it has no
answer at all for the client half, where there is no compatibility date to derive from.

**The ten rejections.** Research §1's six, which are `erasableSyntaxOnly`'s six:

1. `enum` and `const enum`
2. Parameter properties — `constructor(private x: number)`
3. An instantiated `namespace` / `module` (one whose body declares a value; a `declare`d or
   type-only one is erasable). The instantiation test is a syntactic scan of the body for a
   value declaration, so no type model is needed
4. `import x = require("y")` and `import x = A.B`
5. `export = x`
6. The angle-bracket assertion `<T>expr`

Plus four research §2 established `erasableSyntaxOnly` wrongly permits:

7. Legacy decorators
8. Standard (TC39) decorators
9. `accessor` fields
10. `export as namespace Foo`

Items 7–9 are hard `SyntaxError`s on workerd, verified against this repo's binary, so
accepting them ships a broken bundle; item 7 additionally requires runtime helper emit
ursprung will never do.

**Item 6 is a judgement call, flagged as cheap to reverse.** The printer could handle
`<T>expr` — `return <T>x` prints as `return x;`, and the semicolon-injection problem that
puts it on every other implementation's reject list does not exist here. It stays rejected
for two reasons: it preserves the **one-way guarantee** that anything passing
`tsc --erasableSyntaxOnly` passes ursprung, and accepting it would mean `.ts` and `.tsx`
accept genuinely different languages, since in `.tsx` the same bytes are JSX.

**Explicitly not rejected**, against research §6's recommendation, because §2 above handles
them: binary regrouping, the `??` mix, and the unary-`**` hole.

**`.ts` versus `.tsx` differ by exactly one disambiguation rule.** Research §4 found two
differences; since `<T>expr` is on the reject list in `.ts` anyway, only the generic-arrow
rule remains — in `.tsx` a type parameter list needs `,` or `extends` after the first
parameter.

### 5. The AST

**ursprung's own, not ESTree.** ESTree has no place for the two things the printer design
requires on every node — a source span and the purity flag — and its TypeScript extension
models type syntax as a full node tree, which is precisely what "types are opaque spans"
refuses to build. Node type names follow ESTree wherever one corresponds, for familiarity
and for nothing else; there is no compatibility obligation and no ESTree consumer.

Every node carries: a `kind` tag, a `span` into the decoded module text, and `pure`. Type
syntax appears as a single opaque span node with no interior structure.

### 6. JSX

**Parsed into AST nodes, not transformed during parse.** It cannot be deferred past the
parser — the `<` disambiguation is a parse-time decision — but the *call shape* it prints
to belongs to **ticket 15**, which owns the JSX runtime contract. The parser's obligation
is to hand ticket 15 a faithful tree; the printer emits whatever ticket 15 specifies.

- **The full HTML named entity table.** `&nbsp;`, `&mdash;`, `&copy;` and the rest decode at
  build time, as they do in every other JSX implementation. This is required rather than
  cosmetic: text reaches the DOM host through `textContent` and the server host as an
  escaped string, so nothing downstream ever decodes an entity — if the build does not, the
  author sees six literal characters with no error. Costs a generated table of ~2,200
  entries, roughly 40KB, which is not a meaningful weight.
- **React's text-trimming rule verbatim** — blank lines dropped, leading and trailing
  whitespace containing a newline trimmed, remaining lines joined with a single space.
  Adopted rather than reinvented because deviating is a permanent papercut with no upside.
- **In**: fragments, member expression names (`<Foo.Bar/>`), namespaced attributes
  (`xlink:href`), which SVG needs.
- **Parsed and not printed**: JSX element type arguments, `<Comp<number> />` — research's
  B18, erased by `tsc` and missed by `ts-blank-space`.
- **Out**: spread children, `{...items}`, which React never supported either. Deferrable if
  ticket 09 gives children a shape that wants them.

### 7. The diagnostic shape

Ticket 10 fixed the container — an array on a discriminated result, collected across the
failing phase, distinct from a `throw`, which means ursprung itself is broken. This fixes
the record, and clears the map's *Build diagnostics* fog:

```ts
type Diagnostic = {
  code: string;    // stable: URS1xxx parser, 2xxx resolution, 3xxx graph, 4xxx emit
  message: string; // one sentence, naming the construct
  remedy: string;  // what to write instead
  module: string;  // root-relative virtual filesystem path
  span: { start: number; end: number }; // character offsets into the decoded module
  line: number;    // 1-based, derived from span.start
  column: number;  // 1-based, derived from span.start
};
```

Three properties, each load-bearing:

- **`remedy` is required, not optional.** It is what makes a diagnostic actionable for the
  agents ticket 10 named as first-class users. A reject-list error that says only "`enum` is
  not supported" costs an agent a round trip; one that says "write a `const` object with
  `as const`" does not.
- **Positions always refer to the original module text**, never to printed output. This is
  what survives the printer, and it is the whole of what ticket 06 promised that still holds.
- **No severity.** v0 has no warnings — a build either succeeds or fails — and adding a
  severity field invites a middle state nothing is designed to carry.

The fog's remaining worry, "how a build error survives having no scope model to point at",
dissolves: every diagnostic points at a span, and spans exist for every node whether or not
anything is bound.

### 8. Correctness

Four oracles. The general strategy stays **ticket 22's**; these are the parser's.

1. **A golden corpus**, seeded from the ~150 cases ticket 06 verified — which are already
   written down with their expected behaviour — and grown by one case per bug.
2. **A syntax oracle over every emitted module.** Output must parse, checked with Bun's
   built-in transpiler. Highest-yield check on the whole design, because a printer's bugs
   are overwhelmingly bugs that produce invalid JavaScript.
3. **A behavioural differential against Bun's own TypeScript stripping**, at zero
   dependency cost, because Bun *is* a mature stripper: run a snippet as `case.ts` (Bun
   strips it) and as `case.ours.js` (we print it) and compare the exported values.
4. **A differential against `tsc` on the erasure decision set** — which byte ranges *are*
   type syntax — plus corpus cases generated from the `SyntaxKind` table research §3's
   19 + 38 entries were enumerated against. This is the one oracle aimed squarely at the
   delete list, which the other three cover worst.

**Oracle 4 costs `typescript` as a dev dependency, and the maintainer approved it in this
session** — which is constraint 6's stated mechanism working, not a violation. It is
test-only and never imported from `packages/ursprung/src`, so the published package is
unchanged. Constraint 6's opening clause is now stale; see the proposal on the map.

Test262 was considered and rejected: with the parser a conservative acceptor (§3), its
value is mostly in the negative tests, which are exactly the early errors ursprung has
decided not to implement.

### 9. Performance

**No numeric CPU budget in v0.** The build-in-a-Worker *product* is out of scope, so no
platform limit binds; what binds is the developer's patience, and there is nothing yet to
measure. A budget invented now would be a number nobody could defend.

Four design rules follow regardless, and are cheap only if adopted from the start:

- **One parse per module.** The AST is built once and shared by every later phase; no phase
  re-reads or re-parses source.
- **No regular expressions in the lexer.** Character-code dispatch throughout.
- **Backtracking confined to two bounded sites**: research §5.1's type-argument
  speculation, bounded by the candidate list, and the arrow-parameters-versus-parenthesised-
  expression decision, bounded by the parenthesised span. Everywhere else is single-pass.
- **The purity flag is computed during parse**, bottom-up in the same pass, never by a
  second walk.

### What this does not decide

- **`verbatimModuleSyntax` as an application requirement** — ticket 24, already graduated
  from ticket 06.
- **The JSX call shape** the printer emits — ticket 15.
- **`import { type A }` versus `import type { A }` as distinct graph edges** — ticket 12.
- **Whether v0 emits source maps.** Out of scope, but for a reason this ticket voided.
  Raised on the map as a proposal rather than settled here, because scope is the
  maintainer's.
