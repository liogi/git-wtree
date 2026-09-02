import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { tmpDir, tmpRepo, tmpRepoWithRemote, write, runCli, git } from "./helpers/fixtures.ts";
import { worktreeStatus } from "../dist/lib/git.js";

describe("worktreeStatus", () => {
  test("a fresh repo is clean, with a commit date and no upstream", () => {
    const s = worktreeStatus(tmpRepo());
    assert.equal(s.changes, 0);
    assert.equal(s.hasUpstream, false);
    assert.match(s.lastCommit, /ago$/);
  });

  test("counts untracked, modified and staged entries alike", () => {
    const repo = tmpRepo();
    write(path.join(repo, "tracked.txt"), "one");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "add tracked");

    write(path.join(repo, "untracked.txt"), "new");
    write(path.join(repo, "tracked.txt"), "changed");
    write(path.join(repo, "staged.txt"), "staged");
    git(repo, "add", "staged.txt");

    assert.equal(worktreeStatus(repo).changes, 3);
  });

  // "# branch.ab +1 -0" has four fields; reading the wrong two reported an
  // ahead branch as behind, which is exactly backwards for deciding what is
  // safe to delete.
  test("reports ahead as ahead, not behind", () => {
    const { repo } = tmpRepoWithRemote();
    git(repo, "commit", "-q", "--allow-empty", "-m", "local only");

    const s = worktreeStatus(repo);
    assert.equal(s.ahead, 1);
    assert.equal(s.behind, 0);
    assert.equal(s.hasUpstream, true);
  });

  test("reports behind as behind", () => {
    const { repo } = tmpRepoWithRemote();
    git(repo, "commit", "-q", "--allow-empty", "-m", "pushed");
    git(repo, "push", "-q", "origin", "main");
    git(repo, "reset", "-q", "--hard", "HEAD~1");

    const s = worktreeStatus(repo);
    assert.equal(s.ahead, 0);
    assert.equal(s.behind, 1);
  });

  test("reports both when the branch has diverged", () => {
    const { repo } = tmpRepoWithRemote();
    git(repo, "commit", "-q", "--allow-empty", "-m", "will be pushed");
    git(repo, "push", "-q", "origin", "main");
    git(repo, "reset", "-q", "--hard", "HEAD~1");
    git(repo, "commit", "-q", "--allow-empty", "-m", "diverging");

    const s = worktreeStatus(repo);
    assert.equal(s.ahead, 1);
    assert.equal(s.behind, 1);
  });

  test("survives a directory that is not a worktree", () => {
    const s = worktreeStatus(tmpDir("empty-"));
    assert.equal(s.changes, 0);
    assert.equal(s.lastCommit, "");
  });
});

describe("gwt ls", () => {
  test("shows dirtiness, tracking and age next to each worktree", () => {
    const { repo } = tmpRepoWithRemote();
    runCli(["add", "clean-one"], { cwd: repo });
    runCli(["add", "dirty-one"], { cwd: repo });

    const dirty = path.join(path.dirname(repo), `${path.basename(repo)}-dirty-one`);
    write(path.join(dirty, "wip.txt"), "work in progress");

    const r = runCli(["ls"], { cwd: repo, env: { NO_COLOR: "1" } });
    assert.equal(r.code, 0);

    const lines = r.stdout.split("\n");
    const lineFor = (branch: string) =>
      lines.find((l) => l.trim().startsWith(branch)) ?? "";

    assert.match(lineFor("main"), /\(main\)/);
    assert.match(lineFor("clean-one"), /clean/);
    assert.match(lineFor("dirty-one"), /1 change\b/);
    assert.match(lineFor("main"), /ago/);
  });

  test("marks an unpushed branch as having no upstream", () => {
    const { repo } = tmpRepoWithRemote();
    runCli(["add", "local-only"], { cwd: repo });
    const r = runCli(["ls"], { cwd: repo, env: { NO_COLOR: "1" } });
    assert.match(r.stdout, /local-only\s+clean · no upstream/);
  });

  test("shows the arrow for a branch ahead of its remote", () => {
    const { repo } = tmpRepoWithRemote();
    runCli(["add", "ahead-one"], { cwd: repo });
    const wt = path.join(path.dirname(repo), `${path.basename(repo)}-ahead-one`);
    git(wt, "push", "-q", "-u", "origin", "ahead-one");
    git(wt, "commit", "-q", "--allow-empty", "-m", "unpushed");

    const r = runCli(["ls"], { cwd: repo, env: { NO_COLOR: "1" } });
    assert.match(r.stdout, /ahead-one.*↑1/);
    assert.doesNotMatch(r.stdout, /ahead-one.*↓/);
  });

  test("still lists paths, which is what the output is used for", () => {
    const { repo } = tmpRepoWithRemote();
    const r = runCli(["ls"], { cwd: repo, env: { NO_COLOR: "1" } });
    assert.match(r.stdout, new RegExp(repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});
