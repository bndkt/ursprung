import { defineWorker } from "@cloudflare/config";

// Experimental TypeScript config format (`wrangler --experimental-new-config`).
// Worker-shaped settings live here; build/dev tooling settings would go in a
// sibling `wrangler.config.ts`.
export default defineWorker({
  name: "ursprung-web",
  compatibilityDate: "2026-08-07",
  compatibilityFlags: ["nodejs_compat"],
  entrypoint: "./src/index.ts",
  // Custom domain. The zone must already exist on the Cloudflare account —
  // Wrangler creates the domain record on deploy, it does not create the zone.
  domains: ["ursprung.dev"],
  // Production is served from the custom domain only, so the plain
  // `ursprung-web.<subdomain>.workers.dev` route stays off.
  workersDev: false,
  // Preview URLs default to whatever `workersDev` is, so they have to be turned
  // on explicitly here: every version gets
  // `<version-prefix>-ursprung-web.<subdomain>.workers.dev`, and versions
  // uploaded from a branch also get the stable
  // `<branch>-ursprung-web.<subdomain>.workers.dev` alias. Only `wrangler
  // deploy` writes this setting — `versions upload` just reads it.
  previewUrls: true,
  observability: {
    enabled: true,
    logs: {
      enabled: true,
      // Log every invocation, not just those that call console.*.
      invocationLogs: true,
      headSamplingRate: 1,
    },
    // Tracing is opt-in: `enabled: true` on the parent does not turn it on.
    traces: {
      enabled: true,
      headSamplingRate: 1,
    },
  },
});
