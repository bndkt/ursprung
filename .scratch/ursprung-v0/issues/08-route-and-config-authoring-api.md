# 08 — The route and configuration authoring API

Type: grilling
Status: resolved
Blocked by: 07 (resolved — read the input block below before the questions)
Map: [ursprung v0](../map.md)

## Question

An ursprung application is defined by a single entry point — the config file — from
which the bundler discovers the route configuration and traverses everything else.
This ticket settles what those two files actually look like. React to the variants
prototyped in ticket 07 rather than starting from scratch.

Decide:

- **The config file.** Its name, what it default-exports, and whether it is a plain
  object or a `defineConfig`-style call. What belongs in it beyond the route file
  pointer — output directory, target, base path? What deliberately does not?
- ~~**The route declaration.** Nested object literal, builder calls, or an array of route
  records?~~ **Settled by ticket 07 — do not reopen.** See the input block below.
- **Route identity.** How a route's path is expressed, how nesting composes paths, and
  how a root route differs from its children.
- **Path parameters.** Syntax, how they reach a component or handler, and whether they
  are typed — and if typed, whether that costs us anything given constraint 8's no-type-
  model parser. Wildcards and optional segments: in or out for v0?
- **Page routes vs API routes.** Are they two variants of one declaration or two
  different constructs? An API route declares handlers per HTTP method — what is the
  handler signature, and what does it receive and return?
- **Layouts.** Does a nested route's parent contribute wrapping UI? If so, is that the
  same thing as the parent's component, or a separate slot? This is the decision most
  likely to be regretted later.
- **Data loading.** Does v0 have a loader concept at all, or do server components fetch
  inline? Server components can be async (constraint 12), which may make loaders
  redundant — argue it out rather than assuming.
- **What the bundler needs statically.** Whatever shape wins must let the bundler
  determine the complete route set **without executing arbitrary application code**, or
  by executing it in a way that is safe inside a Worker. Any dynamic route construction
  the shape permits is a problem — decide explicitly what is forbidden.

Each route becomes a client entry point, so this decision directly shapes ticket 12's
graph model and ticket 14's emission.

## Established by ticket 07 — treat as input, not open

> ⚠️ **Superseded in part by the Answer below.** The premise stated here — that the
> bundler reads the route tree as data and cannot evaluate it — was rejected during this
> ticket. The config is evaluated, so the route tree need not be a literal and the lazy
> thunk form is gone. Read the Answer before acting on anything in this section.

The [demo app prototype](../prototypes/07-demo-app/) settled three of this ticket's
questions and sharpened the rest. The winning shape is
[`routes.ts`](../prototypes/07-demo-app/routes.ts); the rejected alternatives are under
`variants/`, each with an account of what it cost.

- **The route declaration is a nested object literal.** Builder calls are **not
  viable** — the bundler reads the route tree as data from the AST and cannot evaluate
  it, since evaluating means building first. Flat shapes lost because prefix inference
  cannot express a pathless layout. This answers the "what the bundler needs statically"
  question below too: the route file must be a literal, and any dynamic construction is
  forbidden by that alone.
- **Components and handlers are referenced lazily**, as `() => import("./x.server.tsx")`,
  not imported at the top of the route file. The specifier stays a string literal in the
  AST, so nothing is evaluated. This is also what stops a Route entry dragging in every
  other route's code.
- **API route methods are declared in the route file**, mapped to arbitrarily-named
  exports — so there is no uppercase-export convention, and the route file is the
  application's entire declared HTTP surface. That property is load-bearing for ticket
  20: naming the callable exports in one place **is** the allowlist capnweb does not
  provide.

Still open, and now sharper — these are the real agenda:

