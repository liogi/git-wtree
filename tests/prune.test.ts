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
  pathWithout,
} from "./helpers/fixtures.ts";
import { isAncestor } from "../dist/lib/git.js";

function wt(repo: string, branch: string): string {
  return path.join(path.dirname(repo), `${path.basename(repo)}-${branch}`);
}

/** A repo with one merged worktree, one unmerged, and one merged but dirty. */
function repoWithMix(): string {
  const repo = tmpRepo();
  for (const branch of ["merged", "unmerged", "merged-dirty"]) {
    runCli(["add", branch], { cwd: repo });
    git(wt(repo, branch), "commit", "-q", "--allow-empty", "-m", `work on ${branch}`);
  }
  git(repo, "merge", "-q", "--no-ff", "-m", "merge merged", "merged");
  git(repo, "merge", "-q", "--no-ff", "-m", "merge merged-dirty", "merged-dirty");
  write(path.join(wt(repo, "merged-dirty"), "wip.txt"), "work in progress");
  return repo;
}

// gh is hidden throughout: these cases are about the ancestor check, and a real
// gh would try to reach a GitHub repo that does not exist for a local fixture.
const noGh = () => ({ PATH: pathWithout("gh") });

describe("isAncestor", () => {
  test("is true once the branch is merged, false before", () => {
    const repo = tmpRepo();
    git(repo, "checkout", "-q", "-b", "side");
    git(repo, "commit", "-q", "--allow-empty", "-m", "side work");
    git(repo, "checkout", "-q", "main");

    assert.equal(isAncestor("side", "main", repo), false);
    git(repo, "merge", "-q", "--no-ff", "-m", "merge side", "side");
    assert.equal(isAncestor("side", "main", repo), true);
  });
});

describe("gwt prune", () => {
  test("is a dry run by default and removes nothing", () => {
    const repo = repoWithMix();
    const r = runCli(["prune"], { cwd: repo, env: noGh() });

    assert.equal(r.code, 0);
    assert.match(r.output, /Dry run/);
    assert.ok(existsSync(wt(repo, "merged")), "still there after a dry run");
  });

  test("classifies merged, unmerged and merged-but-dirty differently", () => {
    const repo = repoWithMix();
    const out = runCli(["prune"], { cwd: repo, env: noGh() }).output;

    assert.match(out, /remove\s+merged\b/);
    assert.match(out, /keep\s+unmerged/);
    assert.match(out, /skip\s+merged-dirty/);
    assert.match(out, /uncommitted or unpushed work/);
  });

  test("--apply removes the merged one and leaves the others", () => {
    const repo = repoWithMix();
    const r = runCli(["prune", "--apply"], { cwd: repo, env: noGh() });

    assert.equal(r.code, 0);
    assert.equal(existsSync(wt(repo, "merged")), false);
    assert.ok(existsSync(wt(repo, "unmerged")), "unmerged work is untouched");
    assert.ok(existsSync(wt(repo, "merged-dirty")), "dirty work is untouched");
  });

  // Removing a worktree frees a directory; deleting a branch discards history.
  // A bulk command should not decide the second for you.
  test("--apply keeps the branches", () => {
    const repo = repoWithMix();
    const r = runCli(["prune", "--apply"], { cwd: repo, env: noGh() });

    assert.match(git(repo, "branch", "--list", "merged"), /merged/);
    assert.match(r.output, /Branches were kept/);
  });

  test("--force includes the dirty one", () => {
    const repo = repoWithMix();
    runCli(["prune", "--apply", "--force"], { cwd: repo, env: noGh() });

    assert.equal(existsSync(wt(repo, "merged-dirty")), false);
    assert.ok(existsSync(wt(repo, "unmerged")), "still not merged, still kept");
  });

  test("--base compares against another ref", () => {
    const repo = tmpRepo();
    git(repo, "checkout", "-q", "-b", "release");
    git(repo, "checkout", "-q", "main");
    runCli(["add", "shipped"], { cwd: repo });
    git(wt(repo, "shipped"), "commit", "-q", "--allow-empty", "-m", "work");
    git(repo, "checkout", "-q", "release");
    git(repo, "merge", "-q", "--no-ff", "-m", "merge shipped", "shipped");
    git(repo, "checkout", "-q", "main");

    // Not merged into main…
    assert.match(runCli(["prune"], { cwd: repo, env: noGh() }).output, /keep\s+shipped/);
    // …but merged into release.
    assert.match(
      runCli(["prune", "--base", "release"], { cwd: repo, env: noGh() }).output,
      /remove shipped/,
    );
  });

  test("says so when gh is missing, because squash merges go undetected", () => {
    const repo = repoWithMix();
    const r = runCli(["prune"], { cwd: repo, env: noGh() });
    assert.match(r.output, /gh not found/);
    assert.match(r.output, /squash/i);
  });

  test("reports plainly when there are no secondary worktrees", () => {
    const r = runCli(["prune"], { cwd: tmpRepo(), env: noGh() });
    assert.equal(r.code, 0);
    assert.match(r.output, /No secondary worktrees/);
  });

  test("does not run teardown from an untrusted .gitwtree.json", () => {
    const canary = path.join(tmpDir(), "teardown-canary");
    const repo = tmpRepo();
    write(
      path.join(repo, ".gitwtree.json"),
      JSON.stringify({ teardown: [`touch ${canary}`] }),
    );
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "add config");

    runCli(["add", "merged"], { cwd: repo });
    git(wt(repo, "merged"), "commit", "-q", "--allow-empty", "-m", "work");
    git(repo, "merge", "-q", "--no-ff", "-m", "merge", "merged");

    const r = runCli(["prune", "--apply"], { cwd: repo, env: noGh() });
    assert.equal(existsSync(canary), false, "an unapproved command must not run");
    assert.match(r.output, /not trusted/i);
    assert.equal(existsSync(wt(repo, "merged")), false, "the prune still happens");
  });
});
