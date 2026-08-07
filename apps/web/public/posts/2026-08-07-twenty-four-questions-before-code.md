---
title: "Twenty-four questions before the first line of code"
description: "Planning v0 as a map of open decisions rather than a task list, and the four research findings that changed the plan before any of it was built."
date: "2026-08-07"
---

TypeScript's `erasableSyntaxOnly` flag exists to reject syntax that cannot simply be deleted — `enum`, parameter properties, namespaces with runtime values. Ursprung intends to accept exactly the erasable subset, so the obvious rule to write down is "accept whatever `erasableSyntaxOnly` accepts."

That rule is wrong, and it takes four lines to prove:

```ts
function log(x: any, c: any) {
  return x;
}
class A {
  @log m() {}
}
class B {
  accessor n = 1;
}
enum E {
  a,
}
```

With `erasableSyntaxOnly` on, the compiler flags line 4 and nothing else. Decorators and `accessor` pass. Both are hard `SyntaxError`s on workerd, the runtime Ursprung targets. So the obvious rule produces a parser that cheerfully accepts source the runtime will refuse, and the failure arrives at deploy time rather than build time.

We found that before writing the parser, which is the entire argument for what follows.

## A map, not a sprint plan

The natural way to start a project this size is to break it into tasks and start at the top. That works when you know what you are building. Here, most of the interesting questions had no answers yet — not "how do we implement the resumability wire format" but "what goes in it", which is a decision, not a task.

So v0 got charted as a map: one document holding the destination and the constraints, and a ticket per open decision. Each ticket is a question sized to a single session, and the map is done when nothing architectural is left to decide. The map plans; it does not build.

The destination is deliberately falsifiable. Not "a working framework" but one canonical demo app that exercises every architectural claim at once — a nested route tree, an API route with two methods, a server component, a client component, a client component importing a function from a `.server.ts`, one signal-driven interaction, streaming server rendering, and resumption on the client with no re-render. If that app is fully specified and every decision behind it is locked, v0's design is done.

Two grilling sessions produced sixteen locked constraints and twenty-four tickets: six research, one prototype, sixteen decisions, one manual task. Native iOS went out of scope, with one obligation kept in scope — the renderer must stay host-agnostic, so a SwiftUI host can be added later without a rewrite. Whatever could not be stated sharply enough to ticket went into a section called "not yet specified", on the principle that pre-slicing fog into ticket-shaped pieces produces tickets that are wrong.

The six research tickets went out to agents in parallel, each pointed at primary sources — repository source code, specification text, the actual schema in `node_modules` — rather than documentation about them. Four came back and changed the plan.

## What the reading changed

**The deployment flow survives.** The vision depends on disabling Wrangler's bundling and having it run Ursprung as a custom build command instead. Wrangler's experimental TypeScript config is a Zod `strictObject`, so a guessed key is a hard error, and it was entirely possible that `noBundle` simply had no equivalent there. It does — on the sibling `wrangler.config.ts`, along with `build.command`. The single largest risk on the map evaporated on the first read.

**capnweb has no allowlist.** Every prototype method on the root RPC object is callable by anyone who can reach the endpoint. TypeScript's `private` hides nothing at runtime; only `#private` fields do. That means the object Ursprung generates for the server boundary _is_ the security perimeter, with nothing behind it. It also turns out that capnweb's own validation package is unreachable for us: it needs a decorator, the TypeScript checker, and a second dependency — three separate constraints rule it out independently.

**One constraint got stricter rather than looser.** The map said `node:*` imports stay external on the server because `nodejs_compat` serves them. Half true. Wrangler's Node polyfills are injected by its esbuild pass — the exact pass that disabling bundling switches off. A Worker built by Ursprung therefore has strictly less available than the same source built by Wrangler. The resolution was to lean into it: no polyfills at all, on any target, with only workerd's natively-implemented modules and `cloudflare:*` permitted.

**Qwik keeps its state as a whole-document post-pass**, in both v1 and v2. That matters because v0 committed to in-order streaming only, and the worry was that the restriction was arbitrary. It is not: every mechanism Qwik built to survive out-of-order streaming — backpatching, subscription patches, paired negative segment ids — is complexity that in-order streaming never incurs. A measured payload from a production Qwik page came in at 15.5% of HTML bytes, which is now the budget the wire format gets designed against.

## Being wrong in public

One finding was a correction to an earlier finding. Reading capnweb's export conditions from the npm registry gave an order in which the generic build wins over the Workers build — a real conclusion, recorded on the ticket. It was wrong. The registry reorders JSON object keys by length, and export condition precedence _is_ key order. The authored manifest puts `workerd` first. The rule now written down is that Ursprung must never read a manifest from the registry API, only from a tarball or a repository.

Seven tickets are takeable now. The first is a prototype: write the demo app's source as if the framework already existed, so that every downstream decision argues with a concrete artifact instead of a blank page. One ticket cannot be answered by reading at all — whether Cloudflare's Workers Builds honours a custom build command, where Wrangler's source and Cloudflare's documentation flatly disagree. That one needs a real push and a real build log.
