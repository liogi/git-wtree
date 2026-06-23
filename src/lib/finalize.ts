import { log } from "@clack/prompts";
import { copyEnvFiles } from "./env.js";
import { resolveSetupCommands, runCommands } from "./setup.js";
import { writeVscodeTheme, writeClaudeStatusline } from "./ideTheme.js";
import { hideFromGit } from "./git.js";
import { readConfig } from "./config.js";

// Shared post-creation flow for a freshly added worktree: sync env files, run the
// setup hook, and apply per-worktree theming. Used by both `add` and `pr`.
export function finalizeWorktree(
  root: string,
  worktreePath: string,
  branch: string,
): void {
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
}
