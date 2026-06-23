import { select, isCancel } from "@clack/prompts";
import { listWorktrees, type WorktreeEntry } from "./git.js";

// Single resolution used by open / switch / rm. Always reads `git worktree list`
// (the same source as `gwt ls`), matches a query as a substring of the branch or
// path, and falls back to an arrow-key picker when ambiguous or omitted.
// Returns null (after writing a reason to stderr) when nothing usable is chosen.
export async function resolveWorktree(
  query?: string,
): Promise<WorktreeEntry | null> {
  const worktrees = listWorktrees();
  if (worktrees.length === 0) {
    process.stderr.write("No worktrees found.\n");
    return null;
  }

  let candidates = worktrees;
  if (query) {
    const q = query.toLowerCase();
    candidates = worktrees.filter(
      (w) =>
        w.branch.toLowerCase().includes(q) || w.path.toLowerCase().includes(q),
    );
    if (candidates.length === 0) {
      process.stderr.write(`No worktree matching '${query}'.\n`);
      return null;
    }
  }

  if (candidates.length === 1) return candidates[0];

  if (!process.stdin.isTTY) {
    process.stderr.write(
      "Multiple worktrees match. Run in a terminal or pass a unique query.\n",
    );
    return null;
  }

  const choice = await select({
    message: "Select a worktree",
    options: candidates.map((w) => ({
      value: w.path,
      label: `${w.branch}${w.isMain ? " (main)" : ""}`,
      hint: w.path,
    })),
  });
  if (isCancel(choice)) return null;
  return candidates.find((w) => w.path === choice) ?? null;
}
