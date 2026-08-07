// THROWAWAY PROTOTYPE — see ./README.md. Nothing here runs.

// The Config file: the application's single entry point, from which the bundler
// discovers the route configuration and traverses everything else.

import { defineConfig } from "ursprung";

export default defineConfig({
  // Largely settled by ticket 07's decision. Because the route file references
  // components through lazy thunks rather than top-level imports, importing it
  // here no longer drags every Client component into the Config file's graph —
  // which was the whole force behind NOTES.md #10:
  //
  //     import routes from "./routes.ts";
  //     export default defineConfig({ routes });
  //
  // Written as a path string anyway, because the bundler reads the route tree
  // out of the AST rather than evaluating it, and a string says so honestly. The
  // import form now costs nothing though, and ticket 08 can pick either.
  routes: "./routes.ts",

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
