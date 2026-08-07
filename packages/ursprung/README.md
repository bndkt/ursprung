# ursprung

[![npm](https://img.shields.io/npm/v/ursprung)](https://www.npmjs.com/package/ursprung)

Currently exposes its own name and version — the package exists so the
publishing pipeline around it is real.

```bash
bun add ursprung
```

```ts
import { name, version } from "ursprung";

console.log(`${name} v${version}`);
```

## This package ships TypeScript source

`exports` points at `./src/index.ts`, not at a compiled `dist/`. There is no
build step, so **your toolchain has to be able to import TypeScript** — Bun,
a bundler that transpiles dependencies, or a recent Node with type stripping.
Plain `require()` from CommonJS will not work.

## Provenance

Releases are published from GitHub Actions with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements/), so
every version on the registry carries a signed attestation linking the tarball
back to the commit and workflow run that built it. Verify a local install with:

```bash
npm audit signatures
```

## License

MIT © Benedikt Müller
