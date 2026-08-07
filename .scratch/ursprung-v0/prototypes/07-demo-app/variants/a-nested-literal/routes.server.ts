// THROWAWAY PROTOTYPE — see ../../README.md. Nothing here runs.
//
// VARIANT A — nested object literal.
// Nesting in the route tree is nesting in the source. Read A, B and C together;
// they declare exactly the same four routes.

import BuildDetail from "../../src/builds/detail.server.tsx";
import BuildsIndex from "../../src/builds/index.server.tsx";
import RootLayout from "../../src/root.server.tsx";
import * as BuildsApi from "../../src/api/builds.server.ts";
import { defineRoutes } from "ursprung";

export default defineRoutes({
  path: "/",
  component: RootLayout,
  children: [
    {
      path: "builds",
      component: BuildsIndex,
      children: [
        {
          path: ":id",
          component: BuildDetail,
        },
      ],
    },
    {
      path: "api/builds",
      api: BuildsApi,
    },
  ],
});

// Reading it back:
//
// + Structure is visible. The tree in the file is the tree in the URL space, and
//   a wrong parent is a syntax-level mistake rather than a dangling reference.
// + One literal, statically readable with no scope model (see NOTES.md #9).
// - Adding a leaf deep in the tree means editing at depth: an agent has to find
//   the right `children` array and match indentation. The diff is small but the
//   edit is positional.
// - Rearranging the tree rewrites a large contiguous block, so two agents
//   touching different routes can conflict on the same lines.
// - `component` and `api` are different keys on the same record shape, so a
//   route with both is expressible and meaningless.
