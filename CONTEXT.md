# Ursprung

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
A module whose filename carries `.server.` and which may only ever be emitted into the
server bundle.

**Client module**:
A module whose filename carries `.client.`. It is emitted into client bundles and may
also appear in the server bundle, because client modules render during server rendering.

**Shared module**:
A module whose filename carries `.shared.`, emitted into whichever bundles reach it.

**Server boundary**:
The point where a client module imports from a server module. The bundler replaces the
import with an RPC stub rather than including the code.
_Avoid_: the network boundary, the RPC boundary

### Building

**The graph**:
The single unified module graph the bundler builds from the config file, from which
every output is derived.
_Avoid_: dependency tree, module map, bundle graph

**Colouring**:
Assigning a side to each node in the graph and propagating it along edges.
_Avoid_: tainting, marking

**Server bundle**:
The single output containing all code that runs on the server, including client modules
that participate in server rendering.
_Pending change_: an amendment proposed on 2026-08-07 replaces this with a root
entrypoint plus one module per route. See `.scratch/ursprung-v0/map.md`, Pending
amendments. Do not rename anything until that lands.

**Route bundle**:
The output for one route, loaded by the browser. There is one per route.
_Avoid_: client bundle (ambiguous — prefer this term when a specific route's output is
meant), chunk
_Pending change_: the same amendment makes this an entry module plus shared modules
rather than one file, and leaves no term for a shared emitted module.

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

### Application surface

**Config file**:
The application's single entry point, from which the bundler discovers everything else.
_Avoid_: manifest, ursprung.json

**Route file**:
Where the application's routes are declared, discovered by the bundler from the config
file.

**Route**:
One addressable node in the application's route tree. Nested beneath a root route.

**Page route**:
A route that renders UI.
_Avoid_: application route, view

**API route**:
A route that declares handlers per HTTP method and renders nothing.

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
_Avoid_: hydration — which is the thing Ursprung deliberately does not do

**Resumability payload**:
What the server emits alongside the HTML so that the client can resume.
_Avoid_: hydration data, state blob

**Host**:
The implementation the renderer talks to in order to produce output — the DOM in the
browser, a string on the server, and a native UI layer later.
_Avoid_: renderer, backend, platform

**Intrinsic element**:
An element Ursprung knows natively, as opposed to a component. Explicitly enumerated
rather than open-ended.
_Avoid_: host element, tag, primitive
