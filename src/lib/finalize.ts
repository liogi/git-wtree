import { log } from "@clack/prompts";
import pc from "picocolors";
import { copyEnvFiles } from "./env.js";
import { resolveSetupCommands, runCommands } from "./setup.js";
import { applyWorktreeTheme, writeClaudeStatusline } from "./ideTheme.js";
import { hideFromGit } from "./git.js";
import { readConfig } from "./config.js";
import { resolveConfig, REPO_CONFIG_FILE } from "./repoConfig.js";

// Shared post-creation flow for a freshly added worktree: sync env files, run the
// setup hook, and apply per-worktree theming. Used by both `add` and `pr`.
export function finalizeWorktree(
  root: string,
  worktreePath: string,
  branch: string,
): void {
  // Developer-level settings (which editor, whether to colour) stay global;
  // project-level settings come from the repo's .gitwtree.json.
  const global = readConfig();
  const project = resolveConfig();

  if (project.withheld) {
    log.warn(
      `${REPO_CONFIG_FILE} declares setup/teardown commands but is not trusted — skipping them.\n` +
        `   Review them with ${pc.cyan("gwt trust")}.`,
    );
  }

  log.step("Syncing .env files…");
  copyEnvFiles(root, worktreePath, project.scanDirs);

  const setupCommands = resolveSetupCommands(worktreePath, project.setup);
  if (setupCommands.length > 0) {
    runCommands(worktreePath, setupCommands, "setup");
  }

  if (global.theme !== false) {
    log.step("Applying worktree theme…");
    try {
      applyWorktreeTheme(worktreePath, branch);
    } catch (e) {
      log.warn(`Could not apply theme: ${(e as Error).message}`);
    }
  }

  if (global.statusline !== false) {
    log.step("Configuring Claude statusline…");
    try {
      writeClaudeStatusline(worktreePath);
      hideFromGit(worktreePath, ".claude/settings.local.json");
    } catch (e) {
      log.warn(`Could not configure statusline: ${(e as Error).message}`);
    }
  }
}
