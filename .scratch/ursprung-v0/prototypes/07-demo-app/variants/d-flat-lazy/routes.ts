// THROWAWAY PROTOTYPE — see ../../README.md. Nothing here runs.
//
// VARIANT D — flat, full paths, no ids, lazy module references.
// Same four routes as A, B and C. Written after comparing those three, and after
// the observation that route and API modules should not be eagerly imported.

import { defineRoutes } from "ursprung";

export default defineRoutes([
  { path: "/", component: () => import("../../src/root.server.tsx") },
  { path: "/builds", component: () => import("../../src/builds/index.server.tsx") },
  { path: "/builds/:id", component: () => import("../../src/builds/detail.server.tsx") },
  {
    path: "/api/builds",
    // The methods are declared *here*, mapped to arbitrarily-named exports,
    // rather than by exporting functions literally called GET and POST.
    api: {
      GET: () => import("../../src/api/builds.server.ts").then((m) => m.readBuild),
      POST: () => import("../../src/api/builds.server.ts").then((m) => m.createBuild),
      DELETE: () => import("../../src/api/builds.server.ts").then((m) => m.removeBuild),
    },
  },
]);

// Two things are going on here; they are separable and should be judged apart.
//
// ── Axis 1: the tree shape — flat, full paths, no ids ────────────────────────
//
// + One route is one line, edits are appends, no positional nesting, and two
//   agents adding two routes never touch the same line. (B's win.)
// + Nesting is inferred from path prefixes: `/builds/:id` under `/builds` under
//   `/`. So there is no `parent` field to dangle and no id namespace to invent.
//   (B's two costs, both gone.)
// + The whole URL space of the application is readable in one column.
// - A **pathless layout** — a component that wraps children but adds no segment
//   — cannot be expressed, and neither can a layout that wraps a path it does
//   not prefix. Both are real needs and D needs an escape hatch for them.
// - Route *order* still looks meaningful and is not, and `/builds/:id` vs a
//   literal `/builds/new` needs a specificity rule rather than a source order.
//
// ── Axis 2: lazy references ──────────────────────────────────────────────────
//
// This is orthogonal — A and B can carry it too, and it is arguably the more
// consequential of the two changes.
//
// + **The route file stops having eager edges to components.** With top-level
//   imports, a Route bundle that contains the route table drags every route's
//   component into every Route bundle. Constraint 10 accepts duplication across
//   bundles; it does not accept every bundle being the whole app.
// + Still pure data to the bundler: the specifier is a string literal in the
//   AST. Nothing is evaluated, so constraint 8 is satisfied — unlike variant C.
// + `import()` keeps the reference **typed and navigable** in an editor, which a
//   bare `component: "./src/root.server.tsx"` string would throw away.
// + It dissolves NOTES #10 and most of #12: the Config file and the route file
//   no longer transitively import every Client component, so the route file is
//   not obviously Server-side code at all — hence `routes.ts`, unsuffixed, in
//   this variant. Whether that is legal under constraint 9 is exactly #12, and
//   this variant is the one that makes the question answerable rather than moot.
// - There is **no runtime loader** (constraint 10), so these thunks are never
//   called as written. The bundler rewrites each one at emit into a direct
//   reference within the bundle. The source therefore describes a laziness the
//   output does not have — honest about build-time intent, misleading about
//   runtime behaviour.
// - `.then((m) => m.readBuild)` is a shape the bundler must **pattern-match** to
//   learn the export name. That is fragile in a way a plain string is not.
//
// ── Axis 2b: methods declared in the route file ──────────────────────────────
//
// + Decouples HTTP method from export name, so `builds.server.ts` can export
//   `readBuild`/`createBuild` instead of `GET`/`POST`, and no uppercase-export
//   convention has to exist.
// + **The route file becomes the application's whole declared HTTP surface** —
//   one file to read to know every endpoint. That is a strong property for
//   agents, and it bears directly on NOTES #1: naming the callable exports in
//   one place *is* an allowlist, which is precisely what ticket 20 lacks, given
//   capnweb exposes capabilities by construction with no allowlist of its own.
// - The method→function mapping now lives away from the function. Reading
//   `builds.server.ts` no longer tells you that `removeBuild` is reachable over
//   HTTP, let alone by which verb.
// - Adding an endpoint is a two-file edit.
