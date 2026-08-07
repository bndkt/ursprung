// Files oxfmt formats but oxlint does not lint.
const FORMAT_ONLY = "*.{json,jsonc,md,mdx,yaml,yml,css,html}";
// Source files, which get both.
const SOURCE = "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}";

// `--no-error-on-unmatched-pattern` keeps oxfmt from exiting non-zero when every
// path handed to it is covered by `ignorePatterns` — otherwise a commit touching
// only `.agents/skills/**` would fail the hook.
const format = "oxfmt --no-error-on-unmatched-pattern";

export default {
  // The two globs are kept disjoint deliberately: lint-staged runs glob groups
  // concurrently, so an overlap would let oxfmt rewrite a file while oxlint is
  // still reading it. Within one group commands run in order, so source files
  // are formatted first and linted second.
  [SOURCE]: [format, "oxlint"],
  [FORMAT_ONLY]: [format],
};
