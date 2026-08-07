// THROWAWAY PROTOTYPE — see ../../README.md. Nothing here runs.

// The API route: handlers for two HTTP methods, renders nothing.
//
// Note the filename. Constraint 9 admits exactly three suffixes, and an API
// route is a Server module, so it is `.server.ts` like any other — there is no
// `.api.` suffix and nothing in the *name* marks this file as a route. What
// makes it a route is being referenced as one from the route file. See NOTES.md #8.

import { type Build } from "../format.shared.ts";
import { deleteBuild, startBuild } from "../builds/trigger.server.ts";

declare const env: { BUILDS: KVNamespace };

// VARIANT — how handlers are declared. See NOTES.md #8.
//
//   (i)  named exports per method, below. One export per method, appended
//        independently, and a diff that adds DELETE touches only new lines.
//        Uppercase export names are a convention the bundler has to know.
//
//   (ii) a default-exported object:
//
//          export default {
//            async GET(request: Request) { ... },
//            async POST(request: Request) { ... },
//          };
//
//        which is one statically-readable literal — friendlier to a bundler
//        with no scope model — but every edit touches the same expression.

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id === null) return new Response("id required", { status: 400 });

  const raw = await env.BUILDS.get(id);
  if (raw === null) return new Response("not found", { status: 404 });
  return Response.json(JSON.parse(raw) as Build);
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { ref?: string };
  if (typeof body.ref !== "string") {
    return new Response("ref required", { status: 400 });
  }
  const build = await startBuild(body.ref);
  return Response.json(build, { status: 201 });
}

export async function DELETE(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id === null) return new Response("id required", { status: 400 });
  await deleteBuild(id);
  return new Response(null, { status: 204 });
}
