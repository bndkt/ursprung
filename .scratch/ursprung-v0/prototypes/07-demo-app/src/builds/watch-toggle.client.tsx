// THROWAWAY PROTOTYPE — see ../../README.md. Nothing here runs.

// The Client component. Three of the destination's claims meet in this one file:
// a signal-driven interaction, an ordinary-looking import across the Server
// boundary, and Resumption without re-executing the tree.

import { computed, signal } from "ursprung/client";
import { type Build, statusLabel } from "../format.shared.ts";
// The RPC transform, written as if it were an ordinary import. In the Route
// bundle this binding is replaced by a capnweb stub; `startBuild`'s body never
// reaches the browser. Nothing at the call site says so — which is the point,
// and also NOTES.md #1.
import { startBuild } from "./trigger.server.ts";

type WatchToggleProps = {
  initialRef: string;
};

export default function WatchToggle(props: WatchToggleProps) {
  // AMBIGUITY (see NOTES.md #2): these run during Server rendering, on the
  // server. They do not run again in the browser — that is what Resumption
  // means. So what does the browser hold when the click handler fires? The
  // signals have to be reconstructed from the Resumability payload with their
  // identities preserved, which is ticket 19's whole problem, and ticket 02's
  // indirection cell is presumably how the identity survives.
  const watching = signal(false);
  const latest = signal<Build | null>(null);
  const label = computed(() => {
    const build = latest.get();
    return build === null ? "no builds yet" : statusLabel(build.status);
  });

  async function onToggle() {
    watching.set(!watching.get());
    if (!watching.get()) return;

    // Looks local, is a network round trip. `await` on an RPC stub; capnweb's
    // HTTP batch is one-shot (ticket 01), so a second call needs a second batch.
    const build = await startBuild(props.initialRef);
    latest.set(build);
  }

  return (
    <div>
      {/* AMBIGUITY (see NOTES.md #3): this handler closes over `watching`,
          `latest` and `props`. For Resumption the browser must reach this
          function without running the component — so it needs a stable
          reference to the function *and* to everything in its closure. */}
      <button type="button" onClick={onToggle}>
        {computed(() => (watching.get() ? "Stop watching" : "Watch main"))}
      </button>
      <span>{label}</span>
    </div>
  );
}
