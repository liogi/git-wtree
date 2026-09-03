import { intro, outro, log, select, isCancel } from "@clack/prompts";
import pc from "picocolors";
import {
  getRepoRoot,
  getWorktreePath,
  worktreeExists,
  branchExists,
  fetchBranch,
  remoteBranchExists,
  resetToRemote,
  addWorktree,
  unpushedCommits,
} from "../lib/git.js";
import { finalizeWorktree } from "../lib/finalize.js";
import { openInIde } from "../lib/ide.js";

// `gwt add` resets an existing branch to its remote so a force-push upstream is
// picked up cleanly. That same reset silently discards local commits the branch
// has and the remote does not — which is work, not noise. `gwt rm` already
// refuses to touch a worktree that is ahead of its upstream; this brings `add`
// in line rather than leaving the two commands contradicting each other.
//
// Returns true when the reset should go ahead.
async function confirmDiscardingCommits(
  branch: string,
  unpushed: string[],
  force: boolean,
): Promise<boolean> {
  const listing = unpushed.map((c) => `     ${c}`).join("\n");
  const summary = `${unpushed.length} commit${unpushed.length > 1 ? "s" : ""} on '${branch}' ${unpushed.length > 1 ? "are" : "is"} not on origin:\n${listing}`;

  if (force) {
    log.warn(`${summary}\n\n   --force given: resetting anyway.`);
    return true;
  }

  if (!process.stdin.isTTY) {
    log.warn(
      `${summary}\n\n   Skipping the reset to avoid losing them. Re-run with --force to reset anyway.`,
    );
    return false;
  }

  log.warn(summary);
  const choice = await select({
    message: `Reset '${branch}' to origin/${branch}?`,
    options: [
      {
        value: "keep",
        label: "Keep them — skip the reset",
        hint: "the worktree stays on your local commits",
      },
      {
        value: "discard",
        label: `Discard them and reset to origin/${branch}`,
        hint: "recoverable with git reflog",
      },
    ],
  });

  if (isCancel(choice) || choice === "keep") {
    log.info("Keeping local commits — the worktree was not reset.");
    return false;
  }
  return true;
}

export async function commandAdd(
  branch: string,
  from?: string,
  options: { force?: boolean; open?: boolean } = {},
): Promise<void> {
  intro(`gwt add ${branch}`);

  let root: string;
  try {
    root = getRepoRoot();
  } catch (e) {
    log.error((e as Error).message);
    process.exit(1);
  }

  const worktreePath = getWorktreePath(branch);

  if (worktreeExists(worktreePath)) {
    log.warn(`Worktree already exists at ${worktreePath}`);
    outro("Done");
    return;
  }

  const branchAlreadyExists = branchExists(branch);

  if (branchAlreadyExists) {
    log.step("Fetching latest changes from remote…");
    fetchBranch(branch);
  }

  if (from) {
    log.info(`Creating from base branch: ${from}`);
  }

  log.step("Creating git worktree…");
  try {
    addWorktree(worktreePath, branch, from);
  } catch (e) {
    log.error((e as Error).message);
    process.exit(1);
  }

  if (branchAlreadyExists && remoteBranchExists(branch)) {
    const unpushed = unpushedCommits(worktreePath, branch);
    const proceed =
      unpushed.length === 0 ||
      (await confirmDiscardingCommits(branch, unpushed, options.force ?? false));

    if (proceed) {
      log.step("Resetting to remote…");
      try {
        resetToRemote(worktreePath, branch);
        if (unpushed.length > 0) {
          log.info(
            `Discarded commits are still reachable: ${pc.cyan(`git reflog ${branch}`)}`,
          );
        }
      } catch (e) {
        log.warn(`Could not reset to remote: ${(e as Error).message}`);
      }
    }
  }

  finalizeWorktree(worktreePath, branch);

  // Opt-in rather than automatic: creating a worktree and having a window appear
  // is not always what you want, and `gwt open` already exists for later.
  // openInIde prints the path when no IDE is configured, so this stays usable
  // without a terminal.
  if (options.open) openInIde(worktreePath);

  outro(`Worktree ready!\n   Path:   ${worktreePath}\n   Branch: ${branch}`);
}
