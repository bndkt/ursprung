# First-party modules declare their side in the filename

Every first-party module must carry `.server.`, `.client.` or `.shared.` in its filename;
an unsuffixed `.ts`/`.tsx` reached by the graph is a build error. We chose this over
inferring a module's side from how it is imported, or defaulting unsuffixed files to
shared, because it makes the server/client boundary visible in every import statement and
every directory listing — an agent can answer "which bundle is this in?" without running
the bundler, and the colouring algorithm needs no inference for code we control.

## Consequences

The verbosity is deliberate and is the clearest instance of the project's
"formerly unreasonable expectation" principle: a human would find renaming every file
tedious, an agent will not notice.

Third-party modules are exempt — they cannot grow a suffix, so their side is inferred
from reachability instead. The asymmetry is safe because the invariant that matters
(server code never reaches a route bundle) is enforced by first-party server modules,
which are always declared.

Reversing this later means renaming every file in every ursprung application.
