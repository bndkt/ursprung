# 23 — Does Workers Builds honour `build.command`?

Type: task
Status: open
Blocked by: —
Map: [ursprung v0](../map.md)
Graduated from: [05 — Wrangler's experimental TypeScript config](./05-wrangler-experimental-config-and-build-contract.md)

## Question

The deployment flow in the vision rests on one unverified assumption: the developer or
agent invokes Wrangler, and **Wrangler runs the configured custom build command**, which
invokes ursprung. Ticket 05 established that `build: { command, cwd, watchDir }` exists
in the experimental TypeScript config and that Wrangler's own source runs it. It also
found that Cloudflare's documentation states Workers Builds **does not honor** Custom
Builds — and this repo deploys via Workers Builds (see `CLAUDE.md`).

Both cannot be true in the way we need. If Workers Builds ignores `build.command`, then
`wrangler deploy` in CI never invokes ursprung, the output directory is empty or stale,
and the deployment flow has to be restructured — most likely by making the Workers Builds
_deploy command_ itself run ursprung before Wrangler, which is a different shape from the
one the vision describes.

This is a **task**, not a research ticket: the answer is only obtainable by observing a
real build. It blocks [ticket 21](./21-ursprung-to-wrangler-output-contract.md), which
cannot specify the contract without knowing who runs the build and when.

## What to do

1. Add a trivial `wrangler.config.ts` to `apps/web` with a `build.command` whose only
   job is to leave evidence it ran — write a file, or emit a distinctive line to stdout
   that will show up in the build log.
2. Push to a branch. Workers Builds is configured to build all branches (see `CLAUDE.md`),
   and non-production branches run `deploy:preview`, so this costs a preview version and
   nothing more.
3. Read the Workers Builds log. Did the command run? If so, with what working directory,
   and at what point relative to the rest of the build?
4. Repeat for the production path if the answer differs between `wrangler deploy` and
   `wrangler versions upload` — ticket 05 found the build command runs before entrypoint
   resolution, but that was observed locally, not in CI.
5. Revert the probe.

The maintainer may need to read the build log if it is not reachable from here — in that
case hand over a precise checklist rather than guessing.

## Answer should record

Whether the command ran; the working directory; the ordering; whether it differs between
the production and preview deploy commands; and, if it does not run, what the
restructured flow has to be.
