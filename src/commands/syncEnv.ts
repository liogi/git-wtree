import { intro, outro, log } from "@clack/prompts";
import {
  listWorktrees,
  getMainWorktree,
  type WorktreeEntry,
} from "../lib/git.js";
import { resolveWorktree } from "../lib/resolveWorktree.js";
import { planEnvSync, applyEnvSync, type EnvSyncEntry } from "../lib/env.js";
import { readConfig } from "../lib/config.js";

interface SyncEnvOptions {
  apply?: boolean;
  all?: boolean;
}

function label(entry: EnvSyncEntry): string {
  return entry.status === "overwrite" ? "overwrite" : "new      ";
}

// Re-syncs .env* files from the main worktree into one or all secondary worktrees.
// Dry-run by default; --apply writes. Target is a query, an interactive picker,
// or --all. The main worktree is always the source, never a target.
export async function commandSyncEnv(
  query: string | undefined,
  options: SyncEnvOptions,
): Promise<void> {
  intro("gwt sync-env");

  if (options.all && query) {
    log.error("Pass either a query or --all, not both.");
    process.exit(1);
  }

  const main = getMainWorktree();
  if (!main) {
    log.error("Could not determine the main worktree.");
    process.exit(1);
  }

  const secondaries = listWorktrees().filter((w) => w.path !== main.path);
  if (secondaries.length === 0) {
    log.info("No other worktrees to sync.");
    outro("Done");
    return;
  }

  let targets: WorktreeEntry[];
  if (options.all) {
    targets = secondaries;
  } else {
    const target = await resolveWorktree(query, secondaries);
    if (!target) {
      outro("Cancelled");
      return;
    }
    targets = [target];
  }

  const { scanDirs } = readConfig();
  log.info(`Source (main): ${main.path}`);

  const plans = targets.map((target) => ({
    target,
    plan: planEnvSync(main.path, target.path, scanDirs),
  }));

  let actionableTotal = 0;
  for (const { target, plan } of plans) {
    const actionable = plan.filter((e) => e.status !== "skipped");
    actionableTotal += actionable.length;
    const lines = actionable.length
      ? actionable.map((e) => `    ${label(e)}  ${e.relPath}`).join("\n")
      : "    (nothing to copy)";
    log.step(`→ ${target.branch}\n${lines}`);
  }

  if (actionableTotal === 0) {
    outro("Nothing to sync.");
    return;
  }

  if (!options.apply) {
    outro(
      `Dry run — ${actionableTotal} file(s) would be copied across ${targets.length} worktree(s). Re-run with --apply to write.`,
    );
    return;
  }

  let copied = 0;
  for (const { target, plan } of plans) {
    copied += applyEnvSync(main.path, target.path, plan);
  }
  outro(`Copied ${copied} file(s) across ${targets.length} worktree(s).`);
}
