import { defineConfig } from "oxfmt";

export default defineConfig({
  // `.agents/skills` is vendored content synced from `skills-lock.json` by
  // `bun run skills:update`; formatting it would be overwritten on next sync.
  ignorePatterns: [
    ".agents/skills/**",
    // Regenerated verbatim by `wrangler dev`; formatting it only creates churn.
    "**/worker-configuration.d.ts",
    // Agent-written planning documents — maps, tickets and research notes that
    // sessions append to mechanically. Nothing renders or parses them, so
    // formatting buys nothing and only produces diff noise.
    ".scratch/**",
  ],
});
