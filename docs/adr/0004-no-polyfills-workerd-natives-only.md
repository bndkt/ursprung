# No polyfills — workerd natives and `cloudflare:*` only

ursprung ships no polyfills on any target. On the server the only permitted external
imports are `cloudflare:*` and those `node:*` specifiers workerd implements natively; a
`node:*` import workerd does not implement natively is a hard build error, and on the
client every `node:*` import is an error. The `node:` prefix is required, so the
unprefixed builtins that `nodejs_compat_v2` legalises are also an error. We considered
carrying Wrangler's unenv polyfills ourselves and rejected it: shipping a polyfill set is
open-ended work that grows with npm's appetite, and it is precisely the general-purpose
bundler complexity the project exists to avoid.

## Consequences

This is stricter than the obvious reading of `nodejs_compat`, and the reason is not
obvious from the code. Wrangler's unenv polyfills are injected by its **esbuild pass** —
the one that disabling bundling switches off (see ADR-0002 and the deployment flow). So a
Worker built by ursprung has strictly less available than the same source built by
Wrangler, and Wrangler itself warns about this combination. Anyone comparing the two and
finding a missing builtin should read this before "fixing" it.

The set of natively-implemented modules is a function of the compatibility date and grows
over time, so the allowed list must be pinned alongside the compatibility date rather
than hardcoded once.

Requiring the `node:` prefix closes a leak rather than adding ceremony: an externals rule
matching `/^node:/` silently misses 76 unprefixed names.

The practical cost is that some npm packages will not build. That is the intended
trade — it surfaces at build time with a named import chain rather than at runtime in
production.
