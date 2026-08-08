#!/bin/sh
# TEMPORARY PROBE — .scratch/ursprung-v0/issues/23-does-workers-builds-honour-build-command.md
#
# Cloudflare's docs say Workers Builds "does not honor the configurations set in
# Custom Builds within your Wrangler configuration file"; Wrangler's own source
# runs `build.command` unconditionally from `getEntry()`. This script is the
# observation that settles which is true in CI.
#
# It leaves evidence on two channels:
#   1. stdout, which Wrangler prefixes with `[custom build]` in the build log;
#   2. `public/wb-probe.txt`, which — if the custom build really does run before
#      Wrangler collects the assets directory — is deployed as a static asset and
#      is then readable at the branch preview URL without dashboard access.
#
# Delete this file and the `build` block in `wrangler.config.ts` once the ticket
# has its answer.
set -eu

listing=$(ls ./public | tr '\n' ' ')
styles=no
if [ -f ./public/styles.css ]; then
  styles=yes
fi

{
  echo "ran=yes"
  echo "pwd=$(pwd)"
  echo "wrangler_command=${WRANGLER_COMMAND-<unset>}"
  echo "workers_ci=${WORKERS_CI-<unset>}"
  echo "workers_ci_branch=${WORKERS_CI_BRANCH-<unset>}"
  echo "ci=${CI-<unset>}"
  echo "styles_css_exists=${styles}"
  echo "public_listing_before_probe=${listing}"
} >./public/wb-probe.txt

echo "[ticket-23-probe] custom build ran: pwd=$(pwd) wrangler_command=${WRANGLER_COMMAND-<unset>}"
