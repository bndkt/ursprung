import { defineConfig } from "oxfmt";

export default defineConfig({
  // `.agents/skills` is vendored content synced from `skills-lock.json` by
  // `bun run skills:update`; formatting it would be overwritten on next sync.
  ignorePatterns: [".agents/skills/**"],
});
