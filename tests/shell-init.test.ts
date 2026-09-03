import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpDir, write, runCli, tmpRepo } from "./helpers/fixtures.ts";
import {
  detectShell,
  rcPathFor,
  BEGIN,
  END,
} from "../dist/lib/shellIntegration.js";

const MARKER = "# >>> git-wtree";
const repo = tmpRepo();

function scratchHome(): { home: string; rc: string } {
  const home = tmpDir("home-");
  return { home, rc: path.join(home, "rc") };
}

function countMarkers(rc: string): number {
  return readFileSync(rc, "utf-8")
    .split("\n")
    .filter((l) => l.startsWith(MARKER)).length;
}

function wrapperPath(home: string): string {
  return path.join(home, ".config", "git-wtree", "init.zsh");
}

describe("detectShell", () => {
  test("honours an explicit argument over $SHELL", () => {
    assert.equal(detectShell("fish"), "fish");
    assert.equal(detectShell("/usr/local/bin/bash"), "bash");
    assert.equal(detectShell("zsh"), "zsh");
  });

  test("falls back to zsh for anything unrecognised", () => {
    assert.equal(detectShell("nushell"), "zsh");
    assert.equal(detectShell(""), "zsh");
  });
});

describe("rcPathFor", () => {
  test("targets the conventional rc of each shell", () => {
    assert.match(rcPathFor("zsh"), /\.zshrc$/);
    assert.match(rcPathFor("bash"), /\.bashrc$/);
    assert.match(rcPathFor("fish"), /config\.fish$/);
  });
});

