---
title: "Two hosts already have a module loader"
description: "A throwaway prototype ruled out one route-file design by construction, and the question that followed deleted the hardest ticket on the map."
date: "2026-08-07"
---

ursprung's route file is data the bundler reads. That sounds like an implementation detail until you try writing one as a chain of builder calls:

```ts
export default route("/")
  .component(RootLayout)
  .child(route("builds").component(BuildsIndex).child(route(":id").component(BuildDetail)));
```

To learn what routes exist, the bundler has to evaluate that expression. To evaluate it, it has to build it first. Building is the thing that needed the route tree. The design is circular, and no amount of arguing about ergonomics would have surfaced that. We found it by writing four route files for an application that does not exist.

## Writing the app before the framework

The highest-leverage ticket on the v0 map was a prototype: write the canonical demo app's source as if ursprung already existed. It ended up as a build log — `/builds`, a nested `/builds/:id`, an API route, a server component that awaits slow data, a client component with a signal, a shared module, and a client component importing a function from a `.server.ts` and calling it as though it were local.

None of it runs. It imports a package with no source behind it. That is the point: you can look at real code, and you cannot look at an idea.

Four variants of the route declaration went in. Builder calls died as above. The two flat shapes — records with parent ids, and full paths with nesting inferred from prefixes — lost to the nested object literal on one property that only shows up when you try to write it. A pathless layout, a component that wraps children but adds no URL segment, cannot be expressed by prefix inference at all. In a nested literal it is a node with `children` and no `path`.

The winner was not the prototype's real output. That was a list of nineteen places where writing the app forced a decision nobody had made yet. Most were small. One was not: a client component creates its signals in its body, that body executes during server rendering, and under resumption it never executes again in the browser. "Where state is created" and "where state lives at runtime" are the same line of source and have to be two different places.

## The question that deleted a ticket

Then came four words from the maintainer: we need lazy loaded routes.

The prototype had the route file importing every component at the top. That is worse than it looks. A route's output carries the route table, so eager imports drag every other route's component into every single output. Lazy references fix it, and cheaply — `() => import("./builds/index.server.tsx")` keeps the specifier as a string literal in the AST, so the bundler reads it without evaluating anything.

Except one of v0's locked constraints read: one self-contained ESM file per bundle, no chunks, no shared extraction, no runtime loader. So we wrote down that the thunks would be rewritten at emit into direct references, and that the source therefore describes a laziness the output does not have.

That was wrong, and it took two more questions to find out how wrong.

The first split the server. There is no single server output; there is a root entrypoint, which is the Worker itself and carries the router, plus one module per route that the root imports once a request has matched. The second was where I had it backwards. I argued extraction was fine on the server because workerd has a module registry, but not on the client, because the browser has none and we would have to ship a loader.

The browser has one. It is the HTML specification's module map, it guarantees one instance per resolved URL exactly as workerd's registry does, and it has supported dynamic `import()` for years. The instinct that bundlers must ship a loader to split code comes from non-ESM output formats, the `__webpack_require__` shape. We emit ESM. Native imports need nothing from us on either side.

So the constraint lost most of its text and kept the part that was always the real invariant: ursprung ships no loader. Both hosts already have one.

## What that was worth

The payoff was not caching, and it was not upload size. It was that a whole ticket stopped existing.

That ticket was there to resolve a contradiction between two constraints. The parser has no scope model and no binding model, by design — type syntax is opaque delete-spans and nothing more. But flat concatenation means merging modules into one file with imports rewritten to local bindings, and two modules can each declare `const config`. Renaming safely requires knowing which references bind to which declaration, which is precisely the scope model the parser refuses to build. The three candidate escapes were IIFE wrappers, mechanical prefix renaming, and conceding a minimal scope model after all.

Real ESM modules get module scope for free. There is nothing to rename, and all three escapes became moot.

It also dissolved a trap found earlier: two route outputs live in one document meant two copies of the signals polyfill, two disjoint reactive graphs, and a silent failure where a computed reads one correct value and then freezes forever. One instance per URL, and the trap is gone.

## Where it leaves things

All of it rests on one fact we have not confirmed. Whether workerd permits `import()` inside a `fetch` handler, and if so whether the module's evaluation is charged to request CPU rather than the startup budget. If it is charged to the request, we have converted a cold-start problem into a first-hit latency cliff, and the amendment is worth less than it looks.

The research ticket for that turned out to be a lesson of its own. Half of what it asked for was already answered on a ticket closed days earlier, which had gone to Wrangler's source and then run it. The default module rules cover text, binary data and compiled WebAssembly, with no rule for `.js` at all, so sibling modules are dropped from an upload without a warning. Add `rules: [{ type: "ESModule", globs: ["**/*.js"] }]` and they attach, with relative specifiers resolving against the module names. Verified by running it, not inferred.

The map is now big enough that reading it properly is part of the work.
