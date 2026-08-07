// THROWAWAY PROTOTYPE — see ../../README.md. Nothing here runs.
//
// VARIANT B — flat array of route records, parent by id.
// Same four routes as A and C.

import BuildDetail from "../../src/builds/detail.server.tsx";
import BuildsIndex from "../../src/builds/index.server.tsx";
import RootLayout from "../../src/root.server.tsx";
import * as BuildsApi from "../../src/api/builds.server.ts";
import { defineRoutes } from "ursprung";

export default defineRoutes([
  { id: "root", parent: null, path: "/", component: RootLayout },
  { id: "builds", parent: "root", path: "builds", component: BuildsIndex },
  { id: "build-detail", parent: "builds", path: ":id", component: BuildDetail },
  { id: "api-builds", parent: "root", path: "api/builds", api: BuildsApi },
]);

// Reading it back:
//
// + One route is one line. Adding a route is an append; deleting one is a single
//   line removal; no edit is positional. This is the shape an agent generates and
//   diffs most reliably, and two agents adding two routes do not collide.
// + Flat means no indentation to get wrong and no depth limit.
// + Still one literal, statically readable with no scope model (NOTES.md #9).
// - Structure is now *referential*, not visual. `parent: "builds"` can dangle, or
//   cycle, and only the bundler will notice. A tree of any depth reads as noise.
// - Ids are a second namespace the author has to invent and keep unique, and they
//   are pure overhead at the leaves.
// - Order in the array carries no meaning but looks like it does.
