# Applications may use npm dependencies, ESM only

ursprung applications may import npm packages, so the bundler implements `node_modules`
resolution and `exports` map interpretation — but only for ESM packages. A CJS-only
package is a hard build error naming the package and the import chain that reached it.
We considered restricting applications to relative imports plus the framework itself,
which would have deleted most of the resolver, but rejected it as making the framework
unusable for real work.

## Consequences

CJS support is deferred rather than refused; adding it later means per-module function
wrappers and a small runtime registry in each bundle, which is why it is excluded from
v0 — it is the one thing that would break the flat single-file bundle format.

ursprung itself is not a package manager: it reads whatever `node_modules` tree the
virtual filesystem exposes and never fetches from a registry. Populating that tree is
the caller's job (see ADR-0003).

ursprung's own runtime dependencies remain exactly two — the TC39 Signals polyfill and
capnweb — plus Wrangler for deployment. Every addition beyond these needs the
maintainer's explicit approval.
