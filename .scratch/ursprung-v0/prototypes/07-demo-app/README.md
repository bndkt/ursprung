# THROWAWAY — the canonical demo app, written as if ursprung v0 existed

Prototype for [ticket 07](../../issues/07-canonical-demo-app-prototype.md).

**None of this runs. None of it is framework code. It imports a package that does
not exist.** It is the source a developer or agent would write, sketched before
any API was designed, so that tickets 08 and 09 argue with an artifact instead of
a blank page. Delete it once those tickets are resolved.

## The questions it is trying to settle

1. **What does the route file look like?** Three variants, same four routes.
2. **What does the Config file look like,** and how does it reach the routes?
3. **What does a Client component that calls a Server function look like** when
   the call is written as an ordinary import?
4. **Where does it feel wrong?** → [NOTES.md](./NOTES.md), which is the actual
   output of this ticket.

## The app

A build log. Chosen because every claim the destination makes has an honest
reason to appear in it, not because it is interesting.

```
ursprung.config.ts             the Config file — single entry point
routes.ts                      ★ the route file — the shape that won
variants/
  a-nested-literal/routes.server.ts   variant A — nested literal, eager imports
  b-record-array/routes.server.ts     variant B — flat records with ids
  c-builder/routes.server.ts          variant C — builder calls (ruled out)
  d-flat-lazy/routes.ts               variant D — flat, full paths, lazy refs
src/
  root.server.tsx              root route, Server component, nav + child slot
  format.shared.ts             Shared module — reached from both sides
  builds/
    index.server.tsx           async Server component; data arrives late
    detail.server.tsx          nested child route /builds/:id
    watch-toggle.client.tsx    Client component: signals + RPC import
    trigger.server.ts          the Server module the Client component imports
  api/
    builds.server.ts           API route: GET, POST, DELETE
```

Route tree: `/` → `/builds` → `/builds/:id`, plus `/api/builds`.

Checked against the destination's list: nested route tree ✓, API route with two+
methods ✓, Server component reading server-only state ✓, Client component with a
signal-driven interaction ✓, Shared module ✓, Client component importing from a
`.server.ts` ✓, async Server component forcing the streaming question ✓.

## How to read it

Start with `routes.ts` — the shape that won: a nested object literal carrying
lazy module references, with API methods declared in the route file. The four
files under `variants/` are the alternatives it beat, each ending in an honest
account of what it cost.

Then `watch-toggle.client.tsx`, where the Server boundary, the signals and
Resumption all land in one file. Then `NOTES.md` end to end.

Inline `AMBIGUITY (see NOTES.md #n)` comments mark every place the sketch is
guessing. There are nineteen notes; three are now decided and the rest are the
agenda for tickets 08, 09, 19, 20 and 25.
