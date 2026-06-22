import { execSync } from "child_process";
import { createInterface } from "readline";
import { listWorktrees, type WorktreeEntry } from "../lib/git.js";

function fzfAvailable(): boolean {
  try {
    execSync("command -v fzf", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// fzf reads candidates on stdin, draws its UI on /dev/tty, prints the choice on
// stdout — so it works even when our own stdout is captured by `$(...)`.
function selectWithFzf(candidates: WorktreeEntry[]): string | null {
  const lines = candidates.map((w) => `${w.branch}\t${w.path}`).join("\n");
  try {
    const out = execSync(
      "fzf --with-nth=1 --delimiter='\\t' --prompt='worktree> '",
      {
        input: lines,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "inherit"],
      },
    ).trim();
    return out ? (out.split("\t")[1] ?? null) : null;
  } catch {
    // non-zero exit means the user cancelled (Esc)
    return null;
  }
}

// Numbered fallback menu. UI and prompt go to stderr; only the path goes to stdout.
async function selectWithMenu(
  candidates: WorktreeEntry[],
): Promise<string | null> {
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "Multiple worktrees match. Run in a terminal or pass a unique query.\n",
    );
    return null;
  }
  process.stderr.write("Select a worktree:\n");
  candidates.forEach((w, i) => {
    const main = w.isMain ? " (main)" : "";
    process.stderr.write(`  ${i + 1}) ${w.branch}${main}  ${w.path}\n`);
  });

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise<string>((resolve) =>
    rl.question("> ", resolve),
  );
  rl.close();

  const index = Number.parseInt(answer.trim(), 10) - 1;
  if (Number.isNaN(index) || index < 0 || index >= candidates.length) {
    process.stderr.write("Invalid selection.\n");
    return null;
  }
  return candidates[index].path;
}

export async function commandPath(query?: string): Promise<void> {
  const worktrees = listWorktrees();
  if (worktrees.length === 0) {
    process.stderr.write("No worktrees found.\n");
    process.exit(1);
  }

  let candidates = worktrees;
  if (query) {
    const q = query.toLowerCase();
    candidates = worktrees.filter(
      (w) =>
        w.branch.toLowerCase().includes(q) || w.path.toLowerCase().includes(q),
    );
    if (candidates.length === 0) {
      process.stderr.write(`No worktree matching '${query}'.\n`);
      process.exit(1);
    }
    if (candidates.length === 1) {
      process.stdout.write(candidates[0].path);
      return;
    }
  }

  const selected = fzfAvailable()
    ? selectWithFzf(candidates)
    : await selectWithMenu(candidates);

  if (!selected) process.exit(1);
  process.stdout.write(selected);
}
