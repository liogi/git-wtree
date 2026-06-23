import { intro, outro, confirm, log, isCancel, cancel } from "@clack/prompts";
import {
  removeWorktree,
  branchExists,
  deleteLocalBranch,
  isWorktreeDirty,
} from "../lib/git.js";
import { resolveWorktree } from "../lib/resolveWorktree.js";
import { readConfig } from "../lib/config.js";
import { runCommands } from "../lib/setup.js";

export async function commandRm(
  query?: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const worktree = await resolveWorktree(query);
  if (!worktree) process.exit(1);

  if (worktree.isMain) {
    log.error("Cannot remove the main worktree.");
    process.exit(1);
  }

  const worktreePath = worktree.path;
  const actualBranch = worktree.branch;
  intro(`gwt rm ${actualBranch}`);

  if (!options.force && isWorktreeDirty(worktreePath)) {
    log.error(
      `Worktree has uncommitted changes, untracked files, or unpushed commits.\nReview them, or re-run with --force to remove anyway.`,
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

  const config = readConfig();
  if (config.teardown && config.teardown.length > 0) {
    const ok = runCommands(worktreePath, config.teardown, "teardown");
    if (!ok && !options.force) {
      log.error("Teardown failed. Aborting removal (use --force to override).");
      process.exit(1);
    }
  }

  try {
    removeWorktree(worktreePath);
  } catch (e) {
    log.error((e as Error).message);
    process.exit(1);
  }

  if (branchExists(actualBranch)) {
    const deleteBranch = await confirm({
      message: `Also delete local branch '${actualBranch}'?`,
    });

    if (!isCancel(deleteBranch) && deleteBranch) {
      try {
        deleteLocalBranch(actualBranch);
        log.success(`Local branch '${actualBranch}' deleted`);
      } catch (e) {
        log.warn(`Could not delete branch: ${(e as Error).message}`);
      }
    }
  }

  outro(`Worktree '${actualBranch}' removed`);
}
