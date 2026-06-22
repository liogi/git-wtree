import fs from "fs";
import { select, isCancel } from "@clack/prompts";
import { listWorktrees } from "../lib/git.js";

// Resolves a worktree (by branch substring, then an interactive picker if needed)
// and emits its path. The shell wrapper passes --out so the picker UI can render
// on the terminal while the chosen path is handed back through the file.
export async function commandPath(
  query?: string,
  outFile?: string,
): Promise<void> {
  const worktrees = listWorktrees();
  if (worktrees.length === 0) {
    process.stderr.write("No worktrees found.\n");
    process.exit(1);
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
      process.exit(1);
    }
  }

  let target: string;
  if (candidates.length === 1) {
    target = candidates[0].path;
  } else {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        "Multiple worktrees match. Run in a terminal or pass a unique query.\n",
      );
      process.exit(1);
    }
    const choice = await select({
      message: "Switch to worktree",
      options: candidates.map((w) => ({
        value: w.path,
        label: `${w.branch}${w.isMain ? " (main)" : ""}`,
        hint: w.path,
      })),
    });
    if (isCancel(choice)) process.exit(1);
    target = choice;
  }

  if (outFile) {
    fs.writeFileSync(outFile, target);
  } else {
    process.stdout.write(target);
  }
}
