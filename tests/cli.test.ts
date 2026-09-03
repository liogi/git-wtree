import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tmpDir, tmpRepo, runCli } from "./helpers/fixtures.ts";
import { wrapperRev } from "../dist/lib/shellIntegration.js";

// doctor resolves the rc and the wrapper from $SHELL, so every case here pins
// it. Without that the fixture installs the zsh wrapper while doctor looks for
// the bash one on any machine whose default shell is not zsh — which is every
// CI runner, and was not this laptop.
const ZSH = { SHELL: "/bin/zsh" };

/** A home with the integration installed, so doctor has something to report on. */
function installedHome(): string {
  const home = tmpDir("home-");
  // No --rc: doctor reads the shell's real rc path, which under this HOME is
  // <home>/.zshrc. Overriding it here would make doctor look elsewhere.
  runCli(["shell-init", "zsh", "--install"], { cwd: tmpRepo(), home, env: ZSH });
  return home;
}

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

  test("doctor reports on git, the loader, the wrapper and this shell", () => {
    const r = runCli(["doctor"], { cwd: repo });
    assert.equal(r.code, 0);
    assert.match(r.output, /git version/);
    assert.match(r.output, /loader/i);
    assert.match(r.output, /[Ww]rapper/);
    assert.match(r.output, /this shell/i);
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

// `doctor` used to hand back the question that mattered — is `gwt` the function
// or oh-my-zsh's alias? The wrapper exports its revision, so it can answer.
describe("gwt doctor sees the shell", () => {
  const repo = tmpRepo();

  test("reports the integration inactive when the variable is unset", () => {
    const r = runCli(["doctor"], {
      cwd: repo,
      env: { ...ZSH, GWT_SHELL_INTEGRATION: "" },
    });
    assert.match(r.output, /Not active in this shell/i);
  });

  test("reports it active, and says gwt is the function", () => {
    const r = runCli(["doctor"], {
      cwd: repo,
      env: { ...ZSH, GWT_SHELL_INTEGRATION: wrapperRev("zsh") },
      home: installedHome(),
    });
    assert.match(r.output, /Active in this shell/);
    assert.match(r.output, /is the function/);
  });

  // The distinction that matters after an upgrade: the wrapper on disk is
  // already current, only this shell is behind. Nothing to reinstall.
  test("tells a stale shell to open a new terminal, not to reinstall", () => {
    const r = runCli(["doctor"], {
      cwd: repo,
      env: { ...ZSH, GWT_SHELL_INTEGRATION: "0ldrev00" },
      home: installedHome(),
    });
    assert.match(r.output, /older wrapper/);
    assert.match(r.output, /Open a new terminal/);
    assert.doesNotMatch(r.output, /shell-init --install/);
  });

  test("asks for an install only when the loader really is missing", () => {
    const r = runCli(["doctor"], { cwd: repo, home: tmpDir("home-"), env: ZSH });
    assert.match(r.output, /No git-wtree loader/);
    assert.match(r.output, /shell-init --install/);
  });
});

describe("the wrapper announces its revision", () => {
  test("the zsh wrapper exports a content hash, not a package version", () => {
    const home = installedHome();
    const wrapper = readFileSync(
      path.join(home, ".config", "git-wtree", "init.zsh"),
      "utf-8",
    );
    assert.match(wrapper, /^export GWT_SHELL_INTEGRATION=[0-9a-f]{8}$/m);
    assert.doesNotMatch(wrapper, /GWT_SHELL_INTEGRATION=\d+\.\d+\.\d+/);
  });
});
