// THROWAWAY PROTOTYPE — see ./README.md. Nothing here runs.

// The Config file: the application's single entry point, from which the bundler
// discovers the route configuration and traverses everything else.

import { defineConfig } from "ursprung";

export default defineConfig({
  // VARIANT — how the config reaches the routes. See NOTES.md #10.
  //
  //   (i)  a path string, below. The bundler *reads* the route file rather than
  //        importing it; the config module has no edge to any component, and the
  //        graph has two roots (config, route file) instead of one.
  //
  //   (ii) an import:
  //
  //          import routes from "./routes.server.ts";
  //          export default defineConfig({ routes });
  //
  //        which is one real root and one real graph — but then the Config file
  //        transitively imports every Client component in the application, and
  //        the Config file is a Server module. Colouring has to know that a route
  //        record's `component` is a *reference*, not an inclusion, or every
  //        Client component lands in the Server bundle and nothing else.
  routes: "./routes.server.ts",

  // Everything reachable from the route tree is first-party; this is where the
  // VFS root sits so that resolution has somewhere to start.
  root: ".",

  // AMBIGUITY (see NOTES.md #11): constraint 15 pins the permitted `node:*` set
  // as a function of the compatibility date — but the compatibility date lives in
  // `cloudflare.config.ts`, which is Wrangler's file, not ours. Ursprung either
  // reads it out of Wrangler's config (coupling to an experimental format) or
  // asks for it twice and lets the two drift.
  compatibilityDate: "2026-08-01",
});

// Worth noticing: this app now has *three* config files at its root —
// `ursprung.config.ts` (this one), `cloudflare.config.ts` (Worker name, domains,
// observability) and `wrangler.config.ts` (`noBundle`, `build.command`,
// `assetsDirectory`, per ticket 05). See NOTES.md #11.
