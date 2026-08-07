// THROWAWAY PROTOTYPE — see ../../README.md. Nothing here runs.

// The nested child route: /builds/:id. Exists mainly to force the question of
// how a component receives its route params.

import { type Build, formatDuration, statusLabel } from "../format.shared.ts";
import { type RouteProps } from "ursprung";

declare const env: { BUILDS: KVNamespace };

// AMBIGUITY (see NOTES.md #6): params arrive as a prop here, typed by a generic
// on the path string. That typing trick needs template-literal inference over a
// value the *bundler* knows and the *type system* has to be told separately —
// the route file's `path` is a string literal in a data structure, not a type.
// The alternative is an untyped `Record<string, string>` and a cast at the top
// of every route component, which is worse for agents but honest.
export default async function BuildDetail(props: RouteProps<{ id: string }>) {
  const raw = await env.BUILDS.get(props.params.id);
  if (raw === null) {
    // AMBIGUITY (see NOTES.md #7): what is a 404 from inside a component that
    // has already streamed its parent's markup? The status line is long gone.
    return <p>No such build.</p>;
  }

  const build = JSON.parse(raw) as Build;
  return (
    <article>
      <h2>{build.ref}</h2>
      <dl>
        <dt>Status</dt>
        <dd>{statusLabel(build.status)}</dd>
        <dt>Duration</dt>
        <dd>{formatDuration(build.durationMs)}</dd>
      </dl>
    </article>
  );
}
