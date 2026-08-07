// THROWAWAY PROTOTYPE — see ../../README.md. Nothing here runs.

// A Server module with no component in it. `startBuild` is imported *by name*
// from a Client module (./watch-toggle.client.tsx) and called like an ordinary
// function; the Server boundary turns that import into a capnweb stub.

import { type Build } from "../format.shared.ts";

// AMBIGUITY (see NOTES.md #4): where does `env` come from? On Workers, bindings
// arrive per-request on the `fetch` handler — they are not module scope. Written
// here as an ambient the framework supplies, which is a decision nobody has made.
declare const env: { BUILDS: KVNamespace; QUEUE: Queue<string> };

export async function startBuild(ref: string): Promise<Build> {
  const id = crypto.randomUUID();
  const build: Build = {
    id,
    ref,
    status: "queued",
    startedAt: Date.now(),
    durationMs: null,
  };
  await env.BUILDS.put(id, JSON.stringify(build));
  await env.QUEUE.send(id);
  return build;
}

// AMBIGUITY (see NOTES.md #1): this export is *not* imported by any Client
// module — only by the API route, a Server module. Under capnweb's
// reachable-by-construction model (ticket 01) it may still end up on the public
// root object. Nothing in the source distinguishes the two cases.
export async function deleteBuild(id: string): Promise<void> {
  await env.BUILDS.delete(id);
}
