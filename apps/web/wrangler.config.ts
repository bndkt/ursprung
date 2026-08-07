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
});