describe("install", () => {
  test("puts a loader in the rc and the wrapper in its own file", () => {
    const { home, rc } = scratchHome();
    write(rc, "export PATH=/pre-existing\n");

    const r = runCli(["shell-init", "zsh", "--install", "--rc", rc], {
      cwd: repo,
      home,
    });
    assert.equal(r.code, 0);

    const block = readFileSync(rc, "utf-8");
    assert.match(block, /export PATH=\/pre-existing/, "existing content survives");
    assert.equal(countMarkers(rc), 1);
    assert.match(block, new RegExp(END));
    // The rc points at the wrapper; it does not contain it.
    assert.match(block, /\$HOME\/\.config\/git-wtree\/init\.zsh/);
    assert.doesNotMatch(block, /^gwt\(\)/m, "no function body in the rc");

    const wrapper = readFileSync(wrapperPath(home), "utf-8");
    assert.match(wrapper, /^unalias gwt/m);
    assert.match(wrapper, /^gwt\(\) \{/m);
    assert.match(wrapper, /^export GWT_SHELL_INTEGRATION=[0-9a-f]{8}$/m);
  });

  // The point of the split: the rc line must not mention the package version,
  // or every release would report the integration as stale and demand a
  // reinstall for a wrapper that did not change.
  test("the rc block carries no version at all", () => {
    const { home, rc } = scratchHome();
    runCli(["shell-init", "zsh", "--install", "--rc", rc], { cwd: repo, home });
    assert.doesNotMatch(readFileSync(rc, "utf-8"), /\d+\.\d+\.\d+/);
  });

  test("nothing in the rc runs the binary at shell startup", () => {
    const { home, rc } = scratchHome();
    runCli(["shell-init", "zsh", "--install", "--rc", rc], { cwd: repo, home });
    const block = readFileSync(rc, "utf-8");
    assert.doesNotMatch(block, /\$\(\s*gitwtree/, "no command substitution");
    assert.doesNotMatch(block, /^eval /m);
  });

  test("works on an rc that does not exist, and one with no trailing newline", () => {
    const { home, rc } = scratchHome();
    runCli(["shell-init", "zsh", "--install", "--rc", rc], { cwd: repo, home });
    assert.equal(countMarkers(rc), 1);

    const second = scratchHome();
    write(second.rc, "export PATH=/x");
    runCli(["shell-init", "zsh", "--install", "--rc", second.rc], {
      cwd: repo,
      home: second.home,
    });
    assert.match(readFileSync(second.rc, "utf-8"), /export PATH=\/x\n/);
    assert.equal(countMarkers(second.rc), 1);
  });

  test("is idempotent — three installs leave exactly one block", () => {
    const { home, rc } = scratchHome();
    write(rc, "setopt AUTO_CD\n");
    for (let i = 0; i < 3; i++) {
      runCli(["shell-init", "zsh", "--install", "--rc", rc], { cwd: repo, home });
    }
    assert.equal(countMarkers(rc), 1);
    assert.match(readFileSync(rc, "utf-8"), /setopt AUTO_CD/);
  });

  test("writes the fish wrapper for fish, not the posix one", () => {
    const { home, rc } = scratchHome();
    runCli(["shell-init", "fish", "--install", "--rc", rc], { cwd: repo, home });

    const wrapper = readFileSync(
      path.join(home, ".config", "git-wtree", "init.fish"),
      "utf-8",
    );
    assert.match(wrapper, /^function gwt/m);
    assert.match(wrapper, /^set -gx GWT_SHELL_INTEGRATION/m);
    assert.doesNotMatch(wrapper, /unalias gwt/);
  });

  // Regression: a BEGIN with no END used to be reported as "no block found", so
  // install appended a SECOND block, and every reinstall stacked one more.
  test("a truncated block does not stack a second one", () => {
    const { home, rc } = scratchHome();
    write(rc, `export PATH=/mine\n\n${BEGIN} v0.1.0 (managed)\ngwt() { echo stale; }\n`);

    const r = runCli(["shell-init", "zsh", "--install", "--rc", rc], {
      cwd: repo,
      home,
    });
    assert.equal(countMarkers(rc), 1);
    assert.match(r.output, /no closing marker/i);
    assert.match(readFileSync(rc, "utf-8"), /export PATH=\/mine/);
  });

  test("replaces an old inline block with the loader", () => {
    const { home, rc } = scratchHome();
    write(
      rc,
      `${BEGIN} v0.7.0 (managed)\nunalias gwt 2>/dev/null\neval 'gwt() { :; }'\n${END}\n`,
    );

    runCli(["shell-init", "zsh", "--install", "--rc", rc], { cwd: repo, home });
    const block = readFileSync(rc, "utf-8");
    assert.equal(countMarkers(rc), 1);
    assert.doesNotMatch(block, /eval '/, "the old inline wrapper is gone");
    assert.match(block, /init\.zsh/);
  });
});

describe("upgrades", () => {
  test("a wrapper written by an older version is refreshed by any command", () => {
    const { home, rc } = scratchHome();
    runCli(["shell-init", "zsh", "--install", "--rc", rc], { cwd: repo, home });

    const file = wrapperPath(home);
    const current = readFileSync(file, "utf-8");
    writeFileSync(file, current.replace(/GWT_SHELL_INTEGRATION=\w+/, "GWT_SHELL_INTEGRATION=old"));

    // Any invocation, not just shell-init.
    runCli(["--version"], { cwd: repo, home });
    assert.equal(readFileSync(file, "utf-8"), current);
  });

  test("a wrapper that was never installed is not created behind your back", () => {
    const home = tmpDir("home-");
    runCli(["--version"], { cwd: repo, home });
    assert.equal(existsSync(wrapperPath(home)), false);
  });
});

describe("uninstall", () => {
  test("restores the rc exactly and removes the wrapper file", () => {
    const { home, rc } = scratchHome();
    const before = "export PATH=/a\nalias l=ls\n";
    write(rc, before);

    runCli(["shell-init", "zsh", "--install", "--rc", rc], { cwd: repo, home });
    assert.ok(existsSync(wrapperPath(home)));

    runCli(["shell-init", "zsh", "--uninstall", "--rc", rc], { cwd: repo, home });
    assert.equal(readFileSync(rc, "utf-8"), before);
    assert.equal(existsSync(wrapperPath(home)), false);
  });

  test("is a no-op on an rc with no block", () => {
    const { home, rc } = scratchHome();
    write(rc, "export PATH=/a\n");
    const r = runCli(["shell-init", "zsh", "--uninstall", "--rc", rc], {
      cwd: repo,
      home,
    });
    assert.equal(r.code, 0);
    assert.match(r.output, /No git-wtree block/);
    assert.equal(readFileSync(rc, "utf-8"), "export PATH=/a\n");
  });
});
