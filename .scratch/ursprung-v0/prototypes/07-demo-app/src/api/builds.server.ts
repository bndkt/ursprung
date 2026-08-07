// THROWAWAY PROTOTYPE — see ../../README.md. Nothing here runs.

// The API route's handlers. Reconciled with the decision on ticket 07: the
// route file maps HTTP methods to these exports by name, so nothing here is
// called GET or POST and no uppercase-export convention exists.
//
// Note the filename. Constraint 9 admits exactly three suffixes, and an API
// route is a Server module, so it is `.server.ts` like any other — there is no
// `.api.` suffix and nothing in the *name* marks this file as a route. See
// NOTES.md #8.
//
// And note the cost of the decision: reading this file, nothing tells you that
// `removeBuild` is reachable over HTTP, let alone by which verb. Only
// `routes.ts` knows.

import { type Build } from "../format.shared.ts";
import { deleteBuild, startBuild } from "../builds/trigger.server.ts";

declare const env: { BUILDS: KVNamespace };

export async function readBuild(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id === null) return new Response("id required", { status: 400 });

  const raw = await env.BUILDS.get(id);
  if (raw === null) return new Response("not found", { status: 404 });
  return Response.json(JSON.parse(raw) as Build);
}

export async function createBuild(request: Request): Promise<Response> {
  const body = (await request.json()) as { ref?: string };
  if (typeof body.ref !== "string") {
    return new Response("ref required", { status: 400 });
  }
  const build = await startBuild(body.ref);
  return Response.json(build, { status: 201 });
}

export async function removeBuild(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id === null) return new Response("id required", { status: 400 });
  await deleteBuild(id);
  return new Response(null, { status: 204 });
}
