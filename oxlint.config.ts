import { defineConfig } from "oxlint";

export default defineConfig({
  // `plugins` overwrites rather than extends — adding a fifth plugin means
  // keeping these four.
  plugins: ["typescript", "unicorn", "oxc", "import"],
  categories: {
    correctness: "error",
  },
  rules: {
    // The `import` plugin contributes no rules to the `correctness` category,
    // so enabling the plugin alone is a no-op. Its rules must be named here.
    // Module-graph and binding correctness; tsc does not cover these:
    "import/no-cycle": "error",
    "import/no-self-import": "error",
    "import/no-mutable-exports": "error",
    // Import-statement hygiene:
    "import/no-duplicates": "error",
    "import/no-empty-named-blocks": "error",
    "import/first": "error",
  },
});
