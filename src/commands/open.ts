import { log } from "@clack/prompts";
import { resolveWorktree } from "../lib/resolveWorktree.js";
import { readConfig } from "../lib/config.js";
import { runIdeWizard, openInIde } from "../lib/ide.js";
import { applyWorktreeTheme } from "../lib/ideTheme.js";

export async function commandOpen(query?: string): Promise<void> {
  const worktree = await resolveWorktree(query);
  if (!worktree) process.exit(1);

  const config = readConfig();
  if (!config.ide) {
    log.info("No IDE configured yet. Let's set that up:");
    await runIdeWizard();
  }

  // The main worktree changes branches, so a pinned per-branch color would lie.
  if (config.theme !== false && !worktree.isMain) {
    try {
      applyWorktreeTheme(worktree.path, worktree.branch);
    } catch (e) {
      log.warn(`Could not apply theme: ${(e as Error).message}`);
    }
  }

  openInIde(worktree.path);
}
