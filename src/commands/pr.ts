import { intro, outro, log, select, isCancel } from "@clack/prompts";
import {
  getRepoRoot,
  getWorktreePath,
  worktreeExists,
  ghAvailable,
  listOpenPrs,
  createWorktreeFromPrGh,
  createWorktreeFromPrFetch,
} from "../lib/git.js";
import { finalizeWorktree } from "../lib/finalize.js";

async function resolvePrNumber(
  root: string,
  prNumber?: string,
): Promise<string> {
  if (prNumber) {
    if (!/^\d+$/.test(prNumber)) {
      log.error("PR must be a number, e.g. `gwt pr 1234`");
      process.exit(1);
    }
    return prNumber;
  }

  // No number → pick from the list of open PRs (needs gh).
  if (!ghAvailable()) {
    log.error("Pass a PR number — listing open PRs requires the `gh` CLI.");
    process.exit(1);
  }
  if (!process.stdin.isTTY) {
    log.error("Pass a PR number — no terminal available for the picker.");
    process.exit(1);
  }

  const prs = listOpenPrs(root);
  if (prs.length === 0) {
    log.info("No open pull requests.");
    process.exit(0);
  }

  const choice = await select({
    message: "Select a pull request",
    options: prs.map((p) => ({
      value: String(p.number),
      label: `#${p.number} ${p.title}`,
      hint: `${p.branch} · @${p.author}`,
    })),
  });
  if (isCancel(choice)) process.exit(1);
  return choice;
}

export async function commandPr(prNumber?: string): Promise<void> {
  let root: string;
  try {
    root = getRepoRoot();
  } catch (e) {
    log.error((e as Error).message);
    process.exit(1);
  }

  const resolved = await resolvePrNumber(root, prNumber);

  intro(`gwt pr ${resolved}`);

  const worktreePath = getWorktreePath(`pr-${resolved}`);
  if (worktreeExists(worktreePath)) {
    log.warn(`Worktree already exists at ${worktreePath}`);
    outro("Done");
    return;
  }

  let branch: string;
  try {
    if (ghAvailable()) {
      log.step("Checking out PR via gh…");
      branch = createWorktreeFromPrGh(root, resolved, worktreePath);
    } else {
      log.step("Fetching PR via git (gh not found — review only)…");
      branch = createWorktreeFromPrFetch(root, resolved, worktreePath);
    }
  } catch (e) {
    log.error((e as Error).message);
    process.exit(1);
  }

  finalizeWorktree(root, worktreePath, branch);

  outro(
    `Worktree ready!\n   Path:   ${worktreePath}\n   Branch: ${branch}\n   PR:     #${resolved}`,
  );
}
