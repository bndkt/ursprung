// THROWAWAY PROTOTYPE — see ./README.md. Nothing here runs.
//
// ★ THE SHAPE THAT WON (ticket 07). Nested object literal — variant A — carrying
//   lazy module references and per-method API declarations. The three files under
//   `variants/` are the rejected alternatives, kept for the record.

import { defineRoutes } from "ursprung";

export default defineRoutes({
  path: "/",
  component: () => import("./src/root.server.tsx"),
  children: [
    {
      path: "builds",
      component: () => import("./src/builds/index.server.tsx"),
      children: [
        {
          path: ":id",
          component: () => import("./src/builds/detail.server.tsx"),
        },
      ],
    },
    {
      // An API route: no component, and the methods are declared here rather
      // than by exporting functions literally named GET and POST. The exports
      // it points at are named for what they do.
      path: "api/builds",
      api: {
        GET: () => import("./src/api/builds.server.ts").then((m) => m.readBuild),
        POST: () => import("./src/api/builds.server.ts").then((m) => m.createBuild),
        DELETE: () => import("./src/api/builds.server.ts").then((m) => m.removeBuild),
      },
    },
  ],
});

// Why this one, in short:
//
// - Nesting is visual, so a wrong parent is a syntax-level mistake rather than a
//   dangling id, and a **pathless layout** — a node with `children` and no
//   `path` — falls out for free. Variant D's prefix inference could not express
//   that, which is what decided it against B and D.
// - Lazy thunks mean the route file has no eager edge to any component, so a
//   Route bundle carrying the route table does not drag in every route's code.
//   The specifier stays a string literal in the AST, so the bundler reads it
//   without evaluating anything — which is exactly what killed variant C.
// - Declaring methods here makes this file the application's entire declared
//   HTTP surface, and that naming *is* an allowlist — the thing capnweb does not
//   give us (ticket 01) and ticket 20 has to invent.
//
// Still open, and now sharper rather than resolved:
//
// - **NOTES #12.** This file is `routes.ts`, unsuffixed. The thunks are still
//   code, so constraint 9 arguably bites — but the bundler never executes them.
//   The lazy form narrows the question without answering it.
// - **The `.then((m) => m.readBuild)` pattern-match.** The bundler must
//   recognise this exact AST shape to learn the export name. A plain
//   `{ module, export }` pair would be robust and untyped; this is typed and
//   fragile. Ticket 08 should decide deliberately.
// - Route **specificity**: `/builds/new` versus `/builds/:id` needs a rule.
//   Source order looks meaningful in a nested literal and should not be.
