# ursprung

A full-stack TypeScript application framework written from scratch — its own bundler,
its own JSX runtime, its own type stripping — targeting Cloudflare Workers, with AI
agents as its first-class users.

This glossary is the project's ubiquitous language. Use these terms verbatim in issues,
commit messages, test names and code. It is a glossary only: no implementation detail,
no decisions. Decisions live in `docs/adr/`.

## Language

### Modules and boundaries

**Module**:
One TypeScript source file in the application or in a package it depends on.
_Avoid_: file, unit

**Side**:
Where a module is allowed to run — server, client, or shared. Every first-party module
declares its side in its filename; third-party modules have theirs inferred.
_Avoid_: environment, target, colour, platform

**Server module**:
A module whose filename carries `.server.` and which may only ever reach the server
output.

**Client module**:
A module whose filename carries `.client.`. It reaches the client output and may also
reach the server output, because client modules render during server rendering.

**Shared module**:
A module whose filename carries `.shared.`, reaching whichever output reaches it. This is
a statement about its Side, not about being emitted once for several entrypoints — that
is a Common module, and the two are independent.

**Server boundary**:
The point where a client module imports from a server module. The bundler replaces the
import with an RPC stub rather than including the code.
_Avoid_: the network boundary, the RPC boundary

**First-party module**:
A module whose real path carries no `node_modules` segment — the application's own source,
including a workspace member. It declares its Side.
_Avoid_: local module, app code

**Third-party module**:
A module reached from inside `node_modules`. It declares nothing and has no Side; a side
suffix in its filename means nothing.
_Avoid_: vendor module, external

### Building

**The graph**:
The single unified module graph the bundler builds from the config file, from which
every output is derived.
_Avoid_: dependency tree, module map, bundle graph

**Colouring**:
Deriving each node's Reach by traversing the graph from its entrypoints. A node's Side is
declared or inferred and is an input to colouring, not its output.
_Avoid_: tainting, marking

**Reach**:
Which outputs a module ended up in — a set drawn from server and client, derived by
colouring. Distinct from Side, which says where a module is _allowed_ to run.
_Avoid_: colour, target, placement

**Client root**:
A client module reached directly from a server or shared module. Every one is an
independent root of the client output; there is no single client entry per Route.
_Avoid_: client entrypoint

**Root entrypoint**:
The module Wrangler is configured with, carrying the router. There is exactly one, and it
is the only server output not reached by an import.

**Route entrypoint**:
The emitted module for one Route on the server, imported lazily by the router once it has
matched. It carries the Route's own modules and its full ancestor Layout chain, so one
import satisfies a matched request. There is one per Route, and **no client counterpart**
— the client output is rooted at Client roots instead.
_Avoid_: route bundle, chunk

**Common module**:
An emitted module that more than one entrypoint reaches, so the build emits it once and
they share it rather than each carrying a copy.
_Avoid_: shared module — that word is taken, and means something unrelated (a Side, not a
position in the graph); vendor chunk

**Emitted module**:
Any module the build writes out, whatever its role. Filenames are content-hashed; a query
string is never used to distinguish two of them, because the host's module registry keys
on the resolved specifier and would treat `x.js?v=2` as a second instance.

There is deliberately **no collective noun** for everything the build emits for one side.
Say "the server output" or "the client output" in prose. The words _server bundle_ and
_route bundle_ were retired on 2026-08-07: each named a single file, and after the
constraint 10 amendment neither is one.

**Type stripping**:
Removing erasable TypeScript syntax from a module while otherwise preserving its
JavaScript source.
_Avoid_: transpilation, compilation

**Erasable syntax**:
The TypeScript constructs that can be deleted without generating replacement JavaScript.
Application code may use no others.

**Virtual filesystem**:
The injected interface through which the build reads every file. The build never touches
a real filesystem, so it can run inside a Worker.
_Avoid_: VFS in prose (fine in code), file adapter

**Build host**:
Whatever invokes the build. It evaluates the config file, supplies the virtual filesystem
and writes the output; it is not part of the build.
_Avoid_: CLI, driver, runner

**Route table**:
The module the build generates from the evaluated route tree, carrying the route set the
router matches against at runtime.
_Avoid_: manifest, route map

### Application surface

**Config file**:
The application's single entry point, evaluated by the build host before the build begins,
from which everything else is discovered.
_Avoid_: manifest, ursprung.json

**Route file**:
Where the application's routes are declared, imported by the config file.

**Module reference**:
How the route file names a module without importing it, resolved against the file that
wrote it. It is never loaded during evaluation.
_Avoid_: lazy import, thunk, pointer

**Route**:
One addressable node in the application's route tree. Nested beneath a root route.

**Page route**:
A route that renders UI. One route may be a page route and an API route at once.
_Avoid_: application route, view

**API route**:
A route that declares handlers per HTTP method.

**Layout**:
The component a route contributes to wrap itself and every route beneath it — as opposed
to the component it renders when matched exactly.
_Avoid_: shell, wrapper, template, slot

**Server component**:
A component defined in a server module.

**Client component**:
A component defined in a client module. It renders on the server during server rendering
and resumes on the client.

### Rendering

**Server rendering**:
Executing components on the server to produce HTML, streamed to the browser in order.
_Avoid_: SSR in prose (fine in code), prerendering

**Resumption**:
The client continuing an application that was rendered on the server, without executing
the component tree again.
_Avoid_: hydration — which is the thing ursprung deliberately does not do

**Resumability payload**:
What the server emits alongside the HTML so that the client can resume.
_Avoid_: hydration data, state blob

**Host**:
The implementation the renderer talks to in order to produce output — the DOM in the
browser, a string on the server, and a native UI layer later.
_Avoid_: renderer, backend, platform

**Intrinsic element**:
An element ursprung knows natively, as opposed to a component. Explicitly enumerated
rather than open-ended.
_Avoid_: host element, tag, primitive
