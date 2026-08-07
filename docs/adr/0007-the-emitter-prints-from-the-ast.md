# The emitter prints from the AST, with verbatim spans for pure JavaScript

ursprung does not strip types by blanking them out of the source. It **parses to an AST and
prints output from it**, with one concession that does most of the work: the printer's leaf
case is _copy this source span byte-for-byte_. Every node carries a purity flag, computed
bottom-up during the parse — a subtree is pure when it contains no erasable syntax and no
JSX. Pure subtrees print verbatim; everything else prints properly.

ADR-0003 made the build a pure function over a virtual filesystem and ADR-0006 made that
filesystem a snapshot. This is the corresponding decision one layer in: what a module
becomes on the way out.

## Considered options

**A whitespace-preserving edit list**, which is what every established implementation does —
`tsc`, `ts-blank-space` and `amaro` all blank a type span in place rather than removing it,
so source positions survive exactly and no source map is needed. Rejected despite being
smaller, because it makes the whole of research §5 a requirement rather than a
non-problem. Erasing `1 + 1 as any / 2` regroups a binary expression; erasing
`a ?? b as any && c` produces an illegal operator mix; erasing a whole statement can join
two that ASI had separated, which is repaired by writing a `;` into the first character of
the blanked span; two line-break-sensitive positions need a parenthesis moved rather than
blanked. A printer has none of these, because it chooses its own parentheses, semicolons
and line breaks.

The decisive evidence against copying them is that **both reference implementations are
still wrong**: for `!x as any ** 2` each emits `!x        ** 2`, which V8 rejects, and
neither reports an error. The guard they share only inspects a binary base, so a unary one
skips it. Adopting the edit list means adopting that bug or hand-fixing a bug its authors
have not fixed.

**Printing everything, always.** Uniform, with no purity flag to compute or get wrong, but
it obliges the printer to reproduce every literal form exactly — string escapes, template
literals, regex bodies, numeric formats — and discards the input's formatting entirely.
The verbatim leaf makes all of that unnecessary at no real cost, since the flag is one bit
computed in a pass that is already walking the tree.

## Consequences

**ursprung accepts three constructs both reference implementations refuse or corrupt.**
`1 + 1 as any / 2` prints `(1 + 1) / 2`; `a ?? b as any && c` prints `a ?? (b && c)`;
`!x as any ** 2` prints `(!x) ** 2`. The reject list ursprung inherits from research shrinks
rather than growing: ten constructs, not the thirteen-or-so projected.

**Synthesis stops being a special case.** The JSX call form, the RPC stubs at the server
boundary, and the generated route table are all code with no source span to edit. A printer
emits them the same way it emits everything else; an edit list would have to splice
generated strings into a patch sequence and keep the ordering right.

**Literals are never re-escaped, and third-party modules are nearly a byte copy.** A
literal contains no type syntax and no JSX, so it is always pure and always verbatim. An
npm dependency has neither anywhere, so its whole body is pure and only its import and
export statements print — and those only because a specifier may need rewriting. Neither
outcome is a special case anyone wrote; both fall out of the leaf rule.

**Output positions are lost, and verbatim spans do not rescue them.** A verbatim subtree
preserves its own bytes but not its offset, so a single printed statement earlier in the
file shifts everything after it. Build diagnostics are unaffected — they are computed
against the original module text and always were — but a production stack trace from
workerd cannot be mapped back to a module without a source map. This reverses half of what
the erasable-TypeScript research concluded: blanking is exact, and we gave that up
deliberately. Source maps remain out of scope, but the reason recorded for ruling them out
— that they need the scope model constraint 8 forbids — is wrong. They need position
tracking through the printer, which is cheap. Minification and identifier renaming still
need the scope model; source maps never did.

**The parser must be complete, but not faithful beyond purity.** Printing requires knowing
where every construct starts and ends, which the parser must do regardless to find type
spans. It does not require modelling the interior of anything pure, which is why the
verbatim leaf keeps this affordable.
