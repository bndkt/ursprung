import { defineConfig } from "oxlint";

export default defineConfig({
  // Oxlint's default plugin set. Listed explicitly because `plugins` overwrites
  // rather than extends — adding a fourth plugin means keeping these three.
  plugins: ["typescript", "unicorn", "oxc"],
  categories: {
    correctness: "error",
  },
});
