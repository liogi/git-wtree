import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { tmpDir, tmpRepo, tmpRepoWithRemote, git } from "./helpers/fixtures.ts";
import {
  sanitizeBranch,
  branchExists,
  remoteBranchExists,
  deleteLocalBranch,
  unpushedCommits,
} from "../dist/lib/git.js";

describe("branch names are arguments, never shell input", () => {
  // Git refnames allow `"`, `$`, backticks, `;` and `|`. `gwt pr` checks out
  // branches named by people we do not control, and `gwt rm` feeds that name to
  // `git branch -D`. A regression from execFileSync to execSync here is RCE.
  test("a payload branch name executes nothing", () => {
    const canary = path.join(tmpDir(), "canary");
    const payload = `a";touch ${canary};"b`;

    branchExists(payload);
    remoteBranchExists(payload);
    try {
      deleteLocalBranch(payload);
    } catch {
      // the branch does not exist — that is the point, git treated it as a name
    }

    assert.equal(existsSync(canary), false);
  });

  test("a branch whose name contains a quote is handled as data", () => {
    const repo = tmpRepo();
    const branch = 'quote"inside';
    git(repo, "branch", branch);

    const cwd = process.cwd();
    process.chdir(repo);
    try {
      assert.equal(branchExists(branch), true);
      deleteLocalBranch(branch);
      assert.equal(branchExists(branch), false);
    } finally {
      process.chdir(cwd);
    }
  });
});

describe("sanitizeBranch", () => {
  test("flattens slashes so the branch can name a sibling directory", () => {
    assert.equal(sanitizeBranch("feat/thing"), "feat-thing");
    assert.equal(sanitizeBranch("a/b/c"), "a-b-c");
    assert.equal(sanitizeBranch("plain"), "plain");
  });
});

describe("unpushedCommits", () => {
  test("is empty when the branch matches its remote", () => {
    const { repo } = tmpRepoWithRemote();
    assert.deepEqual(unpushedCommits(repo, "main"), []);
  });

  test("lists the commits origin does not have, newest first", () => {
    const { repo } = tmpRepoWithRemote();
    git(repo, "commit", "-q", "--allow-empty", "-m", "first extra");
    git(repo, "commit", "-q", "--allow-empty", "-m", "second extra");

    const ahead = unpushedCommits(repo, "main");
    assert.equal(ahead.length, 2);
    assert.match(ahead[0], /second extra$/);
    assert.match(ahead[1], /first extra$/);
  });

  test("is empty when the branch is behind, not ahead", () => {
    const { repo } = tmpRepoWithRemote();
    git(repo, "commit", "-q", "--allow-empty", "-m", "pushed");
    git(repo, "push", "-q", "origin", "main");
    git(repo, "reset", "-q", "--hard", "HEAD~1");
    assert.deepEqual(unpushedCommits(repo, "main"), []);
  });

  test("returns empty rather than throwing when there is no remote ref", () => {
    const repo = tmpRepo();
    assert.deepEqual(unpushedCommits(repo, "main"), []);
  });
});
