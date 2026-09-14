import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { tmpRepoWithRemote, runCli, git } from "./helpers/fixtures.ts";

function siblingOf(repo: string, branch: string): string {
  return path.join(
    path.dirname(repo),
    `${path.basename(repo)}-${branch.replace(/\//g, "-")}`,
  );
}

function upstreamOf(worktree: string): string | null {
  try {
    return git(worktree, "rev-parse", "--abbrev-ref", "@{upstream}").trim();
  } catch {
    return null;
  }
}

describe("gwt add --from", () => {
  // Branching off a remote ref makes git set that ref as the upstream, and a
  // bare `git push` then refuses with a suggestion to push to the base branch
  // itself — `git push origin HEAD:main`. On a support fix that is one tired
  // copy-paste away from landing on the default branch.
  test("leaves the new branch without an upstream", () => {
    const { repo } = tmpRepoWithRemote();

    const result = runCli(["add", "fix/x", "--from", "origin/main"], { cwd: repo });
    assert.equal(result.code, 0, result.output);

    assert.equal(
      upstreamOf(siblingOf(repo, "fix/x")),
      null,
      "a branch created from a base must not inherit the base as its upstream",
    );
  });

  test("still tracks normally when no base is given", () => {
    const { repo } = tmpRepoWithRemote();
    const result = runCli(["add", "plain"], { cwd: repo });
    assert.equal(result.code, 0, result.output);
    // No base, no -b from a remote ref: nothing to inherit either way, but the
    // worktree has to exist and be usable.
    assert.match(git(repo, "worktree", "list"), /plain/);
  });

  // `add` only fetched when the branch already existed, so a new branch created
  // from `--from main` used whatever the local ref happened to be.
  test("fetches the base, so the worktree starts from the remote's tip", () => {
    const { repo, origin } = tmpRepoWithRemote();

    // Someone else pushes while this clone is not looking.
    const other = path.join(path.dirname(repo), "other");
    git(path.dirname(repo), "clone", "-q", origin, other);
    git(other, "config", "user.email", "them@example.com");
    git(other, "config", "user.name", "Them");
    // The bare origin's HEAD still points at whatever init.defaultBranch was
    // when it was created, which is not `main` on every runner — so the clone
    // may land nowhere. Name the branch rather than trusting the checkout.
    git(other, "checkout", "-q", "-B", "main", "origin/main");
    git(other, "commit", "-q", "--allow-empty", "-m", "landed after our last fetch");
    git(other, "push", "-q", "origin", "main");

    const result = runCli(["add", "fix/y", "--from", "origin/main"], { cwd: repo });
    assert.equal(result.code, 0, result.output);

    const log = git(siblingOf(repo, "fix/y"), "log", "--oneline");
    assert.match(
      log,
      /landed after our last fetch/,
      "the base was refreshed before branching",
    );
  });
});
