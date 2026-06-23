import fs from "fs";
import { resolveWorktree } from "../lib/resolveWorktree.js";

// Resolves a worktree and emits its path. The shell wrapper passes --out so the
// picker UI can render on the terminal while the chosen path comes back via the file.
export async function commandPath(
  query?: string,
  outFile?: string,
): Promise<void> {
  const worktree = await resolveWorktree(query);
  if (!worktree) process.exit(1);

  if (outFile) {
    fs.writeFileSync(outFile, worktree.path);
  } else {
    process.stdout.write(worktree.path);
  }
}
