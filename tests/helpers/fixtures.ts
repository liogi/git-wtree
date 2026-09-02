import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after } from "node:test";

const CLI = path.resolve(import.meta.dirname, "..", "..", "dist", "index.js");

const created: string[] = [];

after(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  created.length = 0;
});

/**
 * A throwaway directory, removed when the test file finishes.
 *
 * realpath matters: on macOS os.tmpdir() is a symlink (/var → /private/var) and
 * git always reports the resolved path, so without this every comparison
 * between a fixture path and `git rev-parse --show-toplevel` would fail.
 */
export function tmpDir(prefix = "gwt-"): string {
  const dir = mkdtempSync(path.join(realpathSync(tmpdir()), prefix));
  created.push(dir);
  return dir;
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function write(file: string, contents: string): string {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
  return file;
}

/** A git repo with one empty commit on `main`, and an identity so commits work. */
export function tmpRepo(name = "repo"): string {
  const dir = path.join(tmpDir(), name);
  mkdirSync(dir, { recursive: true });
  // -b main: runners have no init.defaultBranch, so never inherit the name.
  git(dir, "init", "-q", "-b", "main", ".");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  git(dir, "commit", "-q", "--allow-empty", "-m", "init");
  return dir;
}

/** A repo cloned from a local bare origin, so push/fetch/upstream all work offline. */
export function tmpRepoWithRemote(): { repo: string; origin: string } {
  const base = tmpDir();
  const origin = path.join(base, "origin.git");
  const repo = path.join(base, "repo");
  git(base, "init", "-q", "--bare", origin);
  git(base, "clone", "-q", origin, repo);
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
  git(repo, "checkout", "-q", "-b", "main");
  git(repo, "commit", "-q", "--allow-empty", "-m", "base");
  git(repo, "push", "-q", "-u", "origin", "main");
  return { repo, origin };
}

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
  /** stdout and stderr interleaved is not reproducible, so callers match on both. */
  output: string;
}

/**
 * Runs the built CLI as a real child process: no mocks, no stubbed prompts.
 * stdin is /dev/null, which is what a script or CI gets — and the branch every
 * safety guard in this tool has to take correctly on its own.
 */
export function runCli(
  args: string[],
  options: { cwd: string; home?: string; env?: Record<string, string> } = {
    cwd: process.cwd(),
  },
): CliResult {
  const home = options.home ?? tmpDir("gwt-home-");
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: options.cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOME: home,
      // Strip colour so assertions match plain text.
      NO_COLOR: "1",
      ...options.env,
    },
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { code: result.status, stdout, stderr, output: stdout + stderr };
}

/** A home directory holding a git-wtree global config. */
export function homeWithConfig(config: Record<string, unknown>): string {
  const home = tmpDir("gwt-home-");
  write(
    path.join(home, ".config", "git-wtree", "config.json"),
    JSON.stringify(config, null, 2),
  );
  return home;
}
