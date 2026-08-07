// THROWAWAY PROTOTYPE — see ../README.md. Nothing here runs.

// A Shared module: reached from both a Server component (the build list) and a
// Client component (the watch toggle), so it is emitted into the Server bundle
// and into the Route bundle both. This is the entire reason `.shared.` exists.

export type BuildStatus = "queued" | "running" | "passed" | "failed";

export type Build = {
  id: string;
  ref: string;
  status: BuildStatus;
  startedAt: number;
  durationMs: number | null;
};

export function statusLabel(status: BuildStatus): string {
  if (status === "queued") return "Queued";
  if (status === "running") return "Running";
  if (status === "passed") return "Passed";
  return "Failed";
}

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "—";
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
