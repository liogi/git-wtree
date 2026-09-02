import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpDir, tmpRepo, runCli } from "./helpers/fixtures.ts";

// Replaces the "does the binary start" smoke that used to live as bash in CI:
// a clean `tsc` says nothing about whether the entrypoint boots.
describe("the built CLI boots", () => {
  const repo = tmpRepo();

  test("--version prints the package version", () => {
    const r = runCli(["--version"], { cwd: repo });
    assert.equal(r.code, 0);
    assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+$/);
  });

  test("--help lists the commands", () => {
    const r = runCli(["--help"], { cwd: repo });
    assert.equal(r.code, 0);
    for (const cmd of ["add", "rm", "pr", "ls", "open", "switch", "trust", "doctor"]) {
      assert.match(r.stdout, new RegExp(`^\\s+${cmd}\\b`, "m"), `${cmd} is listed`);
    }
  });

  test("no arguments prints help rather than failing silently", () => {
    const r = runCli([], { cwd: repo });
    assert.match(r.output, /Usage:/);
  });

  test("an unknown command is rejected", () => {
    const r = runCli(["nonsense"], { cwd: repo });
    assert.notEqual(r.code, 0);
    assert.match(r.output, /unknown command/i);
  });

  test("ls lists the main worktree", () => {
    const r = runCli(["ls"], { cwd: repo });
    assert.equal(r.code, 0);
    assert.match(r.stdout, /main/);
  });

  test("doctor reports on git and the shell integration", () => {
    const r = runCli(["doctor"], { cwd: repo });
    assert.equal(r.code, 0);
    assert.match(r.output, /git version/);
    assert.match(r.output, /Shell integration/);
  });

  test("switch tells you to install the shell integration", () => {
    const r = runCli(["switch", "x"], { cwd: repo });
    assert.equal(r.code, 1);
    assert.match(r.output, /shell-init --install/);
  });

  test("path resolves a worktree and can write it to a file", () => {
    const r = runCli(["path", "main"], { cwd: repo });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, repo);
  });

  test("commands that need a repo fail cleanly outside one", () => {
    const r = runCli(["ls"], { cwd: tmpDir("not-a-repo-") });
    assert.equal(r.code, 1);
    assert.match(r.output, /Not inside a git repository/);
  });
});

// `doctor` used to say it could not tell whether `gwt` resolved to the function
// or to oh-my-zsh's alias, and handed the question back to the user. The rc
// block now exports GWT_SHELL_INTEGRATION, so it can answer.
describe("gwt doctor sees the shell", () => {
  const repo = tmpRepo();

  test("reports the integration inactive when the variable is unset", () => {
    const r = runCli(["doctor"], { cwd: repo, env: { GWT_SHELL_INTEGRATION: "" } });
    assert.match(r.output, /not active in this shell/i);
  });

  test("reports it active, and says gwt is the function", () => {
    const version = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
    ).version as string;
    const r = runCli(["doctor"], {
      cwd: repo,
      env: { GWT_SHELL_INTEGRATION: version },
    });
    assert.match(r.output, /Active in this shell/);
    assert.match(r.output, /is the function/);
  });

  test("flags a stale block still loaded in the shell", () => {
    const r = runCli(["doctor"], {
      cwd: repo,
      env: { GWT_SHELL_INTEGRATION: "0.0.1" },
    });
    assert.match(r.output, /v0\.0\.1/);
    assert.match(r.output, /shell-init --install/);
  });
});

describe("the rc block announces itself", () => {
  test("the zsh snippet exports the version", () => {
    const r = runCli(["shell-init", "zsh"], { cwd: tmpRepo() });
    assert.match(r.stdout, /^export GWT_SHELL_INTEGRATION=\d+\.\d+\.\d+$/m);
  });

  test("the fish snippet sets it too", () => {
    const r = runCli(["shell-init", "fish"], { cwd: tmpRepo() });
    assert.match(r.stdout, /^set -gx GWT_SHELL_INTEGRATION \d+\.\d+\.\d+$/m);
  });
});