- **The `.then((m) => m.export)` pattern-match.** The bundler must recognise that exact
  AST shape to learn the export name. Typed and navigable, but fragile: a developer who
  writes it any other way gets a build error for no visible reason. A `{ module, export }`
  pair would be robust and untyped. Decide deliberately (NOTES #19).
- **Route specificity.** `/builds/new` versus `/builds/:id` needs a rule. Source order
  looks meaningful in a nested literal and must not be.
- **Are the Config file and the route file exempt from constraint 9?** Both are
  unsuffixed. The lazy-reference decision narrowed this — the route file imports no
  component, so the case for it being a Server module is weak — but the thunks are still
  code. **A one-line rule settles it and this ticket owes that line** (NOTES #12).
- **How the Config file reaches the routes**, by path string or import, is now a matter of
  taste rather than force: lazy references removed the colouring pressure that made the
  import form dangerous (NOTES #10).
- **Route params typing** (NOTES #6) and **`props.children` versus `<Outlet />`**
  (NOTES #5) surfaced here but belong to this ticket and ticket 09 respectively.

## Answer

**The premise this ticket inherited was wrong, and fixing it changed most of the
answers.** Ticket 07 held that the bundler reads the route tree as data from the AST
because evaluating the config would mean building it first. That reasoning does not
hold — see "The premise" below — and the maintainer rejected it on a stronger ground
than feasibility: a `.ts` file that is read rather than run is a trap. `process.env`,
`new Date()`, a loop over locales all typecheck, all look correct, and all silently do
nothing.

So: **the config is evaluated.** Everything else follows from that.

### The shape

```ts
// ursprung.config.ts — evaluated by the host, before the build
import { defineConfig } from "ursprung";
import cf from "./cloudflare.config.ts";
import routes from "./routes.ts";

export default defineConfig({ routes, compatibilityDate: cf.compatibilityDate, outDir: "./dist" });
```

```ts
// routes.ts — a real program, not a literal
import { defineRoutes } from "ursprung";

export default defineRoutes({
  layout: new URL("./src/root.server.tsx", import.meta.url),
  component: new URL("./src/home.server.tsx", import.meta.url),
  children: [
    {
      path: "builds",
      component: new URL("./src/builds/index.server.tsx", import.meta.url),
      children: [
        { path: ":id", component: new URL("./src/builds/detail.server.tsx", import.meta.url) },
      ],
    },
    {
      path: "api/builds",
      api: {
        GET: { module: new URL("./src/api/builds.server.ts", import.meta.url), export: "readBuild" },
        POST: { module: new URL("./src/api/builds.server.ts", import.meta.url), export: "createBuild" },
      },
    },
  ],
});
```

### The decisions

1. **The build evaluates the config, in the host, before the build begins.** `ursprung
   build` evaluates `ursprung.config.ts` with a native `import()`. The build function
   proper receives `{ vfs, config }` where `config` is already plain evaluated data; it
   stays pure and touches no Node API, so **constraint 4 is untouched** and
   build-in-a-Worker stays reachable — that host supplies the evaluated data by whatever
   means it has. This is a statement about where the build *starts*, and ticket 10
   inherits it as a decided input.

2. **Two files; the Config file imports the Route file.** `import routes from
   "./routes.ts"`. tsc verifies the specifier and editors navigate it. Ticket 07's lazy
   references had already removed the colouring pressure that made the import form
   dangerous (NOTES #10); evaluation makes it the only sensible form, since a path string
   would have to be read *and* evaluated separately.

3. **Neither file is in the graph, and constraint 9 needs no amendment.** Constraint 9
   errors on an unsuffixed module *"reached by the graph"*, and `CONTEXT.md` defines the
   graph as the one built **from** the config file. The Config file is its root, not a
   node in it; the Route file is build input evaluated by the host alongside it. The rule
   this ticket owed (NOTES #12), in one line:

   > The Config file and the Route file are build input, not modules in the graph. They
   > carry no side suffix, and any module in the graph that imports them is a
   > constraint 9 error.

   That last clause closes the hole without a special case: an application module
   importing `routes.ts` drags an unsuffixed file into the real graph, which constraint 9
   already rejects, unchanged.

   **Consequence, and it is a commitment rather than a freebie:** the runtime router
   cannot import the Route file, so the route table must be **generated and emitted by
   the bundler**. Ticket 21 inherits this. It is probably an upside — a generated table
   can carry resolved specifiers and pre-sorted specificity instead of re-deriving them
   per request.

4. **Module references are data, not thunks:** `new URL("./x.server.tsx",
   import.meta.url)`, and `{ module, export }` for an API method. Standard JS, no loader
   machinery, and it composes across files for free because each file resolves against
   its own module.

   This kills `() => import(...)` and the `.then((m) => m.readBuild)` pattern-match
   (NOTES #19). Under evaluation a thunk is opaque — the build cannot look inside it and
   must not call it, since that would execute application modules at build time and Node
   cannot load `.tsx` at all. A thunk would be the same affordance lie as an unevaluated
   `.ts` config, one level down: it looks like it will be called and never is.

   **The accepted cost is types.** A `new URL` carries no link to the module's exports,
   so an API method's `export` is a bare string. The upgrade path is cheap and local —
   Wrangler's `cf-worker` import attribute pattern (an import short-circuited by a
   resolve hook to `export default "<path>"`) is typed and navigable, and swapping a leaf
   to it later changes nothing about the tree's shape. It was declined for v0 because it
   needs a `node:module` `registerHooks` implementation plus a Bun equivalent, and Bun's
   plugin API dispatches on filename patterns rather than import attributes — that half
   is unresearched.

5. **`component` is the page; `layout` is a separate optional field.** `layout` wraps
   this node and everything below it; `component` renders when this node matches exactly.
   One meaning per field, and nothing about a node depends on what matched.

   The prototype's implicit dual-role model has a hole nobody had flagged: its root is
   `{ path: "/", component: RootLayout, children: [...] }` where `RootLayout` renders
   `<html>…{props.children}…</html>`, and **nothing can render at exactly `/`**. A node
   wanting both roles would have to branch on `props.children` being undefined, which no
   type can express. The prototype named the field `component` and the function
   `RootLayout`; the naming already knew.

   A **pathless layout** — ticket 07's whole reason for choosing the nested literal — is
   now just a node with `layout` and `children` and neither `path` nor `component`.

6. **The root omits `path` entirely.** `path` is always one or more bare segments;
   omitting it adds no segment, which is exactly what the root does. No special case
   anywhere, and — the real reason — **a composable subtree file has the same shape as
   the app root**, so it is mountable anywhere without editing. A subtree declaring
   `path: "/"` would be asserting it lives at the site root, which is precisely what a
   mountable subtree must not do.

   Child paths are **relative** and join onto their ancestors'. A **leading slash on any
   node is a hard error** — React Router's absolute-escape behaviour would let a spliced
   subtree break out of its mount point, destroying the portability composition exists
   for. A trailing slash or an empty-string `path` is an authoring error. **Multi-segment
   paths are allowed** (`path: "api/builds"`), rather than forcing a meaningless
   intermediate node.

7. **Segment kinds are static and `:param` only.** No wildcards, no optional segments.
   The canonical demo app needs `/builds/:id` and nothing more, every extra kind costs
   matcher, specificity rule and typing surface, and adding a kind later is additive. A
   wildcard is the obvious first addition and is one rule; optional segments are the
   expensive one — they make a single node match several URL shapes and type every param
   as `string | undefined`, for something two sibling nodes already express.

8. **Specificity: static beats param, left to right; identical full paths are a build
   error.** Flatten each node to its full path, then compare candidates segment by
   segment — the first position where one is static and the other is a param decides, so
   `/builds/new` beats `/builds/:id`. **Declaration order is never consulted**, which
   ticket 07 required and composition makes more important: a spliced subtree's position
   is an accident of assembly. The one case the rule cannot adjudicate — two nodes
   flattening to the same path — fails the build loudly rather than picking a winner,
   because composition makes an accidental double mount newly reachable.

9. **One node type; page fields and `api` may coexist.** A node may carry
   `component`/`layout` and `api` together. A present `api.GET` handles GET; an absent one
   falls through to page rendering. This gives forms a natural home at the page's own
   URL — see the fog note below.

10. **API handlers are `(request, context)`, with `context.params`.** Keeps the familiar
    `Request → Response` reading, and puts everything route-shaped in one extensible bag
    so that **ticket 25 stays free** to put bindings on `context` or make them ambient
    without changing arity. Mirroring Workers' own `fetch(request, env, ctx)` was
    rejected for exactly that reason — it decides ticket 25's question in the signature,
    and leaves path params homeless.

    Components receive `props.params`; layouts additionally receive the matched child
    (whose shape is ticket 09's `children`-versus-`<Outlet />` call). Neither receives
    `request` by default — same seam, same ticket.

11. **Route params are typed by hand and cannot be verified.** NOTES #6 recorded that "no
    good option surfaced". The finding is stronger: **no option exists**, and it follows
    from two decisions already locked. Constraint 8 rules out a type model, so the build
    cannot inspect a component's declared props; and decision 4's `new URL` reference
    carries no type link back to the module. So `RouteProps<{ id: string }>` restates
    `path: ":id"` by hand and a mismatch is silent. The alternative — `Record<string,
    string>` plus a cast in every route component — is strictly worse for the agents this
    framework is built for. Adopting the `cf-worker` attribute form later is what would
    reopen this.

12. **No loader concept; async Server components fetch inline.** The usual argument for
    loaders is parallelism, and constraint 12 blunts it — in-order streaming blocks at an
    async component's position regardless, and a component can already start a fetch at
    the top and await it later by hand.

    The strong argument is different and was declined deliberately: **a loader runs before
    any markup flushes**, so a 404 or redirect discovered while loading can still set a
    status code. That is NOTES #7 and it is the whole of ticket 26, which is blocked on
    ticket 18 and has not run. Introducing a mechanism for a problem another ticket owns,
    before that ticket has the analysis, is the wrong order. Ticket 26 may well conclude
    it needs a pre-render hook that can short-circuit with a `Response`; that is additive
    and nothing here forecloses it.

13. **The Config file** is `ursprung.config.ts`, default-exporting a `defineConfig({...})`
    call — type identity now, a place for validation later, and it matches `defineWorker`
    next door. It carries `routes`, `compatibilityDate`, and an `outDir` that ticket 21
    may refine. It does **not** carry a VFS `root` — the host derives that from the config
    file's own location — nor a base path, nor a target; v0 has neither.

14. **`compatibilityDate` is a required field, and wiring it to Wrangler's is the
    application's choice.** NOTES #11 saw two ways out and disliked both: Ursprung reads
    Wrangler's config, coupling us to an unstable experimental format; or Ursprung asks
    for the date again and the two drift. Evaluation supplies a third — the app writes
    `import cf from "./cloudflare.config.ts"` and passes `cf.compatibilityDate`. One line,
    no drift, and **Ursprung never learns that Wrangler exists**; the coupling belongs to
    the app, and an app deploying another way writes a literal instead.

    One caveat to record: this works only while `cloudflare.config.ts` is plainly
    importable. An app using the `cf-worker` import attribute for its `entrypoint` would
    need Wrangler's loader hook to import it, and must write the date literally.

### The premise, corrected

Ticket 07 and NOTES #9 argued the bundler cannot evaluate the route file because
"evaluating it means building it first, and building is the thing that needs the route
tree". **That is not circular, and the argument should not be reused.** It conflates two
graphs: building the *config* graph needs resolution and type stripping, neither of which
needs the route tree. The route tree is needed only to emit *route* bundles. Two phases,
no cycle.

Facts established while testing the premise, all worth keeping:

- **`eval()` and `new Function()` are disallowed on workerd** — "Code generation from
  strings disallowed for this context". The naive in-process form of "evaluate the
  config" cannot run inside a Worker at all.
- **Dynamic Workers** (the `worker_loaders` binding, `env.LOADER.load({ mainModule,
  modules })`) is the mechanism that would make it possible: a fresh sandboxed isolate
  built from module source strings, with controllable bindings and `globalOutbound: null`,
  linking multiple ES modules against each other. It takes already-stripped JavaScript —
  no build step inside — which suits constraint 8 fine. Not needed under decision 1, since
  evaluation left the build entirely, but this is where it would go.
- **Wrangler evaluates its own config; it does not parse it.** `loadConfig` is a bare
  `await import(pathToFileURL(configPath))`. **Node ≥22.18 strips types natively**, which
  is the entire reason for that version floor; Bun runs `.ts` directly. No esbuild, no
  bundle pass. The `registerHooks` machinery around it exists for two things Ursprung does
  not need: cache-busting plus a recorded `dependencies` set, which is watch-mode
  infrastructure that constraint 11 rules out; and the `cf-worker` import attribute. Node's
  stripper also rejects non-erasable syntax, so a config file lands under roughly
  constraint 8's rules for free, and Node's required explicit `./routes.ts` extension is
  already this repo's house style.
- **Wrangler's `entrypoint` accepts both forms** — a path string, or `import * as
  entrypoint from "./src" with { type: "cf-worker" }` where a resolve hook short-circuits
  to a synthetic `export default "<path>"` so the module is never loaded, while the type
  system still sees the real namespace (that is what `InferMainModule<T>` reads). It is
  the closest precedent to this ticket's problem and the source of decision 4's named
  upgrade path.
- Wrangler **refuses to run under Bun** for config loading — `"cloudflare.config.ts loading
  is not supported on Bun. Please use Node.js v22.18.0 or higher."` — because `registerHooks`
  does not exist there. Not a problem for this repo: a `wrangler deploy --dry-run` run here
  executes under Node 22.22 regardless of `bun run`.

### What this does to ticket 07

Ticket 07's rejection of **variant C (builder calls)** rested entirely on the premise
above, and that reasoning is now void — builder calls are evaluable. The **conclusion
survives on independent grounds**: the nested literal won on readability and on pathless
layouts falling out for free, and both still hold. Ticket 07's file has been annotated so
the dead argument is not reused. Its other two findings — lazy references, and API methods
declared in the route file — are unaffected in intent; the lazy *form* is superseded by
decision 4 while the property that mattered (the route file is the application's entire
declared HTTP surface, and that naming **is** the allowlist capnweb does not provide) is
untouched.

### Handed to other tickets

- **Ticket 10** — the build receives `{ vfs, config }` with `config` already evaluated;
  the host normalises evaluated `file://` references to VFS-relative paths at the boundary.
- **Ticket 21** — must emit a generated route table module; also owns `outDir`.
- **Ticket 25** — the handler's `context` is the seam for bindings.
- **Ticket 26** — inherits the status-code hole intact; loaders were considered and declined.
- **Ticket 09** — `layout` is a distinct field from `component`; `children`-versus-`<Outlet />`
  is still its call.
- **Ticket 12** — the Config and Route files are outside the graph.

Recorded as [ADR-0005](../../../docs/adr/0005-the-host-evaluates-the-config-before-the-build.md).
