import pc from "picocolors";
import { listWorktrees, worktreeStatus, type WorktreeEntry } from "../lib/git.js";

// `ls` is the dashboard of a tool whose job is running several worktrees at
// once, so it answers the questions you actually have when you look: which ones
// hold work I have not committed, which are ahead of their remote, and which
// have gone stale. Branch and path alone left all three unanswered.
function describe(entry: WorktreeEntry): string {
  const status = worktreeStatus(entry.path);
  const parts: string[] = [];

  parts.push(
    status.changes > 0
      ? pc.yellow(`${status.changes} change${status.changes > 1 ? "s" : ""}`)
      : pc.dim("clean"),
  );

  if (status.ahead > 0 || status.behind > 0) {
    const tracking = [
      status.ahead > 0 ? `↑${status.ahead}` : "",
      status.behind > 0 ? `↓${status.behind}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    parts.push(pc.cyan(tracking));
  } else if (!status.hasUpstream) {
    // Worth surfacing: an unpushed branch is the one `gwt rm` will refuse.
    parts.push(pc.dim("no upstream"));
  }

  if (status.lastCommit) parts.push(pc.dim(status.lastCommit));

  return parts.join(pc.dim(" · "));
}

export function commandLs(): void {
  let worktrees: WorktreeEntry[];
  try {
    worktrees = listWorktrees();
  } catch (e) {
    console.error(pc.red((e as Error).message));
    process.exit(1);
  }

  console.log("");
  for (const wt of worktrees) {
    const tag = wt.isMain ? ` ${pc.green("(main)")}` : "";
    console.log(`  ${pc.bold(pc.cyan(wt.branch))}${tag}  ${describe(wt)}`);
    console.log(`  ${pc.dim(wt.path)}`);
    console.log("");
  }
}
