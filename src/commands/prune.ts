import { intro, outro, log } from "@clack/prompts";
import pc from "picocolors";
import {
  listWorktrees,
  getMainWorktree,
  isWorktreeDirty,
  isAncestor,
  branchHasMoved,
  mergedPrFor,
  ghAvailable,
  removeWorktree,
  type WorktreeEntry,
} from "../lib/git.js";
import { resolveConfig, REPO_CONFIG_FILE } from "../lib/repoConfig.js";
import { runCommands } from "../lib/setup.js";

interface Verdict {
  worktree: WorktreeEntry;
  /** Why it can go, or null when it stays. */
  reason: string | null;
  /** Why it stays, when it otherwise could have gone. */
  blocked: string | null;
  /** Why it stays, when it was never a candidate. */
  kept: string;
}

// The problem the tool creates by working well: after a few months you have a
// dozen worktrees and most of them are finished PRs. `prune` finds them.
//
// Conventions are borrowed rather than invented — dry-run with --apply like
// `sync-env`, a dirty guard with --force like `rm` — so nothing new has to be
// learned to use it safely.
function judge(
  worktree: WorktreeEntry,
  base: string,
  root: string,
  useGh: boolean,
  force: boolean,
): Verdict {
  // A branch that was created and never committed to has no commits the base
  // lacks, so the merge test calls it "merged into main" — a claim about
  // something that never happened. Worse, it offers to delete a worktree you set
  // up an hour ago: no commits are at risk, but the .env files and installed
  // dependencies in it are. Prune is for finished work, not unstarted work.
  if (branchHasMoved(worktree.branch, root) === false) {
    return {
      worktree,
      reason: null,
      blocked: null,
      kept: "never committed to — nothing to clean up",
    };
  }

  let reason: string | null = null;

  if (isAncestor(worktree.branch, base, root)) {
    reason = `merged into ${base}`;
  } else if (useGh) {
    const pr = mergedPrFor(root, worktree.branch);
    if (pr !== null) reason = `PR #${pr} merged`;
  }

  if (reason === null)
    return { worktree, reason: null, blocked: null, kept: "not merged" };

  // Merged and still holding uncommitted work is unusual, and exactly the case
  // where deleting silently would hurt.
  if (!force && isWorktreeDirty(worktree.path)) {
    return {
      worktree,
      reason,
      blocked: "has uncommitted or unpushed work",
      kept: "",
    };
  }

  return { worktree, reason, blocked: null, kept: "" };
}

export async function commandPrune(
  options: { apply?: boolean; force?: boolean; base?: string } = {},
): Promise<void> {
  intro("gwt prune");

  const main = getMainWorktree();
  if (!main) {
    log.error("Could not determine the main worktree.");
    process.exit(1);
  }

  const base = options.base ?? main.branch;
  const secondaries = listWorktrees().filter((w) => w.path !== main.path);

  if (secondaries.length === 0) {
    log.info("No secondary worktrees.");
    outro("Nothing to do");
    return;
  }

  const useGh = ghAvailable();
  if (!useGh) {
    log.warn(
      "gh not found — squash-merged branches cannot be detected, so this list may be short.",
    );
  }

  log.info(`Base: ${pc.cyan(base)}`);

  const verdicts = secondaries.map((w) =>
    judge(w, base, main.path, useGh, options.force ?? false),
  );

  for (const v of verdicts) {
    if (v.reason === null) {
      log.step(`${pc.dim("keep")}   ${v.worktree.branch}  ${pc.dim(v.kept)}`);
    } else if (v.blocked) {
      log.step(
        `${pc.yellow("skip")}   ${v.worktree.branch}  ${pc.dim(v.reason)} — ${pc.yellow(v.blocked)}`,
      );
    } else {
      log.step(`${pc.red("remove")} ${v.worktree.branch}  ${pc.dim(v.reason)}`);
    }
  }

  const removable = verdicts.filter((v) => v.reason !== null && !v.blocked);
  const blocked = verdicts.filter((v) => v.blocked);

  if (blocked.length > 0 && !options.force) {
    log.info(`${blocked.length} skipped for safety — use --force to include them.`);
  }

  if (removable.length === 0) {
    outro("Nothing to prune.");
    return;
  }

  if (!options.apply) {
    outro(
      `Dry run — ${removable.length} worktree(s) would be removed. Re-run with --apply.`,
    );
    return;
  }

  const project = resolveConfig();
  if (project.withheld) {
    log.warn(
      `${REPO_CONFIG_FILE} declares teardown commands but is not trusted — skipping them.`,
    );
  }

  // Same trap as `gwt rm`: one of the worktrees about to go may be the one we
  // are standing in.
  process.chdir(main.path);

  let removed = 0;
  for (const { worktree } of removable) {
    if (project.teardown.length > 0) {
      const ok = runCommands(worktree.path, project.teardown, "teardown");
      if (!ok && !options.force) {
        log.warn(`Teardown failed for ${worktree.branch} — left in place.`);
        continue;
      }
    }
    try {
      removeWorktree(worktree.path);
      removed++;
    } catch (e) {
      log.warn(`Could not remove ${worktree.branch}: ${(e as Error).message}`);
    }
  }

  // Branches are deliberately left alone: removing a worktree frees a directory,
  // deleting a branch discards history. `gwt rm` asks before doing the second,
  // and a bulk command is the wrong place to decide it for you.
  log.info("Branches were kept — delete them yourself if you want them gone.");
  outro(`Removed ${removed} worktree(s).`);
}
