---
title: "The platform said yes, then said something else"
description: "Splitting a Worker into lazily imported route modules keeps their code out of startup. Except workerd compiles every uploaded module at boot regardless."
date: "2026-08-07"
---

Earlier today we deleted most of a locked constraint on the strength of a claim: workerd and the browser both have a module registry, both guarantee one instance per resolved specifier, so ursprung can emit real ESM modules and ship no loader of its own. The claim was right. We had not read a line of workerd to check it.

So we read it — the source at a pinned commit, plus the committed test suite, rather than the docs. The answer came back yes. Request-time `import()` is not merely tolerated on workerd; the runtime branches on whether a request is in flight and the in-request case is the _first_ branch, with a comment describing the no-request case as "weird, but allowed". Then the source volunteered something nobody had asked about.

## Every module compiles, imported or not

The Worker's module compilation runs over _every_ uploaded module at startup, whether anything imports it or not. workerd's own architecture notes list this as a characteristic of the design rather than an accident. Lazy `import()` on the default module registry defers **evaluation**. It does not defer compilation.

So splitting the server into a root entrypoint plus one module per route does keep unmatched routes' top-level _work_ out of the one-second startup budget. It does not keep their parse cost out.

The amendment survives, because the reason written down for it was upload size — N route entrypoints each carrying its own copy of the renderer, the signals polyfill and capnweb, against a script-size limit. That argument is untouched. What died was a sentence nobody had written down yet, the comfortable adjacent belief that splitting by route keeps startup flat as an application grows. It doesn't, and it is much cheaper to kill that in a research note than to find it in a spec six weeks later.

Two smaller findings came with it. Evaluation is charged to neither the startup budget nor request CPU but to a third budget alongside both, whose size we could not establish: workerd's open-source limit enforcer is a no-op stub, and the production one is closed. And the registry keys on the **resolved specifier**, not on the file behind it. That last one is a trap with our name on it: `./signals.js` and `./signals.js?v=2` are two modules, which means two copies of the signal polyfill, two disjoint reactive graphs, and a freeze that reports nothing. We had already found that failure on the client. This is the same failure reachable through our own emitter, and the fix is one rule — content-hash the filename, never a query string.

## Two methods and a snapshot

The day's other thread was the build's front door. One of v0's constraints says `ursprung build` is a pure function from a virtual filesystem to a set of output files, touching no Node API, with the caller responsible for filling that filesystem. The ticket that turns that sentence into an interface opens by asking whether the filesystem should be synchronous or asynchronous.

That framing hides the decision. The real question is _when the I/O happens_, and an earlier decision had already answered it: the config file is evaluated by the host, before the build begins, so the build receives plain data and stays pure. Files get the same treatment. The host materialises everything first and the build reads synchronously, with a Worker host awaiting its object-storage reads on its own side of that boundary.

What the host implements is two methods:

```ts
entries(): Iterable<readonly [string, Entry]>;
read(path: string): Uint8Array | null;
```

Directory existence, symlink resolution, decoding and normalisation are all derived by the build from that one enumeration. The deciding argument was about `realpath`, which sounds like the least interesting operation on the list and is the most dangerous: link chains, links pointing at links, and a walk that lands on the wrong `node_modules` returns the wrong dependency and the wrong package type, silently. Left to each host, two hosts resolve the same tree differently. Derived once by the build, it is testable with no host at all.

That reversed a recommendation from our own research, which had preferred to make link-free paths a documented precondition. The snapshot inverts the costing: `realpath` becomes a map lookup rather than a round trip, while the precondition stops meaning "drop the links" — you cannot, or bare specifiers stop resolving — and starts meaning "duplicate every package's bytes at every path pointing at it", paid in memory.

One small thing turned out to be load-bearing. Paths are relative to the root with no leading slash, so the root is the empty string. Package resolution walks up the tree until it reaches the root, and with absolute paths that stop condition is a comparison someone can get wrong. With root-relative paths the loop ends when the path runs out. Termination stops being a check and becomes a property.

## Prior art is evidence, not authority

We also read Cloudflare's own `@cloudflare/worker-bundler`, which builds Workers inside a Worker. It validated the synchronous-snapshot shape outright: its filesystem interface is entirely synchronous, and its snapshot helper is documented as the bridge between async storage and the sync interface the bundler requires.

It does not answer the symlink question. It sidesteps it, by shipping an installer that fetches packages and lays out a flat `node_modules` itself — which our constraints forbid, since ursprung is never a package manager, and the caller populating the filesystem is exactly how a symlinked tree arrives. Its own documentation also states that export condition order matters, earlier conditions winning. Our resolution research had already established that as wrong: conditions are a set, and the _package author's_ key order decides. Reading it paid twice — once for what it confirmed, once for what it got wrong in a way we could recognise.

Where that leaves the map: seven takeable tickets, one constraint amendment waiting on the maintainer rather than on research, and still not a line of framework code. That remains deliberate.
