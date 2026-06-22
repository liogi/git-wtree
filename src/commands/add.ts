import { intro, outro, log } from "@clack/prompts";
import {
  getRepoRoot,
  getWorktreePath,
  worktreeExists,
  branchExists,
  fetchBranch,
  remoteBranchExists,
  resetToRemote,
  addWorktree,
  hideFromGit,
} from "../lib/git.js";
import { writeVscodeTheme, writeClaudeStatusline } from "../lib/ideTheme.js";
import { copyEnvFiles } from "../lib/env.js";
import { resolveSetupCommands, runCommands } from "../lib/setup.js";
import { readConfig } from "../lib/config.js";

export async function commandAdd(branch: string, from?: string): Promise<void> {
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
    log.step("Resetting to remote…");
    try {
      resetToRemote(worktreePath, branch);
    } catch (e) {
      log.warn(`Could not reset to remote: ${(e as Error).message}`);
    }
  }

  const config = readConfig();

  log.step("Syncing .env files…");
  copyEnvFiles(root, worktreePath, config.scanDirs);

  const setupCommands = resolveSetupCommands(worktreePath, config);
  if (setupCommands.length > 0) {
    runCommands(worktreePath, setupCommands, "setup");
  }

  if (config.theme !== false) {
    log.step("Applying worktree theme…");
    try {
      writeVscodeTheme(worktreePath, branch);
      hideFromGit(worktreePath, ".vscode/settings.json");
    } catch (e) {
      log.warn(`Could not apply theme: ${(e as Error).message}`);
    }
  }

  if (config.statusline !== false) {
    log.step("Configuring Claude statusline…");
    try {
      writeClaudeStatusline(worktreePath);
      hideFromGit(worktreePath, ".claude/settings.local.json");
    } catch (e) {
      log.warn(`Could not configure statusline: ${(e as Error).message}`);
    }
  }

  outro(`Worktree ready!\n   Path:   ${worktreePath}\n   Branch: ${branch}`);
}
