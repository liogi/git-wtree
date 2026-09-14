import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpRepo, tmpRepoWithRemote, runCli, git } from "./helpers/fixtures.ts";
import path from "node:path";
import { processesIn, describeProcesses } from "../dist/lib/processes.js";

const spawned: ChildProcess[] = [];
after(() => {
  for (const child of spawned) child.kill("SIGKILL");
});

/** A process whose argv carries `dir` — the shape a dev server started there has. */
function sleeperIn(dir: string): ChildProcess {
  const child = spawn(
    process.execPath,
    ["-e", `setTimeout(() => {}, 60000); // ${path.join(dir, "node_modules", "marker")}`],
    { stdio: "ignore", detached: false },
  );
  spawned.push(child);
  return child;
}

describe("processesIn", () => {
  test("finds a process whose command line carries the worktree path", async () => {
    const dir = tmpRepo("live");
    assert.deepEqual(processesIn(dir), [], "clean before anything runs");

    const child = sleeperIn(dir);
    await new Promise((r) => setTimeout(r, 300));

    const found = processesIn(dir);
    assert.ok(found.includes(child.pid!), `expected ${child.pid} in ${found}`);
    assert.ok(!found.includes(process.pid), "never reports the running gwt itself");
    assert.ok(describeProcesses(found).length > 0, "names the processes for the message");
  });

  test("an unrelated directory is unaffected", async () => {
    const mine = tmpRepo("mine");
    const other = tmpRepo("other");
    sleeperIn(mine);
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(processesIn(other), []);
  });
});

describe("gwt rm with a live worktree", () => {
  // The failure this guards: `git worktree remove` deletes files under a running
  // process, the final rmdir fails, and git has already deregistered the
  // worktree — so the retry says "No worktree matching" and the half-emptied
  // directory can only be finished by hand.
  // Refused, not prompted — the same shape as the dirty-tree guard, and for a
  // stronger reason: the detection is a heuristic, so a false positive must cost
  // a confused user rather than a killed process.
  test("refuses, and --force does not override it", async () => {
    const { repo } = tmpRepoWithRemote();
    runCli(["add", "doomed"], { cwd: repo });
    const worktree = path.join(path.dirname(repo), `${path.basename(repo)}-doomed`);

    sleeperIn(worktree);
    await new Promise((r) => setTimeout(r, 300));

    const result = runCli(["rm", "doomed", "--force"], { cwd: repo });
    assert.equal(result.code, 1, "exits non-zero rather than half-removing");
    assert.match(result.output, /still running/);
    assert.match(result.output, /pkill -f/, "says how to clear it");
    assert.doesNotMatch(
      result.output,
      /Stop them and remove|Stopped \d+ process/,
      "never offers to kill them",
    );

    const listed = git(repo, "worktree", "list");
    assert.match(listed, /doomed/, "the worktree is still registered");
  });

  test("removes normally once nothing is running there", () => {
    const { repo } = tmpRepoWithRemote();
    runCli(["add", "quiet"], { cwd: repo });

    const result = runCli(["rm", "quiet", "--force"], { cwd: repo });
    assert.equal(result.code, 0, result.output);
    assert.doesNotMatch(git(repo, "worktree", "list"), /quiet/);
  });
});
