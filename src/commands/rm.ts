import { intro, outro, confirm, log, isCancel, cancel } from "@clack/prompts";
import { getWorktreePath, worktreeExists, removeWorktree } from "../lib/git.js";

export async function commandRm(branch: string): Promise<void> {
  intro(`wtree rm ${branch}`);

  const worktreePath = getWorktreePath(branch);

  if (!worktreeExists(worktreePath)) {
    log.error(
      `No worktree found for branch '${branch}'\nExpected at: ${worktreePath}`,
    );
    process.exit(1);
  }

  const confirmed = await confirm({
    message: `Remove worktree at ${worktreePath}?`,
  });

  if (isCancel(confirmed) || !confirmed) {
    cancel("Cancelled");
    process.exit(0);
  }

  try {
    removeWorktree(worktreePath);
  } catch (e) {
    log.error((e as Error).message);
    process.exit(1);
  }

  outro(`Worktree '${branch}' removed`);
}
