import { intro, outro, confirm, log, isCancel, cancel } from "@clack/prompts";
import {
  getWorktreePath,
  worktreeExists,
  removeWorktree,
  branchExists,
  deleteLocalBranch,
} from "../lib/git.js";

export async function commandRm(branch: string): Promise<void> {
  intro(`gwt rm ${branch}`);

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

  if (branchExists(branch)) {
    const deleteBranch = await confirm({
      message: `Also delete local branch '${branch}'?`,
    });

    if (!isCancel(deleteBranch) && deleteBranch) {
      try {
        deleteLocalBranch(branch);
        log.success(`Local branch '${branch}' deleted`);
      } catch (e) {
        log.warn(`Could not delete branch: ${(e as Error).message}`);
      }
    }
  }

  outro(`Worktree '${branch}' removed`);
}
