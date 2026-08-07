import { defineWorker } from "@cloudflare/config";

// Experimental TypeScript config format (`wrangler --experimental-new-config`).
// Worker-shaped settings live here; build/dev tooling settings would go in a
// sibling `wrangler.config.ts`.
export default defineWorker({
  name: "ursprung-web",
  compatibilityDate: "2026-08-07",
  compatibilityFlags: ["nodejs_compat"],
  entrypoint: "./src/index.ts",
  observability: {
    enabled: true,
    headSamplingRate: 1,
  },
});
