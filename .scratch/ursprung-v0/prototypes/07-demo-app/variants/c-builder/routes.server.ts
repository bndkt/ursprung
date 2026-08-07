// THROWAWAY PROTOTYPE — see ../../README.md. Nothing here runs.
//
// VARIANT C — builder calls. Same four routes as A and B.

import BuildDetail from "../../src/builds/detail.server.tsx";
import BuildsIndex from "../../src/builds/index.server.tsx";
import RootLayout from "../../src/root.server.tsx";
import * as BuildsApi from "../../src/api/builds.server.ts";
import { apiRoute, route } from "ursprung";

export default route("/")
  .component(RootLayout)
  .child(
    route("builds")
      .component(BuildsIndex)
      .child(route(":id").component(BuildDetail)),
  )
  .child(apiRoute("api/builds").handlers(BuildsApi));

// Reading it back:
//
// + The only variant where `component` and `api` cannot both be set on one
//   route: `route()` and `apiRoute()` are different builders returning different
//   types, so the illegal state is unrepresentable rather than merely unwise.
// + Chaining gives a natural place to hang per-route options later.
// - Worst of the three to generate and to diff: an edit is a call inserted at a
//   specific depth inside a chained expression, with parenthesis balance to get
//   right. Formatter line-breaking makes the diffs noisy on top.
// - **And this is the disqualifying one.** These are function calls, not data.
//   Reading this route tree means *evaluating* it, and the bundler cannot
//   evaluate the route file — it would have to build it first, and building is
//   what it needs the route tree for. Constraint 8 leaves it no scope model to
//   fold the calls statically either. See NOTES.md #9.
