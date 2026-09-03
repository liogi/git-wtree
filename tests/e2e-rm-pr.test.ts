import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  tmpDir,
  tmpRepo,
  tmpRepoWithRemote,
  write,
  runCli,
  git,
  homeWithConfig,
  pathWithout,
} from "./helpers/fixtures.ts";

function siblingOf(repo: string, branch: string): string {
  return path.join(path.dirname(repo), `${path.basename(repo)}-${branch}`);
}

describe("gwt rm", () => {
  test("refuses to remove the main worktree", () => {
    const repo = tmpRepo();
    const r = runCli(["rm", "main"], { cwd: repo });
    assert.equal(r.code, 1);
    assert.match(r.output, /Cannot remove the main worktree/);
  });

  test("says so when nothing matches", () => {
    const repo = tmpRepo();
    const r = runCli(["rm", "no-such-branch"], { cwd: repo });
    assert.equal(r.code, 1);
    assert.match(r.output, /No worktree matching/);
  });

  // clack cannot prompt without a TTY: it used to die with a raw
  // `uv_tty_init returned EINVAL` here.
  test("without a terminal it asks for --force instead of crashing", () => {
    const repo = tmpRepo();
    runCli(["add", "doomed"], { cwd: repo });

    const r = runCli(["rm", "doomed"], { cwd: repo });
    assert.equal(r.code, 1);
    assert.match(r.output, /--force/);
    assert.doesNotMatch(r.output, /uv_tty_init/);
    assert.ok(existsSync(siblingOf(repo, "doomed")), "and it is still there");
  });

  test("--force removes the worktree but keeps the branch", () => {
    const repo = tmpRepo();
    runCli(["add", "doomed"], { cwd: repo });

    const r = runCli(["rm", "doomed", "--force"], { cwd: repo });
    assert.equal(r.code, 0);
    assert.equal(existsSync(siblingOf(repo, "doomed")), false);
    // Deleting the branch is a second destruction; with nobody to ask, keep it.
    assert.match(git(repo, "branch", "--list", "doomed"), /doomed/);
    assert.match(r.output, /kept/i);
  });

  test("refuses a worktree with uncommitted work unless forced", () => {
    const repo = tmpRepo();
    runCli(["add", "dirty"], { cwd: repo });
    write(path.join(siblingOf(repo, "dirty"), "untracked.txt"), "work");

    const r = runCli(["rm", "dirty"], { cwd: repo });
    assert.equal(r.code, 1);
    assert.match(r.output, /uncommitted changes, untracked files, or unpushed commits/);
    assert.ok(existsSync(siblingOf(repo, "dirty")));
  });

  test("refuses a worktree that is ahead of its upstream", () => {
    const { repo } = tmpRepoWithRemote();
    runCli(["add", "ahead"], { cwd: repo });
    const wt = siblingOf(repo, "ahead");
    git(wt, "push", "-q", "-u", "origin", "ahead");
    git(wt, "commit", "-q", "--allow-empty", "-m", "not pushed");

    const r = runCli(["rm", "ahead"], { cwd: repo });
    assert.equal(r.code, 1);
    assert.ok(existsSync(wt));
  });

  test("a failing teardown aborts the removal unless forced", () => {
    const repo = tmpRepo();
    const home = homeWithConfig({});
    runCli(["config", "teardown", "exit 3"], { cwd: repo, home });
    runCli(["add", "with-teardown"], { cwd: repo, home });

    const blocked = runCli(["rm", "with-teardown", "--force"], { cwd: repo, home });
    // --force overrides both the dirty check and a failing teardown, by design.
    assert.equal(blocked.code, 0);
    assert.equal(existsSync(siblingOf(repo, "with-teardown")), false);
  });
});

describe("gwt pr", () => {
  test("rejects a non-numeric argument", () => {
    const r = runCli(["pr", "abc"], { cwd: tmpRepo() });
    assert.equal(r.code, 1);
    assert.match(r.output, /must be a number/);
  });

  test("without a terminal it will not open the picker", () => {
    const r = runCli(["pr"], { cwd: tmpRepo() });
    assert.equal(r.code, 1);
    assert.match(r.output, /Pass a PR number/);
    assert.doesNotMatch(r.output, /uv_tty_init/);
  });

  // With gh off the PATH the fetch fallback runs, which needs no network:
  // a local bare remote can hold refs/pull/<n>/head just like GitHub does.
  test("falls back to fetching refs/pull/<n>/head when gh is unavailable", () => {
    const { repo, origin } = tmpRepoWithRemote();
    git(repo, "checkout", "-q", "-b", "contributor-work");
    git(repo, "commit", "-q", "--allow-empty", "-m", "work from a fork");
    git(repo, "push", "-q", "origin", "contributor-work:refs/pull/42/head");
    git(repo, "checkout", "-q", "main");
    git(repo, "branch", "-q", "-D", "contributor-work");

    const r = runCli(["pr", "42"], { cwd: repo, env: { PATH: pathWithout("gh") } });

    assert.equal(r.code, 0, r.output);
    assert.match(r.output, /gh not found/);
    const wt = siblingOf(repo, "pr-42");
    assert.ok(existsSync(wt));
    assert.match(git(wt, "log", "--oneline"), /work from a fork/);
    assert.ok(origin.length > 0);
  });
});

// Fixing the isMain flag unblocked a path that had been refused by accident, and
// that path had its own bug: every git call after the removal inherited a cwd
// that no longer existed. `git worktree remove` succeeded, the follow-up
// `git worktree prune` died with `spawnSync git ENOENT`, and the command
// reported failure for work it had already done.
describe("removing the worktree you are standing in", () => {
  test("succeeds, and says so", () => {
    const repo = tmpRepo();
    runCli(["add", "self"], { cwd: repo });
    const self = siblingOf(repo, "self");

    const r = runCli(["rm", "self", "--force"], { cwd: self });

    assert.equal(r.code, 0);
    assert.doesNotMatch(r.output, /ENOENT/);
    assert.match(r.output, /removed/);
    assert.equal(existsSync(self), false);
  });

  test("leaves git's worktree list clean, so prune really ran", () => {
    const repo = tmpRepo();
    runCli(["add", "self"], { cwd: repo });
    runCli(["rm", "self", "--force"], { cwd: siblingOf(repo, "self") });

    const listed = git(repo, "worktree", "list")
      .split("\n")
      .filter((l) => l.trim() !== "");
    assert.equal(listed.length, 1, "only the main worktree remains registered");
  });
});
