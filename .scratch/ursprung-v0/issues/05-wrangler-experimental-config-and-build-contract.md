# 05 — Wrangler's experimental TypeScript config: no_bundle, assets, and the build contract

Type: research
Status: open
Blocked by: —
Map: [Ursprung v0](../map.md)

## Question

The vision asks for Wrangler's experimental TypeScript configuration **and** disabled
bundling, with a custom build command that invokes Ursprung. This repo already uses the
experimental config (see `apps/web/cloudflare.config.ts` and the notes in `CLAUDE.md`),
so half the facts are local. Ticket 21 designs the Ursprung→Wrangler output contract and
needs the rest confirmed rather than assumed.

Establish from primary sources — `@cloudflare/config`'s type definitions, Wrangler's
`src/experimental-config`, Wrangler's own source for the deploy path, and Cloudflare's
documentation:

- **Does the experimental TypeScript config support disabling bundling at all?** The
  JSON format has `no_bundle`; find the camelCase equivalent in the experimental schema,
  or establish that it is absent. If absent, find what the alternatives are — the schema
  is a Zod `strictObject`, so a guessed key is a hard error. This is the single most
  important fact in this ticket.
- **Is there a custom build command field**, and what is its exact name and semantics in
  the experimental config? When does Wrangler run it relative to reading the entrypoint,
  and what working directory does it run in?
- With bundling disabled, **what exactly does Wrangler upload?** Does it take the single
  entrypoint file only, or does it follow imports? What are the rules for additional
  modules — file extensions, `rules`/module rules, relative path handling inside the
  uploaded worker? This defines the shape our server bundle must take.
- **Static assets**: how are they configured in the experimental config, what directory
  layout is expected, how does the assets binding and its routing behaviour work
  (SPA vs not, `run_worker_first`, 404 handling), and how do asset requests interact
  with the Worker's own fetch handler? Our client bundles are assets.
- What does `wrangler deploy --dry-run --experimental-new-config` validate and what does
  it skip? We want the cheapest possible validation loop.
- How does all of the above behave under **Workers Builds** (this repo deploys that way,
  see `CLAUDE.md`) — does the custom build command run there, and what is the working
  directory?
- Any constraints on **Worker size limits**, module count, or startup CPU time that a
  flat single-file bundle would run into.

Write the findings to `.scratch/ursprung-v0/research/05-wrangler.md`, citing sources.
Where a fact is only discoverable by running Wrangler, run it against this repo's
`apps/web` and record what you observed.
