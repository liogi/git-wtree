import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpDir, tmpRepo, runCli, git } from "./helpers/fixtures.ts";

function siblingOf(repo: string, branch: string): string {
  return path.join(path.dirname(repo), `${path.basename(repo)}-${branch}`);
}

/** Stands in for the wrapper: hands the command a file to write a cd request to. */
function withWrapper(): { env: Record<string, string>; requested: () => string } {
  const file = path.join(tmpDir("cd-"), "target");
  writeFileSync(file, "");
  return {
    env: { GWT_CD_FILE: file },
    requested: () => readFileSync(file, "utf-8"),
  };
}

describe("gwt switch", () => {
  test("asks the wrapper to move to the resolved worktree", () => {
    const repo = tmpRepo();
    runCli(["add", "target-branch"], { cwd: repo });
    const wrapper = withWrapper();

    const r = runCli(["switch", "target-branch"], { cwd: repo, env: wrapper.env });
    assert.equal(r.code, 0);
    assert.equal(wrapper.requested(), siblingOf(repo, "target-branch"));
  });

  test("fails clearly when the wrapper is not there to listen", () => {
    const repo = tmpRepo();
    const r = runCli(["switch", "main"], { cwd: repo });
    assert.equal(r.code, 1);
    assert.match(r.output, /shell-init --install/);
  });
});

// Removing the worktree you are standing in leaves the shell in a directory that
// no longer exists — nothing it runs works until it moves. Plain `git worktree
// remove` leaves you there too; the wrapper lets us do better.
describe("gwt rm from inside the worktree", () => {
  test("asks the wrapper to return to the main worktree", () => {
    const repo = tmpRepo();
    runCli(["add", "self"], { cwd: repo });
    const wrapper = withWrapper();

    const r = runCli(["rm", "self", "--force"], {
      cwd: siblingOf(repo, "self"),
      env: wrapper.env,
    });

    assert.equal(r.code, 0);
    assert.equal(wrapper.requested(), repo);
    assert.match(r.output, /Returned to/);
  });

  test("without the wrapper, it says which directory to go to", () => {
    const repo = tmpRepo();
    runCli(["add", "self"], { cwd: repo });

    const r = runCli(["rm", "self", "--force"], { cwd: siblingOf(repo, "self") });
    assert.match(r.output, /no longer exists/);
    assert.match(r.output, new RegExp(`cd ${repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  });

  test("removing a worktree you are NOT in asks for nothing", () => {
    const repo = tmpRepo();
    runCli(["add", "elsewhere"], { cwd: repo });
    const wrapper = withWrapper();

    runCli(["rm", "elsewhere", "--force"], { cwd: repo, env: wrapper.env });
    assert.equal(wrapper.requested(), "", "the shell stays where it is");
  });
});

describe("gwt prune from inside a worktree it removes", () => {
  test("asks the wrapper to return to the main worktree", () => {
    const repo = tmpRepo();
    runCli(["add", "doomed"], { cwd: repo });
    const doomed = siblingOf(repo, "doomed");
    git(doomed, "commit", "-q", "--allow-empty", "-m", "work");
    git(repo, "merge", "-q", "--no-ff", "-m", "merge doomed", "doomed");

    const wrapper = withWrapper();
    const r = runCli(["prune", "--apply"], { cwd: doomed, env: wrapper.env });

    assert.equal(r.code, 0);
    assert.equal(wrapper.requested(), repo);
    assert.equal(existsSync(doomed), false);
  });

  test("pruning from the main worktree asks for nothing", () => {
    const repo = tmpRepo();
    runCli(["add", "doomed"], { cwd: repo });
    git(siblingOf(repo, "doomed"), "commit", "-q", "--allow-empty", "-m", "work");
    git(repo, "merge", "-q", "--no-ff", "-m", "merge doomed", "doomed");

    const wrapper = withWrapper();
    runCli(["prune", "--apply"], { cwd: repo, env: wrapper.env });
    assert.equal(wrapper.requested(), "");
  });
});

describe("the wrapper has no per-command special cases left", () => {
  test("it passes GWT_CD_FILE and cds, without naming any command", () => {
    // An isolated HOME: reading the developer's own wrapper would pass for
    // reasons that have nothing to do with this build.
    const home = tmpDir("home-");
    const r = runCli(["shell-init", "zsh"], { cwd: tmpRepo(), home });
    assert.equal(r.code, 0);

    const wrapper = readFileSync(
      path.join(home, ".config", "git-wtree", "init.zsh"),
      "utf-8",
    );
    assert.match(wrapper, /GWT_CD_FILE/);
    assert.doesNotMatch(wrapper, /switch\|sw/, "no hard-coded command list");
    assert.match(wrapper, /command gitwtree "\$@"/, "one passthrough, not a case");
  });
});
