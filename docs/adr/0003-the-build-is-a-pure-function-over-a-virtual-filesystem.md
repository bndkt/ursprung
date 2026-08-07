# The build is a pure function over a virtual filesystem

`ursprung build` takes an injected virtual filesystem and produces output files, touching
no Node filesystem or process API anywhere in the build system. There is no dev server,
no watch mode and no HMR — one code path, one entry point. We chose this because the
build must be able to run inside a Cloudflare Worker, and that is a property that cannot
be retrofitted: a single `node:fs` import anywhere in the build would forfeit it.

## Consequences

The absence of a dev server is not only scope-cutting. A dev server would be a second
code path through the bundler — incremental, stateful, watching — and statefulness is
exactly what the purity requirement forbids. The two decisions reinforce each other, so
adding a dev server later should be understood as adding a second implementation, not as
extending this one.

Because Ursprung only ever reads the virtual filesystem, whoever invokes the build is
responsible for populating it: the CLI mounts the real filesystem, and an agent running
inside a Worker materialises the application and its packages from R2 or elsewhere.

Local development is `ursprung build` followed by `wrangler dev` against the output.
