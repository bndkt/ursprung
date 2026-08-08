# 23 — Does Workers Builds honour `build.command`?

Type: task
Status: resolved
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

## Answer

**Workers Builds runs `build.command`.** The documentation note is true about a
different thing than it appears to be, and the vision's deployment flow needs no
restructuring.

Observed on a real Workers Builds run of commit `42552a1` on branch
`claude/ursprung-v0-map-fwgs6h`, 2026-08-08, wrangler 4.119.0, under
`--experimental-new-config`. The probe wrote its evidence into `public/`, so it
came back off the branch preview URL rather than out of the dashboard:

```
$ curl https://claude-ursprung-v0-map-fwgs6h-ursprung-web.bndkt.workers.dev/wb-probe.txt
ran=yes
pwd=/opt/buildhome/repo/apps/web
wrangler_command=versions upload
workers_ci=1
workers_ci_branch=claude/ursprung-v0-map-fwgs6h
ci=true
styles_css_exists=yes
public_listing_before_probe=posts styles.css
```

### 1. Did it run?

Yes — `ran=yes`, from inside Cloudflare's build container (`/opt/buildhome/repo`,
`workers_ci=1`). Nothing strips or ignores the `build` block.

### 2. Working directory

`/opt/buildhome/repo/apps/web` — the **Root directory** dashboard setting, which is
where Workers Builds invokes the deploy command, i.e. plain `process.cwd()`.

This is worth stating precisely, because Wrangler treats the two `build` paths
differently and only one of them is config-relative. In `normalizeAndValidateBuild`,
`watch_dir` is resolved against `path.dirname(configPath)`; `cwd` is returned
**unnormalised** and handed straight to execa, which resolves it against
`process.cwd()`. So an unset `build.cwd` means "wherever Wrangler was invoked
from", *not* "next to the config file". Here the two coincide because Root
directory is `apps/web`; in a layout where they did not, a config-relative
`build.cwd` would be wrong.

### 3. Ordering

1. Workers Builds runs the dashboard **Deploy command** with cwd = Root directory.
   The dashboard **Build command** field is empty and stays empty.
2. That command is `bun run deploy:preview`, whose first step is `build:css` —
   hence `styles_css_exists=yes` before the custom build ran at all.
3. Wrangler parses the config, then `mergeSharedConfigArgs` → `getEntry()` →
   `runCustomBuild()` runs `build.command`.
4. Only afterwards: the entrypoint-exists assertion, `buildWorker` (esbuild), and
   the assets read.

The fourth point is the one that matters most to ursprung and it is **observed, not
inferred**: `wb-probe.txt` did not exist when the custom build started
(`public_listing_before_probe=posts styles.css`) and was nonetheless served from the
deployed version. A custom build can therefore *generate the contents of the assets
directory* and have them uploaded in the same run. That is exactly the shape
ursprung needs for its client output.

Locally, `wrangler deploy --dry-run --experimental-new-config` shows the same order
explicitly:

```
[custom build] Running: sh ./scripts/workers-builds-probe.sh
[custom build] [ticket-23-probe] custom build ran: pwd=… wrangler_command=deploy
✨ Read 9 files from the assets directory …/apps/web/public
```

### 4. Production versus preview

**Identical, and identical by construction rather than by coincidence.**
`mergeDeployConfigArgs` and `mergeVersionsUploadConfigArgs` both delegate to
`mergeSharedConfigArgs`, which is the sole caller of `getEntry()` on the deploy
path; `runCustomBuild` is unconditional inside it, with no CI gate, no `noBundle`
gate and no command discrimination. The only difference reaching the build command
is the value of the `WRANGLER_COMMAND` environment variable Wrangler exports to it
— `versions upload` in the CI run above, `deploy` in the local dry run.

Honest limit: the CI half of this was observed on the **preview** path only, since
the production path runs on `main` and this ticket is not worth a `main` push. The
`deploy` value was observed locally instead. Given the shared code path, the
residual risk is not that `deploy` skips the custom build but that Workers Builds
orchestrates production runs differently — and `WORKERS_CI`/Root directory
behaviour is not command-specific, so that risk is small. If a cheap confirmation
ever presents itself, the first `main` build after any ursprung-shaped change to
the deploy flow is it.

### 5. Reconciling the documentation

Cloudflare's note reads:

> Currently, Workers Builds does not honor the configurations set in Custom Builds
> within your Wrangler configuration file.

It sits in the build-settings table on
[Workers Builds → Configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
beside **Build command**, **Deploy command** and **Root directory**. Read there, the
claim is about **Workers Builds' own orchestration**: the platform does not read
`[build]` out of your Wrangler config to populate or replace its Build command
field. It is not a claim that the command never executes — and it cannot be, because
the Deploy command literally invokes Wrangler inside the build container, and
Wrangler runs `build.command` itself as part of resolving the entrypoint.

So both halves of ticket 05's contradiction were true and were never in conflict:
Workers Builds ignores the config's build block; Wrangler, which Workers Builds
runs, does not. The note is misleading rather than wrong, and the misleading part
is that it says *Workers Builds* where it means *the Workers Builds build step*.

**Do not build on the note being stable in either direction.** It is hedged with
"Currently", and the behaviour observed here is a consequence of Wrangler's
internals, not of a documented contract.

### Consequences and riders

- **Ticket 21 is unblocked**, and it inherits an unforced choice rather than a
  constraint: ursprung can be invoked from `build.command` in the Wrangler config,
  or from the dashboard Deploy command ahead of Wrangler. Both work. The argument
  for `build.command` is that one config serves CI, `wrangler deploy` and
  `wrangler dev` alike, with nothing duplicated into a dashboard field; the argument
  against is that a build failure then surfaces as a Wrangler `UserError` wrapping
  whatever ursprung printed, and that the mechanism rests on the undocumented
  reading above.
- **`WRANGLER_COMMAND` is available** to whatever ursprung runs as, should the
  output ever need to differ between `deploy` and `versions upload`. v0 has no such
  need; recorded so it is not rediscovered.
- **Rider for ticket 21, sharpened rather than introduced by this ticket.** Being
  able to generate the assets directory is only half of what ursprung needs; the
  other half is the *server* output, and ticket 05 established that under `noBundle`
  the entrypoint is uploaded byte-for-byte with its imports not followed. Constraint
  10's per-Route modules therefore still need `findAdditionalModules`/`rules` to be
  uploaded at all. Nothing here changes that — it just means the client half is
  settled and the server half is where ticket 21's work actually is.

### Probe, and its removal

Added in `42552a1` (`apps/web/scripts/workers-builds-probe.sh` plus a `build` block
in `apps/web/wrangler.config.ts`), reverted in the commit that carries this answer.
`apps/web/wrangler.config.ts` is back to its pre-probe contents; nothing about the
site's deployment is changed by this ticket.
