import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  tmpDir,
  tmpRepo,
  tmpRepoWithRemote,
  write,
  runCli,
  git,
  homeWithConfig,
} from "./helpers/fixtures.ts";

function siblingOf(repo: string, branch: string): string {
  return path.join(path.dirname(repo), `${path.basename(repo)}-${branch.replace(/\//g, "-")}`);
}

describe("gwt add", () => {
  test("creates the worktree as a sibling and copies .env files into it", () => {
    const repo = tmpRepo();
    write(path.join(repo, ".env"), "SECRET=1");
    write(path.join(repo, "apps", "api", ".env"), "API=2");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "add files");

    const r = runCli(["add", "my-feature"], { cwd: repo });
    assert.equal(r.code, 0);

    const wt = siblingOf(repo, "my-feature");
    assert.equal(readFileSync(path.join(wt, ".env"), "utf-8"), "SECRET=1");
    assert.equal(readFileSync(path.join(wt, "apps", "api", ".env"), "utf-8"), "API=2");
  });

  test("themes the worktree and keeps that out of git status", () => {
    const repo = tmpRepo();
    runCli(["add", "themed"], { cwd: repo });
    const wt = siblingOf(repo, "themed");

    assert.ok(existsSync(path.join(wt, ".vscode", "settings.json")));
    assert.ok(existsSync(path.join(wt, ".claude", "settings.local.json")));
    assert.equal(git(wt, "status", "--porcelain"), "", "nothing shows as modified");
  });

  test("flattens slashes in the directory name but keeps the branch intact", () => {
    const repo = tmpRepo();
    runCli(["add", "feat/nested"], { cwd: repo });

    assert.ok(existsSync(siblingOf(repo, "feat/nested")));
    assert.equal(
      git(siblingOf(repo, "feat/nested"), "rev-parse", "--abbrev-ref", "HEAD"),
      "feat/nested",
    );
  });

  test("--from bases the new branch on the given ref", () => {
    const repo = tmpRepo();
    git(repo, "checkout", "-q", "-b", "base");
    git(repo, "commit", "-q", "--allow-empty", "-m", "only on base");
    git(repo, "checkout", "-q", "main");

    runCli(["add", "derived", "--from", "base"], { cwd: repo });
    assert.match(git(siblingOf(repo, "derived"), "log", "--oneline"), /only on base/);
  });

  test("warns and changes nothing when the worktree already exists", () => {
    const repo = tmpRepo();
    runCli(["add", "twice"], { cwd: repo });
    const before = git(repo, "worktree", "list");

    const r = runCli(["add", "twice"], { cwd: repo });
    assert.equal(r.code, 0);
    assert.match(r.output, /already exists/i);
    assert.equal(git(repo, "worktree", "list"), before);
  });

  test("fails cleanly outside a git repository", () => {
    const r = runCli(["add", "nope"], { cwd: tmpDir("not-a-repo-") });
    assert.equal(r.code, 1);
    assert.match(r.output, /Not inside a git repository/);
  });
});

describe("gwt add on a branch that already exists", () => {
  test("resets to the remote when the branch is level with it", () => {
    const { repo } = tmpRepoWithRemote();
    git(repo, "checkout", "-q", "-b", "shared");
    git(repo, "commit", "-q", "--allow-empty", "-m", "pushed work");
    git(repo, "push", "-q", "-u", "origin", "shared");
    git(repo, "checkout", "-q", "main");

    const r = runCli(["add", "shared"], { cwd: repo });
    assert.equal(r.code, 0);
    assert.match(r.output, /Resetting to remote/);
  });

  // The reset is what makes an upstream force-push land cleanly, but it used to
  // throw away local commits with no warning at all.
  test("keeps unpushed commits instead of resetting over them", () => {
    const { repo } = tmpRepoWithRemote();
    git(repo, "checkout", "-q", "-b", "ahead");
    git(repo, "commit", "-q", "--allow-empty", "-m", "pushed");
    git(repo, "push", "-q", "-u", "origin", "ahead");
    git(repo, "commit", "-q", "--allow-empty", "-m", "unpushed work");
    git(repo, "checkout", "-q", "main");

    const r = runCli(["add", "ahead"], { cwd: repo });
    assert.equal(r.code, 0);
    assert.match(r.output, /not on origin/);
    assert.match(r.output, /--force/, "tells you how to override");
    assert.equal(
      git(repo, "log", "--oneline", "origin/ahead..ahead").split("\n").length,
      1,
      "the unpushed commit survives",
    );
  });

  test("--force resets anyway and points at the reflog", () => {
    const { repo } = tmpRepoWithRemote();
    git(repo, "checkout", "-q", "-b", "ahead");
    git(repo, "commit", "-q", "--allow-empty", "-m", "pushed");
    git(repo, "push", "-q", "-u", "origin", "ahead");
    git(repo, "commit", "-q", "--allow-empty", "-m", "unpushed work");
    git(repo, "checkout", "-q", "main");

    const r = runCli(["add", "ahead", "--force"], { cwd: repo });
    assert.equal(r.code, 0);
    assert.equal(git(repo, "log", "--oneline", "origin/ahead..ahead"), "");
    assert.match(r.output, /reflog/);
    assert.match(git(repo, "reflog", "ahead"), /unpushed work/, "still recoverable");
  });

  test("a branch behind its remote resets with no prompt", () => {
    const { repo } = tmpRepoWithRemote();
    git(repo, "checkout", "-q", "-b", "behind");
    git(repo, "commit", "-q", "--allow-empty", "-m", "one");
    git(repo, "push", "-q", "-u", "origin", "behind");
    git(repo, "commit", "-q", "--allow-empty", "-m", "two");
    git(repo, "push", "-q", "origin", "behind");
    git(repo, "reset", "-q", "--hard", "HEAD~1");
    git(repo, "checkout", "-q", "main");

    const r = runCli(["add", "behind"], { cwd: repo });
    assert.equal(r.code, 0);
    assert.doesNotMatch(r.output, /not on origin/);
    assert.match(r.output, /Resetting to remote/);
  });
});

