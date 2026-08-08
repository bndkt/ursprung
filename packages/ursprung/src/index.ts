// A default import, not `import { name, version }`. Named imports would let
// esbuild drop the manifest keys nothing reads — it currently inlines the whole
// `package.json`, scripts and all, into `apps/web`'s bundle — but a JSON module
// only has a default export, so named imports fail everywhere except a bundler
// that synthesises them, and only when the import attribute is dropped. Node
// rejects both halves: without the attribute `ERR_IMPORT_ATTRIBUTE_MISSING`,
// with it a SyntaxError for the missing named export. This package is published
// and ships TypeScript source, so a Node consumer is a supported path and this
// form is the only one that serves it. The bundle cost is ~290 bytes gzipped on
// a script parsed once per isolate; `minify: true` in apps/web absorbs the rest.
import pkg from "../package.json" with { type: "json" };

export const name: string = pkg.name;
export const version: string = pkg.version;
