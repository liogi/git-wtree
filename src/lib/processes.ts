import { execFileSync } from "child_process";

// `git worktree remove` deletes files one by one, so anything still writing
// under the worktree races it: the files go, a live process recreates one, and
// the final rmdir fails. git has already deregistered the worktree by then, so
// `gwt rm` answers "No worktree matching" on the retry and the half-emptied
// directory can only be finished off by hand. Refusing up front is the only
// version of this that stays repairable.

// pgrep matches an extended regular expression against the full command line,
// and a path is full of characters that mean something there — a worktree for
// `release/1.0.0` would otherwise match paths it does not own.
function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * PIDs of processes whose command line mentions `worktreePath`.
 *
 * A dev server started inside a worktree carries the path in its argv — every
 * `node <worktree>/node_modules/...` shows up, and so does the Nx daemon. It is
 * a heuristic rather than a file-handle audit, but it is the one that found 51
 * live processes under a worktree that `git worktree remove` had just started
 * deleting.
 */
export function processesIn(worktreePath: string): number[] {
  let out: string;
  try {
    out = execFileSync("pgrep", ["-f", "--", escapeForRegex(worktreePath)], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    // pgrep exits 1 when nothing matches, and 127 when it is not installed.
    // Neither is a reason to block a removal.
    return [];
  }

  const own = new Set([process.pid, process.ppid]);
  return out
    .split("\n")
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && !own.has(pid));
}

/** Command names for `pids`, deduplicated, for a message a human can act on. */
export function describeProcesses(pids: number[]): string[] {
  const names = pids.map((pid) => {
    try {
      const comm = execFileSync("ps", ["-o", "comm=", "-p", String(pid)], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      return comm.split("/").pop() || "?";
    } catch {
      return "?";
    }
  });
  return [...new Set(names)].filter((name) => name !== "?");
}
