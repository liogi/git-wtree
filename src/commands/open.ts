import { log } from "@clack/prompts";
import { resolveWorktree } from "../lib/resolveWorktree.js";
import { readConfig } from "../lib/config.js";
import { runIdeWizard, openInIde } from "../lib/ide.js";

export async function commandOpen(query?: string): Promise<void> {
  const worktree = await resolveWorktree(query);
  if (!worktree) process.exit(1);

  const config = readConfig();
  if (!config.ide) {
    log.info("No IDE configured yet. Let's set that up:");
    await runIdeWizard();
  }

  openInIde(worktree.path);
  log.success(`Opened ${worktree.path}`);
}
