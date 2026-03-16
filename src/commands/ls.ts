import pc from "picocolors";
import { listWorktrees } from "../lib/git.js";

export function commandLs(): void {
  let worktrees;
  try {
    worktrees = listWorktrees();
  } catch (e) {
    console.error(pc.red((e as Error).message));
    process.exit(1);
  }

  console.log("");
  for (const wt of worktrees) {
    const tag = wt.isMain ? ` ${pc.green("(main)")}` : "";
    console.log(`  ${pc.bold(pc.cyan(wt.branch))}${tag}`);
    console.log(`  ${pc.dim(wt.path)}`);
    console.log("");
  }
}
