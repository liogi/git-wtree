import { intro, outro, log } from "@clack/prompts";
import {
  getRepoRoot,
  getWorktreePath,
  worktreeExists,
  addWorktree,
} from "../lib/git.js";
import { copyEnvFiles } from "../lib/env.js";
import { installDeps, detectPackageManager } from "../lib/packageManager.js";
import { readConfig } from "../lib/config.js";

export async function commandAdd(branch: string): Promise<void> {
  intro(`wtree add ${branch}`);

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

  log.step("Creating git worktree…");
  try {
    addWorktree(worktreePath, branch);
  } catch (e) {
    log.error((e as Error).message);
    process.exit(1);
  }

  log.step("Syncing .env files…");
  const config = readConfig();
  copyEnvFiles(root, worktreePath, config.scanDirs);

  const pm = detectPackageManager(root);
  log.step(`Installing dependencies with ${pm}…`);
  try {
    installDeps(worktreePath);
  } catch (e) {
    log.error((e as Error).message);
    process.exit(1);
  }

  outro(`Worktree ready!\n   Path:   ${worktreePath}\n   Branch: ${branch}`);
}
