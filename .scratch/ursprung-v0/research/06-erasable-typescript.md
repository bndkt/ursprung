# 06 — The erasable TypeScript subset: exactly what survives type stripping

Research findings for [issue 06](../issues/06-erasable-typescript-subset.md).
Feeds ticket 11 (parser design).

## How this was established

Two kinds of claim appear below and they are labelled throughout:

- **[V]** — verified empirically in this session, by running the tool named.
- **[D]** — taken from documentation or from reading an implementation's source, not
  executed.

Versions under test:

| Thing                                           | Version    | Where                                         |
| ----------------------------------------------- | ---------- | --------------------------------------------- |
| TypeScript (CLI runs)                           | 5.9.3      | `/home/user/ursprung/node_modules/typescript` |
| TypeScript (programmatic runs)                  | 6.0.3      | scratchpad install                            |
| `ts-blank-space` (Bloomberg)                    | 0.9.0      | scratchpad install                            |
| `amaro` (Node's stripper, wraps swc `ts_strip`) | 1.1.11     | scratchpad install                            |
| Node.js                                         | 22.22.2    | environment                                   |
| workerd                                         | 2026-07-30 | `@cloudflare/workerd-linux-64` in the repo    |

The two TypeScript versions agree: both contain exactly **six** call sites for the
`erasableSyntaxOnly` diagnostic and produce identical results on every case below **[V]**.

Primary sources used:

- TypeScript's own checker source, `node_modules/typescript/lib/typescript.js` — the six
  `compilerOptions.erasableSyntaxOnly` guards and the `diag(1294, …)` definition.
- [TypeScript 5.8 release notes, "The `--erasableSyntaxOnly` Option"](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html)
- [TSConfig reference: `erasableSyntaxOnly`](https://www.typescriptlang.org/tsconfig/erasableSyntaxOnly.html)
- [TSConfig reference: `verbatimModuleSyntax`](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html),
  [`isolatedModules`](https://www.typescriptlang.org/tsconfig/isolatedModules.html)
- [Node.js docs: Modules: TypeScript](https://nodejs.org/api/typescript.html)
- `ts-blank-space` source (`out/index.js`, 798 lines — the whole stripper) and
  [`docs/unsupported_syntax.md`](https://github.com/bloomberg/ts-blank-space/blob/main/docs/unsupported_syntax.md)
- swc's `ts_strip` error strings, extracted from the wasm blob shipped inside `amaro`.

---

## 1. What `erasableSyntaxOnly` rejects — the complete list

There is exactly **one** diagnostic:

```
TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
```

**[V]** In `typescript.js` (both 5.9.3 and 6.0.3) the string
`Diagnostics.This_syntax_is_not_allowed_when_erasableSyntaxOnly_is_enabled` appears at
exactly six sites, and `compilerOptions.erasableSyntaxOnly` is read at exactly six places
in the checker. There is no other flag-specific error code. So this list is complete by
construction — the compiler cannot flag anything else under this flag.

**[V] TS1294 is a _semantic_ diagnostic, not a syntactic one**, despite living in the
1xxx range. `program.getSyntacticDiagnostics()` returns nothing for a file full of enums
and parameter properties; all seven TS1294s come out of `getSemanticDiagnostics()`. It is
produced by the checker, in `checkEnumDeclaration`, `checkParameter`,
`checkModuleDeclaration`, `checkImportEqualsDeclaration`, `checkExportAssignment` and
`checkAssertion`. Consequence for Ursprung: this check cannot be borrowed cheaply from a
parse; it must be reimplemented.

### The six

| #   | Construct                                                  | Checker function               | Guard                                                                          | Error span                                             |
| --- | ---------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 1   | `enum` / `const enum`                                      | `checkEnumDeclarationWorker`   | not `NodeFlags.Ambient`                                                        | the enum's name                                        |
| 2   | Parameter property                                         | `checkParameter`               | `hasSyntacticModifier(node, ParameterPropertyModifier)`                        | the whole parameter, one error per parameter           |
| 3   | `namespace` / `module` with runtime value                  | `checkModuleDeclaration`       | `symbol.flags & ValueModule && !inAmbientContext && isInstantiatedModule(...)` | the namespace's name                                   |
| 4   | `import X = …` (both `require(…)` and entity-name aliases) | `checkImportEqualsDeclaration` | not `NodeFlags.Ambient`                                                        | the whole statement                                    |
| 5   | `export = X`                                               | `checkExportAssignment`        | `node.isExportEquals && !NodeFlags.Ambient`                                    | the whole statement                                    |
| 6   | `<T>expr` angle-bracket assertion                          | `checkAssertion`               | `node.kind === TypeAssertionExpression` — **no ambient exemption**             | just `<T>`, from `skipTrivia(pos)` to `expression.pos` |

**[V]** Exact spans, from a programmatic run over
`enum E { A }\nclass C { constructor(public x: number) {} }\nconst a = <number>x;\nimport f = require("f");\nnamespace N { export const y = 1 }`:

```
1294 @5+1   = "E"
1294 @35+16 = "public x: number"
1294 @68+8  = "<number>"
1294 @79+24 = "import f = require(\"f\");"
1294 @114+1 = "N"
```

### Examples, each verified to produce TS1294 **[V]**

```ts
enum Color {
  Red,
  Green,
} // TS1294 (on `Color`)
const enum Direction {
  Up,
  Down,
} // TS1294
function outer() {
  enum Inner {
    A,
  }
} // TS1294 — nesting does not exempt

namespace NS {
  export const x = 1;
} // TS1294 (on `NS`)
module OldStyle {
  export const y = 2;
} // TS1294
function fn() {}
namespace fn {
  export const meta = 1;
} // TS1294 — declaration merging does not exempt
class R {}
namespace R {
  export const s = 1;
} // TS1294

class A {
  constructor(private readonly x: number) {}
} // TS1294
class B {
  constructor(
    public y: number, // TS1294
    protected z: string, // TS1294 (one per parameter)
    readonly w: boolean,
  ) {}
} // TS1294

import fs = require("node:fs"); // TS1294
import type fs2 = require("node:fs"); // TS1294 — type-only does NOT exempt
namespace Outer {
  export const v = 1;
}
import Alias = Outer; // TS1294
namespace Uses {
  export import T2 = Types.T;
} // TS1294 ×2 (the namespace and the alias)

export = thing; // TS1294

const n = <number>v; // TS1294 (span is `<number>` only)
```

### What is exempt, and why — verified **[V]**

Every one of these compiles clean under `erasableSyntaxOnly`:

```ts
declare enum Ambient {
  A,
  B,
} // ok — NodeFlags.Ambient
declare const enum AmbientConst {
  A,
  B,
} // ok
declare namespace DN {
  const z: number;
} // ok
declare module "some-lib" {
  export const q: number;
} // ok
declare module "m" {
  enum E {
    A,
  }
} // ok — ambient body
declare module M {
  const x: number;
} // ok — ambient, identifier-named
declare global {
  interface Window {
    u: number;
  }
} // ok
namespace TypesOnly {
  // ok — not an *instantiated* module
  export type T = string;
  export interface I {
    a: number;
  }
}
namespace N {
  export namespace M {
    export interface I {}
  }
} // ok — nested, still type-only
declare namespace Big {
  enum E2 {
    A,
  }
  namespace Inner2 {
    const x: number;
  }
} // ok
export as namespace Foo; // no TS1294 (but see §2)
const a = v as number; // ok — `as` is fine
const b = {} satisfies Record<string, number>; // ok
```

The "instantiated module" test is the subtle one: a `namespace` is rejected only if it
contains something that produces a value. `ts-blank-space`'s `valueNamespaceWorker`
**[D]** encodes the same rule from the other side — a body is type-only if every member is
a `TypeAliasDeclaration`, an `InterfaceDeclaration`, a non-`export`ed
`ImportEqualsDeclaration`, or a nested type-only `ModuleDeclaration`.

---

## 2. What `erasableSyntaxOnly` does NOT reject but is still not erasable

This is the part the ticket's premise gets wrong, and it matters: **`erasableSyntaxOnly`
is not a sufficient gate for a stripper.** Four holes, all verified.

### 2.1 Legacy decorators — NOT rejected **[V]**

```ts
function deco(target: unknown, key: string) {}
class C {
  @deco method() {}
}
```

With `experimentalDecorators: true` **and** `erasableSyntaxOnly: true`, TypeScript 5.9.3
emits **no** TS1294. Legacy decorators compile to `__decorate(…)` helper calls, so this
is emphatically not erasable. The ticket lists "legacy decorators" among the things
`erasableSyntaxOnly` flags; it does not.

`ts-blank-space` and `amaro` both pass decorators through verbatim **[V]** — their output
for `class C { @dec m() {} }` is byte-identical to the input. `ts-blank-space`'s docs are
explicit **[D]**: "Decorators are preserved because they have runtime meaning, though
current runtimes don't support them."

### 2.2 Standard (TC39 stage-3) decorators — NOT rejected **[V]**

Same result with `experimentalDecorators: false`. Node's own docs **[D]** list decorators
among the unsupported features: they "result in parser error" because V8 does not
implement them.

### 2.3 `accessor` — NOT rejected **[V]**

```ts
class D {
  accessor count = 0;
}
```

No TS1294. `accessor` is auto-accessor syntax from the decorators proposal; TypeScript
lowers it to a private field plus a getter/setter pair, which is code generation, not
erasure. `ts-blank-space` explicitly lists `AccessorKeyword` among modifiers it does _not_
remove **[D]** (`visitModifiers`, the `continue` branch), and both strippers pass it
through **[V]**.

### 2.4 workerd rejects all three **[V]**

Run directly against the repo's `workerd` binary (build 2026-07-30), one construct per ES
module:

| Construct                                             | workerd                                    |
| ----------------------------------------------------- | ------------------------------------------ |
| `class A { accessor x = 1 }`                          | `SyntaxError: Unexpected identifier 'x'`   |
| `function d(a,b){return a} class B { @d m(){} }`      | `SyntaxError: Invalid or unexpected token` |
| `class C { static { } }`                              | parses                                     |
| `function f(){ using r = { [Symbol.dispose](){} }; }` | parses                                     |

So on Ursprung's only target, decorators and `accessor` are hard runtime syntax errors,
and `erasableSyntaxOnly` will not catch them.

### 2.5 `export as namespace Foo;` **[V]**

`NamespaceExportDeclaration` is UMD-global syntax. In a `.ts` file TypeScript rejects it
with **TS1314** ("Global module exports may only appear in module files"), not TS1294. In
a `.d.ts` it is legal and no TS1294 fires. Both `ts-blank-space` and `amaro` leave it in
the output verbatim, producing invalid JavaScript **[V]**. Only relevant if Ursprung ever
reads a `.d.ts`; for `.ts`/`.tsx` inputs TS1314 covers it, but Ursprung must reject it
itself since it has no checker.

### 2.6 The `declare` hazard (a semantic hole, not a syntax one)

`declare` asserts that something exists at runtime without producing it. Blanking is
syntactically correct and semantically a trap:

```ts
declare namespace N {
  export const x: number;
}
console.log(N.x); // strips to a reference to a global `N` that may not exist
```

```ts
declare const enum CE {
  A = 1,
}
const v = CE.A; // strips to `CE.A` — `CE` was never emitted
```

`ts-blank-space`'s docs call this out under "The `declare` Hazard" **[D]**. TypeScript
catches only the const-enum half, and only under a _different_ flag: **TS2748 "Cannot
access ambient const enums when 'isolatedModules'/'verbatimModuleSyntax' is enabled"**
**[V]**. Under `erasableSyntaxOnly` alone it is silent.

---

## 3. The delete list — everything a stripper must recognise and remove

Organised by where it appears. Every entry below was run through `ts-blank-space` 0.9.0
and `amaro` 1.1.11 and the blanked output inspected **[V]**, unless marked otherwise.
Cross-checked against TypeScript's `SyntaxKind` enum (`typescript.d.ts`) so the
enumeration is grounded in the grammar rather than recall — the type-node block is
`FirstTypeNode = 183 … LastTypeNode = 206`, and the TS-only non-type-node kinds are
`TypeParameter`, `PropertySignature`, `MethodSignature`, `CallSignature`,
`ConstructSignature`, `IndexSignature`, `InterfaceDeclaration`, `TypeAliasDeclaration`,
`EnumDeclaration`, `ModuleDeclaration`, `ModuleBlock`, `NamespaceExportDeclaration`,
`ImportEqualsDeclaration`, `ExternalModuleReference`, `TypeAssertionExpression`,
`AsExpression`, `SatisfiesExpression`, `NonNullExpression`, `ExpressionWithTypeArguments`,
`EnumMember`.

### A. Whole statements/declarations that vanish

| #   | Construct                                                    | Example                                              | Verified |
| --- | ------------------------------------------------------------ | ---------------------------------------------------- | -------- |
| A1  | `interface` declaration                                      | `interface I { a: number }`                          | [V]      |
| A2  | `type` alias declaration                                     | `type T<X = string> = X \| null`                     | [V]      |
| A3  | `declare` variable statement                                 | `declare const gg: number`                           | [V]      |
| A4  | `declare function`                                           | `declare function af(x: number): string`             | [V]      |
| A5  | `declare class` (incl. `declare abstract class`)             | `declare class AC { m(): void }`                     | [V]      |
| A6  | `declare enum` / `declare const enum`                        | `declare enum E { A }`                               | [V]      |
| A7  | `declare namespace`                                          | `declare namespace N { const x: number }`            | [V]      |
| A8  | `declare module "str" { … }` (ambient module / augmentation) | `declare module "m" { export const q: number }`      | [V]      |
| A9  | `declare global { … }`                                       | `declare global { interface Window { u: 1 } }`       | [V]      |
| A10 | Type-only `namespace` (no value members, any nesting depth)  | `namespace N { export type A = string }`             | [V]      |
| A11 | Overload signature — any function-like with **no body**      | `function ov(a: string): string;`                    | [V]      |
| A12 | Method / constructor overload signatures inside a class      | `class C { m(a: string): void; m(a: any): void {} }` | [V]      |
| A13 | `abstract` class member (no body)                            | `abstract class C { abstract m(): void }`            | [V]      |
| A14 | `declare` class field                                        | `class C { declare x: number }`                      | [V]      |
| A15 | `import type { … } from "…"` — whole statement               | `import type { A } from "x"`                         | [V]      |
| A16 | `import type A from "x"` / `import type * as A from "x"`     |                                                      | [V]      |
| A17 | `export type { … }` — whole statement                        | `export type { A }`                                  | [V]      |
| A18 | `export type * from "x"` / `export type * as N from "x"`     |                                                      | [V]      |
| A19 | Index signature as a class member                            | `class C { [k: string]: unknown }`                   | [V]      |

Note on A11: the discriminator is _absence of a body_, not the presence of `declare`.
`ts-blank-space`'s `visitFunctionLikeDeclaration` **[D]** branches on `!node.body` first,
then splits `declare` (blank statement) from overload (blank exact) — the outcome is the
same blank either way.

### B. Fragments deleted inside a surviving construct

| #   | Construct                                                                               | Example → output                                            | Verified     |
| --- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------ |
| B1  | Type annotation on a variable declaration                                               | `let x: T = 1`                                              | [V]          |
| B2  | Type annotation on a parameter                                                          | `function f(a: number)`                                     | [V]          |
| B3  | Type annotation on a rest parameter                                                     | `function f(...xs: number[])`                               | [V]          |
| B4  | Type annotation on a destructuring binding                                              | `const { a }: { a: number } = o`                            | [V]          |
| B5  | Type annotation on a class property                                                     | `class C { p: string = "" }`                                | [V]          |
| B6  | Type annotation on a computed-name property                                             | `class C { [k]: number = 1 }`                               | [V]          |
| B7  | Return type annotation (function, method, arrow, getter, object-literal method)         | `function f(): void {}`                                     | [V]          |
| B8  | Return **type predicate**                                                               | `function f(x: unknown): x is string`                       | [V]          |
| B9  | Return **asserts predicate**                                                            | `: asserts x is string`, `: asserts x`                      | [V]          |
| B10 | `catch` clause parameter type                                                           | `catch (e: unknown)`                                        | [V]          |
| B11 | Type parameter list on function/method/class/class-expression/arrow/function-expression | `function f<T, U extends T>(…)`                             | [V]          |
| B12 | Type parameter **modifiers** — `const`, `in`, `out`                                     | `function f<const T>`, `interface I<in out T>`              | [V]          |
| B13 | Type argument list on a call                                                            | `id<number>(1)`                                             | [V]          |
| B14 | Type argument list on `new`                                                             | `new Set<string>()`                                         | [V]          |
| B15 | Type argument list on a tagged template                                                 | ``tag<number>`x` ``                                         | [V]          |
| B16 | Type argument list on a heritage clause                                                 | `class C extends B<number> {}`                              | [V]          |
| B17 | Type argument list on a decorator's call expression                                     | `@dec<number>() m() {}`                                     | [V]          |
| B18 | **Type argument list on a JSX element**                                                 | `<Comp<number> prop={1} />` → `<Comp prop={1}/>`            | [V] — see §4 |
| B19 | `implements` heritage clause (entire clause)                                            | `class C implements I, J {}`                                | [V]          |
| B20 | Class-member modifier `public`                                                          |                                                             | [V]          |
| B21 | Class-member modifier `private`                                                         |                                                             | [V]          |
| B22 | Class-member modifier `protected`                                                       |                                                             | [V]          |
| B23 | Class-member modifier `readonly`                                                        |                                                             | [V]          |
| B24 | Class-member modifier `override`                                                        |                                                             | [V]          |
| B25 | Class-member modifier `abstract` (on a member that _has_ a body — else A13)             |                                                             | [V]          |
| B26 | Class-member modifier `declare` (else A14)                                              |                                                             | [V]          |
| B27 | `abstract` modifier on a class declaration                                              | `abstract class E {}`                                       | [V]          |
| B28 | Optional marker `?` on a parameter                                                      | `function f(a?: number)`                                    | [V]          |
| B29 | Optional marker `?` on a property                                                       | `class C { p?: number }`                                    | [V]          |
| B30 | Optional marker `?` on a method                                                         | `class C { m?(): void {} }`                                 | [V]          |
| B31 | Definite assignment `!` on a variable                                                   | `let x!: string`                                            | [V]          |
| B32 | Definite assignment `!` on a property                                                   | `class C { x!: number }`                                    | [V]          |
| B33 | Non-null postfix `!` on an expression                                                   | `b!.c!`                                                     | [V]          |
| B34 | `as T`                                                                                  | `v as number`                                               | [V]          |
| B35 | `satisfies T`                                                                           | `{} satisfies object`                                       | [V]          |
| B36 | `this` parameter — **plus its trailing comma**                                          | `function f(this: Window, a: number)`                       | [V]          |
| B37 | Type-only **import specifier** — plus optional trailing comma                           | `import { type A, b } from "x"` → `import {   b } from "x"` | [V]          |
| B38 | Type-only **export specifier** — plus optional trailing comma                           | `export { type A, b }`                                      | [V]          |

`ts-blank-space`'s exact modifier removal set **[D]** is
`{ AbstractKeyword, DeclareKeyword, OverrideKeyword, PrivateKeyword, ProtectedKeyword,
PublicKeyword, ReadonlyKeyword }`, and its explicit _keep_ set is
`{ ConstKeyword, DefaultKeyword, ExportKeyword, InKeyword, StaticKeyword, AccessorKeyword,
AsyncKeyword, OutKeyword }` plus `Decorator`. (`InKeyword`/`OutKeyword` appear in that keep
list only because on a _type parameter_ the whole list is blanked wholesale by B11/B12.)

### C. Type-position grammar that must be skipped

Everything nested inside a type annotation is deleted as one span, so a stripper only
needs to _find the end_ of a type, not model it. But finding the end requires recognising
the full type grammar. All verified to blank correctly **[V]**:

union `A | B`, intersection `A & B`, function type `(a: T) => U`, constructor type
`new () => T`, `abstract new () => T`, array `T[]`, tuple `[a: number, b?: string,
...c: boolean[]]` (named/optional/rest members), type query `typeof x`,
`typeof import("x")`, `import("x").Y`, indexed access `T[K]`, mapped
`{ [K in keyof X]?: … }`, conditional `X extends Y ? A : B`, `infer U`, `keyof`,
`readonly T[]`, `unique symbol`, parenthesised, `this` type, literal types, template
literal types `` `a${string}b` ``, and type predicates.

Two grammar traps live here for a hand-written parser:

- `>` closing a type argument list has to be produced by re-scanning `>>`, `>>>`, `>=` —
  `Array<Array<T>>` ends on a `>>` token. TypeScript has a dedicated
  `reScanGreaterToken`; `ts-blank-space` sidesteps it by scanning forward for the closing
  `>` with `endPosOfToken(SK.GreaterThanToken)` **[D]**.
- A `<` in expression position is ambiguous. See §5.1.

---

## 4. `.tsx` — where it parses differently

**[V]** all of the following, comparing `ScriptKind.TS` against `ScriptKind.TSX`:

| Source                                     | `.ts`                                   | `.tsx`                                                                    |
| ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------- |
| `const a = <number>x;`                     | parses as a type assertion → **TS1294** | **TS1005** — parsed as JSX, then a parse failure                          |
| `const f = <T>(x: T) => x;`                | fine, generic arrow                     | **TS1382** ("Unexpected token. Did you mean `{'>'}` or `&gt;`?") + TS1005 |
| `const f = <T,>(x: T) => x;`               | fine                                    | fine — trailing comma disambiguates                                       |
| `const f = <T extends object>(x: T) => x;` | fine                                    | fine — `extends` disambiguates                                            |
| `const f = <const T,>(x: T) => x;`         | fine                                    | fine                                                                      |
| `const a = f<number>(1);`                  | generic call                            | generic call — identical                                                  |
| `const e = <Comp<number> prop={1} />;`     | n/a                                     | JSX element **with type arguments**                                       |

So `.tsx` changes exactly two things: the angle-bracket assertion form disappears
entirely (it is JSX), and a generic arrow needs `,` or `extends` after the first type
parameter. Everything else — `as`, `satisfies`, all annotations, all modifiers — is
identical.

`.mts`/`.cts` reserve the same two forms even though they are not JSX **[D]** (from the
diagnostics table): **TS7059** "This syntax is reserved in files with the .mts or .cts
extension. Use an `as` expression instead." and **TS7060** "… Add a trailing comma or
explicit constraint."

### B18 is a real gap in the reference implementation

**[V]** `tsc --jsx preserve` emits `<Comp prop={1}/>` for `<Comp<number> prop={1} />`, and
`<Comp>hi</Comp>` for `<Comp<string>>hi</Comp>` — the type arguments are erased.
`ts-blank-space` 0.9.0 leaves them **in place** (its `innerVisitor` has no case for
`JsxOpeningElement`/`JsxSelfClosingElement` type arguments), producing output that is not
valid JSX. `amaro` cannot parse `.tsx` at all. Ursprung parses JSX, so it must handle B18
and cannot copy either implementation here.

**Node does not support `.tsx` at all** **[D]** — "`.tsx` files are unsupported". Amaro
parses a `.tsx` filename as `.ts` **[V]**: `const a = x as number; const e = <div/>;`
fails with `Expression expected`, while `const f = <T>(x: T) => x;` in a file named
`in.tsx` is happily treated as a `.ts` generic arrow.

---

## 5. Where stripping is not a pure deletion

Six cases. All are places where blanking a span silently changes the meaning of the
surrounding JavaScript, and all are verified.

### 5.1 The `f<a>(b)` disambiguation

`f < a > (b)` is a valid JavaScript comparison chain and a valid TypeScript generic call,
and **TypeScript always prefers the generic call**. **[V]** `tsc` compiles

```ts
declare const f: any;
export const c = f<1>(2);
export const d = f<1, 2>(3);
```

to `export const c = f(2);` and `export const d = f(3);` — in **both** `.ts` and `.tsx`.
Both strippers agree **[V]**. So `.ts` is not a superset of `.js` here; the same bytes
mean different things.

TypeScript's rule is `canFollowTypeArgumentsInExpression()` in `typescript.js` **[D]** —
after speculatively parsing `<…>`, the _next_ token decides:

```js
case OpenParenToken:                  // foo<x>(
case NoSubstitutionTemplateLiteral:   // foo<T>`...`
case TemplateHead:
  return true;
case LessThanToken:                   // disqualified: `<` after type args never makes sense
case GreaterThanToken:                // ambiguous with a re-scanned `>>`
case PlusToken:                       // here `+`/`-` are unary, so this is a comparison
case MinusToken:
  return false;
default:
  return scanner.hasPrecedingLineBreak() || isBinaryOperator() || !isStartOfExpression();
```

This requires speculative parsing with backtracking. It is unavoidable, and it is the one
place a "delete-spans" parser cannot be purely local.

### 5.2 Erasing `as`/`satisfies` can regroup a binary expression

`as` and `satisfies` sit at relational precedence on their left operand, but the whole
assertion expression can then be the operand of a _higher_-precedence operator. Erasing
the assertion loses the implicit grouping.

**[V]** `tsc --target esnext` emits:

| Source               | tsc output                                         |
| -------------------- | -------------------------------------------------- |
| `1 + 1 as any / 2`   | `(1 + 1) / 2` — parentheses **added**              |
| `2 ** 2 as any ** 3` | `(2 ** 2) ** 3` — parentheses added                |
| `b as any ?? 1`      | `b ?? 1` — safe                                    |
| `1 * 1 as any + 2`   | `1 * 1 + 2` — safe                                 |
| `b as any\n+1`       | `b\n + 1` — safe, TS parsed it as `(b as any) + 1` |

A whitespace-preserving stripper cannot add parentheses, so it must **error**. Both do
**[V]**:

- swc/amaro: `Type assertions that would change binary expression grouping are not
supported in strip-only mode.`
- `ts-blank-space`: `onError` on the `AsExpression`.

`ts-blank-space`'s rule, `assertionChainWouldChangeBinaryGrouping` **[D]**: unwrap the
assertion chain; if the base expression is a `BinaryExpression`, scan the token following
the assertion; error if `nextPrecedence > basePrecedence`, or if they are equal and either
operator is `**` (right-associative). It carries its own precedence table (`**`=15 down to
`??`=4).

### 5.3 Erasing `as`/`satisfies` can create an illegal `??` mix

JavaScript forbids unparenthesised `??` beside `&&`/`||`. `a ?? b as T && c` parses as
`a ?? ((b as T) && c)`; erasing gives `a ?? b && c`, a SyntaxError. `ts-blank-space`
handles this in `visitBinaryExpression` with `hasUnsafeNullishLogicalMix` **[D]**; swc has
a distinct message, `Nullish coalescing operator(??) requires parens when mixing with
logical operators` **[V]**.

### 5.4 Both reference implementations still emit invalid JavaScript here

**[V]** For `const h = !x as any ** 2;`:

- `tsc` emits `const h = (!x) ** 2;`
- `ts-blank-space` emits `const h = !x        ** 2;`
- `amaro` emits `const h = !x        ** 2;`

and `node --check` rejects both: _"Unary operator used immediately before exponentiation
expression."_ Neither reports an error. The cause is that
`assertionChainWouldChangeBinaryGrouping` only looks for a `BinaryExpression` base;
`!x`, `-1`, `void 0`, `typeof x` are `PrefixUnaryExpression`, so the guard is skipped.
Verified for `!x`, `-1`, `void 0`, `typeof x` — all four produce invalid output from both
tools. **Ursprung should reject a unary base followed by `**`;** copying either
implementation reproduces the bug.

### 5.5 ASI hazards, and the semicolon-injection trick

Blanking a span preserves every character position, but a _blanked statement_ still
disappears from the token stream, and that can join two statements that ASI previously
separated. Both tools solve it by writing a `;` into the first character of the blanked
span (`blankButStartWithSemi` **[D]**). Verified outputs **[V]**:

| Source                                                         | Output                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| `let a = 1`<br>`interface I {}`<br>`(function(){})()`          | `let a = 1`<br>`;`&nbsp;(13 spaces)<br>`(function(){})()` |
| `let a = 1`<br>`type T = 2`<br>`[1].forEach(x=>x)`             | `let a = 1`<br>`;`&nbsp;(9 spaces)<br>`[1].forEach(…)`    |
| `let a = 1`<br>`declare const b: number`<br>`(function(){})()` | `;` injected                                              |
| `let a = b as T`<br>`[1].forEach(x=>x)`                        | `let a = b;` — the `;` replaces the first char of ` as T` |
| `function f(){ return 1 as any`<br>`[1].forEach(…) }`          | `return 1;`                                               |
| `class C { a = 1`<br>` private [x] = 2 }`                      | `;` replaces `private` — otherwise `a = 1[x] = 2`         |

The trigger conditions, from `ts-blank-space` **[D]**:

- `semicolonNeeded` — set after any statement whose last character is not `;`; if the
  _next_ statement is blanked wholesale, start its blank with `;`.
- On a class member: only when the member's name is a `ComputedPropertyName` (the `[`
  is what would otherwise chain onto the previous field).
- On `as`/`satisfies`: when the assertion ends the enclosing statement and no `;` follows.

Two behavioural divergences here **[V]**: for `class C { a = 1\n abstract [x]: number\n }`
`ts-blank-space` injects `;` and `amaro` does not (both are safe, because the whole member
is blanked either way); and the two tools place the `;` at different offsets inside an
`as` span (`b;    ` vs `b ;   `) — cosmetic.

**The angle-bracket assertion is unfixable by this trick** **[D]** — `ts-blank-space`'s
docs give the reason: erasing `<T>` after `return` or after `=>` leaves nothing to attach
a semicolon to, and "no reliable way to inject necessary JavaScript" exists. That is why
it is on the reject list rather than the delete list, in every implementation.

### 5.6 Line-break-sensitive positions: two paren moves

Two places where blanking a span in place would push a line break into a position where
JavaScript forbids one. Both tools rewrite a character rather than blank it **[V]**:

- **Arrow return type spanning lines between `)` and `=>`.** `ArrowFunction` forbids a
  LineTerminator before `=>`.
  `const f = (a: number)\n: number =>\n a` → `const f = (a         \n       ) =>\n a` —
  the closing paren is _moved down_ to the end of the blanked return type
  (`blankButEndWithCloseParen` **[D]**).
- **Type parameter list spanning lines before `(`.** `async <\n T,\n>(a: T) => a` →
  `async (\n   \n  a   ) => a` — the opening paren is _moved up_ into the `<` position
  (`blankButStartWithOpenParen`), because `async` forbids a LineTerminator before its
  arrow parameter list. Verified for `async` arrows in both tools; for a plain
  `function f<\nT\n>(a)`, `ts-blank-space` moves the paren and `amaro` does not (both
  valid).

### 5.7 A type-only import that also has value imports

**[V]** verbatim outputs:

| Source                                | Stripped                                              |
| ------------------------------------- | ----------------------------------------------------- |
| `import type { A } from "x";`         | entire statement blanked — **no module edge remains** |
| `import { type A, b } from "x";`      | `import {         b } from "x";`                      |
| `import d, { type A } from "x";`      | `import d, {        } from "x";`                      |
| `import { type A, type B } from "x";` | `import {                } from "x";`                 |
| `export { type A, b };`               | `export {         b };`                               |
| `export { type A, type B };`          | `export {                };`                          |

The last case is the trap: **`import { type A } from "x"` becomes `import {} from "x"`,
which still loads and evaluates the module**, whereas `import type { A } from "x"`
removes the edge entirely. This is exactly TypeScript's documented
`verbatimModuleSyntax` behaviour **[D]**: "Rewritten to `import {} from 'xyz';`". A
bundler must treat the two forms as different graph edges.

Related **[D]**, from `ts-blank-space`'s README: "TypeScript may add an `export {};` if all
`import`s and `export`s were removed… Because `ts-blank-space` only removes code, this is
not performed." A module whose only module-level syntax was `import type`/`export type`
loses its ESM marker after stripping.

---

## 6. Whitespace-preserving erasure

**Yes — every established implementation blanks in place rather than removing, and that
is what makes source maps unnecessary.**

**[D]** Node's docs: "Inline types are replaced with whitespace… No source maps are
generated because inline types are replaced by whitespace, making source maps unnecessary
for correct line numbers in stack traces."

**[V]** Confirmed byte-for-byte. Blanking preserves line _and_ column, and newlines inside
a multi-line deleted span are preserved so line numbering never shifts:

```
input:                         output:
const multi: {                 const multi
  a: number;
  b: string;
} = { a: 1, b: "x" };            = { a: 1, b: "x" };
```

```
input:   const t = /* keep */ 1 as /* gone? */ number;
output:  const t = /* keep */ 1                      ;
```

Note the second example: comments _inside_ a deleted type span are deleted with it, which
is correct and worth knowing if Ursprung ever wants to preserve directives.

The mechanism is a `BlankString` buffer with four operations **[D]**: `blank(start,end)`,
`blankButStartWithSemi`, `blankButStartWithOpenParen`, `blankButEndWithCloseParen` — i.e.
the only non-blank writes are the three single characters from §5.5 and §5.6.

The cost is that the output is byte-length-identical to the input, including trailing
whitespace on nearly every line. For a bundler that concatenates modules this is dead
weight in the output; it is not a correctness problem.

---

## 7. `verbatimModuleSyntax` and `isolatedModules`

These are the flags that make application code _safe_ to strip without a type model.

**`verbatimModuleSyntax`** **[D]**: "Any imports or exports without a `type` modifier are
left around. Anything that uses the `type` modifier is dropped entirely." It exists to
disable **import elision** — TypeScript's default behaviour of quietly dropping an import
it determines is only used as a type. Elision requires a type checker. A stripper cannot
do it, so without this flag a file can typecheck and then fail at runtime.

Diagnostics it adds, all verified **[V]**:

| Code   | Message                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| TS1484 | `'X' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.`                           |
| TS1485 | `'X' resolves to a type-only declaration and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.` |
| TS1205 | `Re-exporting a type when 'verbatimModuleSyntax' is enabled requires using 'export type'.`                                      |
| TS2748 | `Cannot access ambient const enums when 'verbatimModuleSyntax' is enabled.`                                                     |

**`isolatedModules`** **[D]** "warn[s] you if you write certain code that can't be
correctly interpreted by a single-file transpilation process". Verified **[V]** it
produces TS1205 and TS2748 with its own name substituted, but **not** TS1484 — it only
guards the export side, not the import side. In TypeScript 5.x `verbatimModuleSyntax`
supersedes it; the checker source has a single `isolatedModulesLikeFlagName` that resolves
to whichever is on **[D]**.

Node's recommended config for type stripping **[D]**:

```json
{
  "noEmit": true,
  "target": "esnext",
  "module": "nodenext",
  "rewriteRelativeImportExtensions": true,
  "erasableSyntaxOnly": true,
  "verbatimModuleSyntax": true
}
```

`ts-blank-space` recommends the same plus `useDefineForClassFields: true` **[D]** —
"because class fields are preserved as written, which corresponds to 'define' semantics in
the ECMAScript specification". This one matters: a stripper leaves `class C { x = 1 }`
alone, so it gets ECMAScript `[[Define]]` semantics, whereas TypeScript with
`useDefineForClassFields: false` would emit assignment semantics. Any application config
that sets it false is silently lying about what its own code does.

---

## 8. Divergence matrix

Where the three tools disagree (`ok` = accepted; everything else is an error). All **[V]**.

| Case                                                 | tsc `erasableSyntaxOnly` | ts-blank-space                                     | amaro/swc                      |
| ---------------------------------------------------- | ------------------------ | -------------------------------------------------- | ------------------------------ |
| `declare module M { … }` (identifier-named, ambient) | ok                       | **error**                                          | **error** (`module` keyword)   |
| `import type fs = require("fs")`                     | **TS1294**               | **error**                                          | **ok**                         |
| `export as namespace Foo`                            | TS1314 (in `.ts`)        | ok, left verbatim → invalid JS                     | ok, left verbatim → invalid JS |
| Legacy / standard decorators                         | **ok**                   | ok, left verbatim                                  | ok, left verbatim              |
| `accessor x = 1`                                     | **ok**                   | ok, left verbatim                                  | ok, left verbatim              |
| `1 + 1 as any / 2`                                   | ok                       | **error**                                          | **error**                      |
| `2 ** 2 as any ** 3`                                 | ok                       | **error**                                          | **error**                      |
| `a ?? b as any && c`                                 | ok                       | **error**                                          | **error**                      |
| `!x as any ** 2`                                     | ok (emits `(!x) ** 2`)   | **ok → invalid JS**                                | **ok → invalid JS**            |
| `<Comp<number> />` type args in JSX                  | erased                   | **left in place**                                  | cannot parse `.tsx`            |
| `.tsx` input                                         | supported                | supported via `blankSourceFile` + `ScriptKind.TSX` | **unsupported**                |

Nobody's list is a superset of anyone else's. Ursprung needs its own, which is what §1–§5
above are.

---

## 9. What could not be established

- **Whether workerd/V8 will ever accept decorators or `accessor`.** Verified only that
  the 2026-07-30 build rejects both **[V]**. I did not find a primary source stating a
  V8 roadmap position; `chromestatus.com` did not render usefully through WebFetch.
- **Whether `erasableSyntaxOnly`'s six-site list is stable across future TypeScript
  versions.** It is identical in 5.9.3 and 6.0.3 **[V]**, but nothing documents it as a
  frozen surface.
- **Whether `ts-blank-space`'s omission of JSX type arguments (B18) is a known bug.** I
  read the source and confirmed the behaviour **[V]** but did not find an issue for it.
- **The exact complete set of unary-base cases that break under `**` (§5.4).** Verified
  four (`!`, unary `-`, `void`, `typeof`); did not exhaustively enumerate `await`, `delete`,
  `~`, `+`, `++`/`--`.
- **`preserveConstEnums`' effect on the namespace check.** The source shows
  `isInstantiatedModule(node, shouldPreserveConstEnums(compilerOptions))` **[D]**, so a
  namespace containing only a `const enum` presumably flips from erasable to rejected when
  that flag is on. Not tested.

---

## Implications for Ursprung

Read against the [locked constraints](../map.md). Nothing here breaks a constraint, but
three of them need a rider.

**Constraint 8 ("opaque delete-spans, no type model, no scope/binding model") holds, but
the parser is bigger than "find `:` and skip to the end".** The delete list in §3 is 19
whole-statement forms and 38 fragment positions, and three of them cannot be decided
locally: the `f<a>(b)` speculation (§5.1) needs backtracking; the `as`/`satisfies`
grouping check (§5.2–5.4) needs an operator-precedence table and one token of lookahead
past the assertion; and the ASI semicolon injection (§5.5) needs a "did the previous
statement end in `;`" bit threaded through statement-list walking. All three are
_syntactic_ — no type model, no scope model — so the constraint survives. Ticket 11 should
budget for them explicitly rather than discovering them.

**Constraint 8's "loud errors on non-erasable constructs" must reject more than
`erasableSyntaxOnly` does.** The reject list Ursprung needs is TypeScript's six (§1) plus
five that `erasableSyntaxOnly` permits:

1. legacy decorators, 2. standard decorators, 3. `accessor` — all three are hard
   `SyntaxError`s on workerd **[V]**, so shipping them means a broken bundle;
2. `export as namespace`; 5. the unary-`**` assertion hole of §5.4, where both reference
   implementations silently emit invalid JavaScript.

Plus the two grouping errors and the nullish-mix error of §5.2–5.3, which
`erasableSyntaxOnly` also does not cover.

**Source maps stay out of scope, and this research confirms that is affordable.**
Whitespace-preserving blanking is what every established implementation does, and Node's
docs give the reason in as many words **[D]**. Positions are preserved exactly, including
across multi-line spans **[V]**. The "Build diagnostics" item under _Not yet specified_
gets a free answer: a build error's source position in stripped output is the same
position as in the original module, so diagnostics can point at the original file without
any mapping machinery.

**A new requirement on application code that is not yet on the map: Ursprung must demand
`verbatimModuleSyntax` semantics, and enforce them itself.** With no type model, Ursprung
cannot do import elision — so `import { SomeType } from "./x.ts"` (no `type` keyword)
survives stripping as a live value import of a binding that does not exist at runtime.
TypeScript catches this as TS1484, but only if the application enables the flag, and
Ursprung must not depend on the application having run `tsc` at all. This is a build-time
rule Ursprung has to enforce, and it cannot: detecting it requires knowing whether the
imported name is a type, which is exactly the type model constraint 8 rules out. The
honest resolution is to **document `verbatimModuleSyntax: true` as a hard requirement on
application `tsconfig.json`** and accept that violating it is an application bug Ursprung
reports only as a runtime failure. Ticket 11 or the spec should say so out loud.

**Consequence for the graph (constraint 10, "one self-contained ESM file per bundle").**
`import type { A } from "./x.ts"` removes the edge; `import { type A } from "./x.ts"`
leaves `import {} from "./x.ts"`, which is still an edge and still evaluates the module for
side effects **[V]**. Colouring and reachability must distinguish them. The same applies
to `export type * from` versus `export { type A }`.

**Constraint 6 (three dependencies) is unaffected, but note what it costs.** Neither
`ts-blank-space` (which needs `typescript` as a peer) nor `amaro` (a 2.8 MB wasm blob) can
be adopted; §3 is the specification Ursprung implements from scratch. That is the intended
reading of the constraint — this research just makes the size of the work explicit.

**`.tsx` costs almost nothing extra (constraint 8 covers JSX already).** Only two rules
change (§4): the angle-bracket assertion form does not exist, and a generic arrow needs
`,` or `extends`. Since `<T>expr` is on the reject list in `.ts` anyway, Ursprung's `.ts`
and `.tsx` parsers differ by one disambiguation rule. But **B18 (JSX element type
arguments) is a delete-span the reference implementation misses**, and Ursprung parses JSX,
so it must be in ticket 11's list.

**Watch item, not a conflict: `useDefineForClassFields`.** A stripper leaves class fields
verbatim, which means ECMAScript define semantics. An application whose `tsconfig` sets
`useDefineForClassFields: false` will behave differently under Ursprung than under `tsc`.
Worth a line in the spec alongside the `verbatimModuleSyntax` requirement.