// The README's headline promised "open your IDE — all in one command" while
// `add` never called it. Rather than quietly correcting the sentence, the
// capability exists — opt in, since a window appearing on every add is not
// always wanted.
describe("--open", () => {
  test("hands the new worktree to the configured IDE", () => {
    const repo = tmpRepo();
    const recorded = path.join(tmpDir(), "opened");
    const home = homeWithConfig({
      ide: "recorder",
      ideCommand: `printf %s {path} > ${recorded}`,
    });

    const r = runCli(["add", "opened-branch", "--open"], { cwd: repo, home });
    assert.equal(r.code, 0);
    assert.equal(readFileSync(recorded, "utf-8"), siblingOf(repo, "opened-branch"));
  });

  test("without it, nothing is opened", () => {
    const repo = tmpRepo();
    const recorded = path.join(tmpDir(), "not-opened");
    const home = homeWithConfig({
      ide: "recorder",
      ideCommand: `printf %s {path} > ${recorded}`,
    });

    runCli(["add", "quiet-branch"], { cwd: repo, home });
    assert.equal(existsSync(recorded), false);
  });

  test("with no IDE configured it prints the path instead of prompting", () => {
    const repo = tmpRepo();
    const r = runCli(["add", "pathonly", "--open"], { cwd: repo });
    assert.equal(r.code, 0);
    assert.match(r.output, /Worktree path:/);
    assert.doesNotMatch(r.output, /uv_tty_init/);
  });
});

// Two things took "the repository" to mean "wherever you are standing". Running
// from a secondary worktree therefore produced a worktree named after another
// worktree, and copied .env files from a directory that may have none.
describe("running from a secondary worktree", () => {
  test("the new worktree is a sibling of the main one, not of the current one", () => {
    const repo = tmpRepo();
    runCli(["add", "first"], { cwd: repo });
    const first = siblingOf(repo, "first");

    runCli(["add", "second"], { cwd: first });

    assert.ok(existsSync(siblingOf(repo, "second")), "named after the repository");
    assert.equal(
      existsSync(path.join(path.dirname(repo), `${path.basename(repo)}-first-second`)),
      false,
      "not named after the worktree it was run from",
    );
  });

  test(".env files come from the main worktree, not the current one", () => {
    const repo = tmpRepo();
    write(path.join(repo, ".gitignore"), ".env\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "ignore env");
    write(path.join(repo, ".env"), "SECRET=from-main");

    // A worktree made with bare git: it has no .env at all.
    git(repo, "worktree", "add", "-q", siblingOf(repo, "bare"), "-b", "bare");

    const r = runCli(["add", "downstream"], { cwd: siblingOf(repo, "bare") });

    assert.match(r.output, /Copied 1 \.env file/);
    assert.equal(
      readFileSync(path.join(siblingOf(repo, "downstream"), ".env"), "utf-8"),
      "SECRET=from-main",
    );
  });

  test("the main worktree stays the source even when the current one differs", () => {
    const repo = tmpRepo();
    write(path.join(repo, ".gitignore"), ".env\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "ignore env");
    write(path.join(repo, ".env"), "SECRET=from-main");

    runCli(["add", "middle"], { cwd: repo });
    // Diverge the intermediate worktree's copy.
    write(path.join(siblingOf(repo, "middle"), ".env"), "SECRET=from-middle");

    runCli(["add", "downstream2"], { cwd: siblingOf(repo, "middle") });

    assert.equal(
      readFileSync(path.join(siblingOf(repo, "downstream2"), ".env"), "utf-8"),
      "SECRET=from-main",
      "sync-env documents main as the source; add now agrees",
    );
  });
});
