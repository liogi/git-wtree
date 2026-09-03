import { resolveWorktree } from "../lib/resolveWorktree.js";
import { requestCd } from "../lib/shellCd.js";

// `switch` used to be a hard-coded case in the shell wrapper, calling
// `gitwtree path --out <file>`. It is a plain subcommand now: it resolves a
// worktree and asks the wrapper to cd there, through the same channel any other
// command can use.
export async function commandSwitch(query?: string): Promise<void> {
  const worktree = await resolveWorktree(query);
  if (!worktree) process.exit(1);

  if (!requestCd(worktree.path)) {
    process.stderr.write(
      "`gwt switch` needs the shell integration — a binary cannot change your\n" +
        "shell's directory on its own. Run:\n  gitwtree shell-init --install\n" +
        "Then open a new terminal.\n",
    );
    process.exit(1);
  }
}
