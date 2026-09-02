import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";

export interface WorktreeEntry {
  path: string;
  branch: string;
  isMain: boolean;
}

// Every git and gh invocation below goes through execFileSync with an argument
// ARRAY, so no shell ever parses these strings and a branch name is data rather
// than code. That matters more here than in most tools: git refnames legitimately
// allow `"`, `$`, backticks, `;` and `|` (only spaces, `~^:?*[\` and controls are
// rejected), and `gwt pr` exists precisely to check out branches named by people
// we do not control. Interpolating a name into a single argument — `refs/heads/${b}`
// — stays safe for the same reason: it is one argv entry, not a command line.

/** Runs a command and returns its trimmed stdout. Throws on a non-zero exit. */
function run(file: string, args: string[], cwd?: string): string {
  return execFileSync(file, args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Runs a command with its output on the terminal, so the user sees git working. */
function runVisible(file: string, args: string[], cwd?: string): void {
  execFileSync(file, args, { cwd, stdio: "inherit" });
}

/** True when the command exits 0. Never throws, never prints. */
function succeeds(file: string, args: string[], cwd?: string): boolean {
  try {
    execFileSync(file, args, { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function getRepoRoot(): string {
  try {
    // stderr is piped rather than inherited so git's own "fatal: not a git
    // repository" stays quiet; we surface a clean message instead.
    return run("git", ["rev-parse", "--show-toplevel"]);
  } catch {
    throw new Error("Not inside a git repository");
  }
}

export function getRepoName(root: string): string {
  return path.basename(root);
}

export function sanitizeBranch(branch: string): string {
  return branch.replace(/\//g, "-");
}

export function getWorktreePath(branch: string): string {
  const root = getRepoRoot();
  const repoName = getRepoName(root);
  const sanitized = sanitizeBranch(branch);
  return path.resolve(root, "..", `${repoName}-${sanitized}`);
}

export function branchExists(branch: string): boolean {
  return succeeds("git", [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${branch}`,
  ]);
}

export function worktreeExists(worktreePath: string): boolean {
  return fs.existsSync(worktreePath);
}

export function fetchBranch(branch: string): void {
  const root = getRepoRoot();
  try {
    runVisible("git", ["fetch", "origin", branch], root);
  } catch {
    // remote may not exist, continue anyway
  }
}

export function remoteBranchExists(branch: string): boolean {
  return succeeds("git", [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/remotes/origin/${branch}`,
  ]);
}

export function resetToRemote(worktreePath: string, branch: string): void {
  runVisible("git", ["reset", "--hard", `origin/${branch}`], worktreePath);
}

// Commits on the local branch that origin does not have, newest first, as
// "<short sha> <subject>". Empty when the branch is level with or behind its
// remote — which is the ordinary case `gwt add` resets through silently.
export function unpushedCommits(worktreePath: string, branch: string): string[] {
  try {
    const out = run(
      "git",
      ["log", "--format=%h %s", `origin/${branch}..${branch}`],
      worktreePath,
    );
    return out.length > 0 ? out.split("\n") : [];
  } catch {
    // No remote-tracking ref, unrelated histories, … — nothing we can report on.
    return [];
  }
}

export function deleteLocalBranch(branch: string): void {
  runVisible("git", ["branch", "-D", branch], getRepoRoot());
}

export function addWorktree(
  worktreePath: string,
  branch: string,
  from?: string,
): void {
  const root = getRepoRoot();
  const args = branchExists(branch)
    ? ["worktree", "add", worktreePath, branch]
    : ["worktree", "add", worktreePath, "-b", branch, ...(from ? [from] : [])];
  runVisible("git", args, root);
}

export function removeWorktree(worktreePath: string): void {
  const root = getRepoRoot();
  runVisible("git", ["worktree", "remove", worktreePath, "--force"], root);
  runVisible("git", ["worktree", "prune"], root);
}

function isTracked(worktreePath: string, relPath: string): boolean {
  return succeeds(
    "git",
    ["ls-files", "--error-unmatch", relPath],
    worktreePath,
  );
}

// Keeps a worktree-local file out of git status: skip-worktree for tracked files,
// or the worktree's local info/exclude for untracked ones. No effect on the shared .gitignore.
export function hideFromGit(worktreePath: string, relPath: string): void {
  if (isTracked(worktreePath, relPath)) {
    // best effort
    succeeds("git", ["update-index", "--skip-worktree", relPath], worktreePath);
    return;
  }

  try {
    const excludeRel = run(
      "git",
      ["rev-parse", "--git-path", "info/exclude"],
      worktreePath,
    );
    const excludePath = path.isAbsolute(excludeRel)
      ? excludeRel
      : path.join(worktreePath, excludeRel);

    let current = "";
    if (fs.existsSync(excludePath))
      current = fs.readFileSync(excludePath, "utf-8");
    if (current.split("\n").some((l) => l.trim() === relPath)) return;

    const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
    fs.appendFileSync(excludePath, `${prefix}${relPath}\n`);
  } catch {
    // best effort
  }
}

export function ghAvailable(): boolean {
  return succeeds("gh", ["--version"]);
}

export interface OpenPr {
  number: number;
  title: string;
  branch: string;
  author: string;
}

// Lists open PRs via gh (requires gh). Used to power the `gwt pr` picker.
export function listOpenPrs(root: string): OpenPr[] {
  const out = run(
    "gh",
    ["pr", "list", "--json", "number,title,headRefName,author", "--limit", "50"],
    root,
  );
  const raw = JSON.parse(out) as Array<{
    number: number;
    title: string;
    headRefName: string;
    author: { login?: string } | null;
  }>;
  return raw.map((p) => ({
    number: p.number,
    title: p.title,
    branch: p.headRefName,
    author: p.author?.login ?? "?",
  }));
}

// Creates a worktree from a PR using gh: a detached worktree, then `gh pr checkout`
// inside it so gh handles the real branch, fork remotes, and push tracking.
// Returns the checked-out branch name.
export function createWorktreeFromPrGh(
  root: string,
  prNumber: string,
  worktreePath: string,
): string {
  runVisible("git", ["worktree", "add", "--detach", worktreePath], root);
  try {
    runVisible("gh", ["pr", "checkout", prNumber], worktreePath);
  } catch (e) {
    // leave it for manual cleanup if removal also fails
    succeeds("git", ["worktree", "remove", worktreePath, "--force"], root);
    throw new Error(`gh pr checkout failed: ${(e as Error).message}`);
  }
  return run("git", ["rev-parse", "--abbrev-ref", "HEAD"], worktreePath);
}

// Fallback without gh: fetch the PR head into a local pr-<n> branch (review only).
export function createWorktreeFromPrFetch(
  root: string,
  prNumber: string,
  worktreePath: string,
): string {
  const branch = `pr-${prNumber}`;
  runVisible("git", ["fetch", "origin", `pull/${prNumber}/head:${branch}`], root);
  runVisible("git", ["worktree", "add", worktreePath, branch], root);
  return branch;
}

// True if the worktree has uncommitted changes, untracked files, or commits not
// pushed to its upstream. Used to guard against accidental data loss on remove.
export function isWorktreeDirty(worktreePath: string): boolean {
  const status = run("git", ["status", "--porcelain"], worktreePath);
  if (status.length > 0) return true;

  try {
    const upstream = run(
      "git",
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      worktreePath,
    );
    const ahead = run(
      "git",
      ["rev-list", "--count", `${upstream}..HEAD`],
      worktreePath,
    );
    return ahead !== "0";
  } catch {
    // No upstream configured — uncommitted/untracked already checked above.
    return false;
  }
}

export function listWorktrees(): WorktreeEntry[] {
  const root = getRepoRoot();
  const output = run("git", ["worktree", "list", "--porcelain"], root);

  const entries: WorktreeEntry[] = [];
  const blocks = output.trim().split("\n\n");

  for (const block of blocks) {
    const lines = block.split("\n");
    const worktreeLine = lines.find((l) => l.startsWith("worktree "));
    const branchLine = lines.find((l) => l.startsWith("branch "));

    if (!worktreeLine) continue;

    const wtPath = worktreeLine.replace("worktree ", "");
    const branch = branchLine
      ? branchLine.replace("branch refs/heads/", "")
      : "(detached)";

    entries.push({
      path: wtPath,
      branch,
      isMain: wtPath === root,
    });
  }

  return entries;
}

// The main working tree. `git worktree list` always lists it first, so this is
// reliable from any worktree (unlike the `isMain` flag, which is relative to cwd).
export function getMainWorktree(): WorktreeEntry | null {
  return listWorktrees()[0] ?? null;
}
