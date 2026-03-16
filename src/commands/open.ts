import { intro, outro, log } from "@clack/prompts";
import { getWorktreePath, worktreeExists } from "../lib/git.js";
import { readConfig } from "../lib/config.js";
import { runIdeWizard, openInIde } from "../lib/ide.js";

export async function commandOpen(branch: string): Promise<void> {
  intro(`wtree open ${branch}`);

  let worktreePath: string;
  try {
    worktreePath = getWorktreePath(branch);
  } catch (e) {
    log.error((e as Error).message);
    process.exit(1);
  }

  if (!worktreeExists(worktreePath)) {
    log.error(
      `No worktree found for branch '${branch}'\nRun: wtree add ${branch}`,
    );
    process.exit(1);
  }

  const config = readConfig();
  if (!config.ide) {
    log.info("No IDE configured yet. Let's set that up:");
    await runIdeWizard();
  }

  openInIde(worktreePath);
  outro(`Opened ${worktreePath}`);
}
