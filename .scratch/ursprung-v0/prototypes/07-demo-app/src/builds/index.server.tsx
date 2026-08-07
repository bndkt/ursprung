// THROWAWAY PROTOTYPE — see ../../README.md. Nothing here runs.

// The async Server component the destination asks for: its data arrives late, so
// under constraint 12 it blocks the stream at its position. Everything the root
// layout emitted above it has already flushed; nothing below it can flush until
// `listBuilds()` settles.

import { type Build, formatDuration, statusLabel } from "../format.shared.ts";
import { type ComponentProps } from "ursprung";
import WatchToggle from "./watch-toggle.client.tsx";

declare const env: { BUILDS: KVNamespace };

async function listBuilds(): Promise<Build[]> {
  const listed = await env.BUILDS.list();
  const builds = await Promise.all(
    listed.keys.map(async (key) => {
      const raw = await env.BUILDS.get(key.name);
      return JSON.parse(raw ?? "null") as Build;
    }),
  );
  return builds.filter((build) => build !== null);
}

export default async function BuildsIndex(props: ComponentProps) {
  const builds = await listBuilds();

  return (
    <section>
      <h1>Builds</h1>

      {/* A Client component rendered by a Server component: it renders here
          during Server rendering and resumes in the browser. The Server
          component awaits before it; the Client component's markup is part of
          the same blocked flush. */}
      <WatchToggle initialRef="main" />

      <ul>
        {builds.map((build) => (
          <li>
            <a href={`/builds/${build.id}`}>{build.ref}</a>
            <span>{statusLabel(build.status)}</span>
            <span>{formatDuration(build.durationMs)}</span>
          </li>
        ))}
      </ul>

      {props.children}
    </section>
  );
}
