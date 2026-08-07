# ursprung

[![npm](https://img.shields.io/npm/v/ursprung)](https://www.npmjs.com/package/ursprung)

_ursprung_ is German for origin. It is intended to become a full-stack TypeScript
application framework written from scratch — its own bundler, its own JSX runtime,
its own type stripping — targeting Cloudflare Workers, with AI agents as its
first-class users.

**None of that is here yet.** This package currently exposes its own name and
version and nothing else. It is published anyway so that the pipeline around it —
trusted publishing, provenance, the release checks — is real rather than
hypothetical, and so the name is held. There is no reason to depend on it.

The architecture is being decided in the open, before it is written:
[the dev log](https://ursprung.dev/posts/) is the readable version, and the
[repository](https://github.com/bndkt/ursprung) carries the glossary, the decision
records and the open questions.

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
