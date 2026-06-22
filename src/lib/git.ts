import { execSync } from "child_process";
import path from "path";
import fs from "fs";

export interface WorktreeEntry {
  path: string;
  branch: string;
  isMain: boolean;
}

export function getRepoRoot(): string {
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
    }).trim();
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
  try {
    execSync(`git show-ref --verify --quiet refs/heads/${branch}`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function worktreeExists(worktreePath: string): boolean {
  return fs.existsSync(worktreePath);
}

export function fetchBranch(branch: string): void {
  const root = getRepoRoot();
  try {
    execSync(`git fetch origin "${branch}"`, { cwd: root, stdio: "inherit" });
  } catch {
    // remote may not exist, continue anyway
  }
}

export function remoteBranchExists(branch: string): boolean {
  try {
    execSync(`git show-ref --verify --quiet refs/remotes/origin/${branch}`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function resetToRemote(worktreePath: string, branch: string): void {
  execSync(`git reset --hard origin/${branch}`, {
    cwd: worktreePath,
    stdio: "inherit",
  });
}

export function deleteLocalBranch(branch: string): void {
  const root = getRepoRoot();
  execSync(`git branch -D "${branch}"`, { cwd: root, stdio: "inherit" });
}

export function addWorktree(
  worktreePath: string,
  branch: string,
  from?: string,
): void {
  const root = getRepoRoot();
  if (branchExists(branch)) {
    execSync(`git worktree add "${worktreePath}" "${branch}"`, {
      cwd: root,
      stdio: "inherit",
    });
  } else {
    const base = from ? `"${from}"` : "";
    execSync(
      `git worktree add "${worktreePath}" -b "${branch}" ${base}`.trim(),
      {
        cwd: root,
        stdio: "inherit",
      },
    );
  }
}

export function removeWorktree(worktreePath: string): void {
  const root = getRepoRoot();
  execSync(`git worktree remove "${worktreePath}" --force`, {
    cwd: root,
    stdio: "inherit",
  });
  execSync("git worktree prune", { cwd: root, stdio: "inherit" });
}

function isTracked(worktreePath: string, relPath: string): boolean {
  try {
    execSync(`git ls-files --error-unmatch "${relPath}"`, {
      cwd: worktreePath,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

// Keeps a worktree-local file out of git status: skip-worktree for tracked files,
// or the worktree's local info/exclude for untracked ones. No effect on the shared .gitignore.
export function hideFromGit(worktreePath: string, relPath: string): void {
  if (isTracked(worktreePath, relPath)) {
    try {
      execSync(`git update-index --skip-worktree "${relPath}"`, {
        cwd: worktreePath,
        stdio: "ignore",
      });
    } catch {
      // best effort
    }
    return;
  }

  try {
    const excludeRel = execSync("git rev-parse --git-path info/exclude", {
      cwd: worktreePath,
      encoding: "utf-8",
    }).trim();
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

// True if the worktree has uncommitted changes, untracked files, or commits not
// pushed to its upstream. Used to guard against accidental data loss on remove.
export function isWorktreeDirty(worktreePath: string): boolean {
  const status = execSync("git status --porcelain", {
    cwd: worktreePath,
    encoding: "utf-8",
  }).trim();
  if (status.length > 0) return true;

  try {
    const upstream = execSync(
      "git rev-parse --abbrev-ref --symbolic-full-name @{u}",
      {
        cwd: worktreePath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      },
    ).trim();
    const ahead = execSync(`git rev-list --count ${upstream}..HEAD`, {
      cwd: worktreePath,
      encoding: "utf-8",
    }).trim();
    return ahead !== "0";
  } catch {
    // No upstream configured — uncommitted/untracked already checked above.
    return false;
  }
}

export function listWorktrees(): WorktreeEntry[] {
  const root = getRepoRoot();
  const output = execSync("git worktree list --porcelain", {
    cwd: root,
    encoding: "utf-8",
  });

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
