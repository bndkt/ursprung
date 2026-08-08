import { defineWranglerConfig } from "wrangler/experimental-config";

// Tooling-side counterpart to `cloudflare.config.ts`. Only build/dev settings
// belong here; Worker-shaped settings (name, compatibility date, bindings,
// triggers) live in `cloudflare.config.ts` and Wrangler errors if they appear
// in this file.
export default defineWranglerConfig({
  // `assetsDirectory` is the one asset setting Wrangler takes on this side. The
  // runtime asset fields — `htmlHandling`, `notFoundHandling`, `runWorkerFirst`
  // — are in `cloudflare.config.ts` under `assets`.
  assetsDirectory: "./public",
  // Wrangler does not minify by default. The win here is small in bytes — the
  // upload is mostly one HTML template literal, which esbuild will not touch —
  // but it is free, and it collapses the whitespace esbuild leaves around any
  // JSON it inlines.
  minify: true,
});
