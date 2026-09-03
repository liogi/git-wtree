import { intro, outro, confirm, log, isCancel, cancel } from "@clack/prompts";
import {
  getMainWorktree,
  removeWorktree,
  branchExists,
  deleteLocalBranch,
  isWorktreeDirty,
} from "../lib/git.js";
import { resolveWorktree } from "../lib/resolveWorktree.js";
import { runCommands } from "../lib/setup.js";
import { requestCd } from "../lib/shellCd.js";
import { resolveConfig, REPO_CONFIG_FILE } from "../lib/repoConfig.js";

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

  // clack cannot open a prompt without a TTY — it dies with a raw
  // `uv_tty_init returned EINVAL`. Removal is destructive, so a script that
  // cannot be asked has to say up front that it means it.
  if (!process.stdin.isTTY) {
    if (!options.force) {
      log.error(
        "Removing needs a terminal to confirm. Re-run with --force to remove without asking.",
      );
      process.exit(1);
    }
  } else {
    const confirmed = await confirm({
      message: `Remove worktree at ${worktreePath}?`,
    });

    if (isCancel(confirmed) || !confirmed) {
      cancel("Cancelled");
      process.exit(0);
    }
  }

  const project = resolveConfig();
  if (project.withheld) {
    log.warn(
      `${REPO_CONFIG_FILE} declares teardown commands but is not trusted — skipping them.\n   Review them with \`gwt trust\`.`,
    );
  }
  if (project.teardown.length > 0) {
    const ok = runCommands(worktreePath, project.teardown, "teardown");
    if (!ok && !options.force) {
      log.error("Teardown failed. Aborting removal (use --force to override).");
      process.exit(1);
    }
  }

  // Captured before the chdir below, to know whether the shell is standing in
  // the directory about to disappear.
  const startedInside = process.cwd().startsWith(worktreePath);

  // Every git call from here on would inherit a cwd that is about to stop
  // existing. Removing a worktree from inside itself succeeded and then died on
  // the follow-up `git worktree prune` with `spawnSync git ENOENT` — reporting
  // failure for work already done, and skipping the branch prompt. Step out
  // first; the main worktree is never the one being removed.
  const main = getMainWorktree();
  if (main) process.chdir(main.path);

  try {
    removeWorktree(worktreePath);
  } catch (e) {
    log.error((e as Error).message);
    process.exit(1);
  }

  if (branchExists(actualBranch)) {
    // Deleting the branch is a second, separate act of destruction. With nobody
    // to ask, keep it — the worktree is already gone, which is what was asked.
    const deleteBranch = process.stdin.isTTY
      ? await confirm({
          message: `Also delete local branch '${actualBranch}'?`,
        })
      : false;

    if (!isCancel(deleteBranch) && deleteBranch) {
      try {
        deleteLocalBranch(actualBranch);
        log.success(`Local branch '${actualBranch}' deleted`);
      } catch (e) {
        log.warn(`Could not delete branch: ${(e as Error).message}`);
      }
    }
  }

  if (!process.stdin.isTTY && branchExists(actualBranch)) {
    log.info(`Local branch '${actualBranch}' kept (no terminal to ask).`);
  }

  // The shell is now sitting in a directory that no longer exists; nothing it
  // runs will work until it moves. git leaves you there too — we can do better,
  // because the wrapper is listening.
  if (startedInside && main) {
    if (requestCd(main.path)) {
      log.info(`Returned to ${main.path}`);
    } else {
      log.warn(
        `You are in a directory that no longer exists. Run:\n   cd ${main.path}`,
      );
    }
  }

  outro(`Worktree '${actualBranch}' removed`);
}
