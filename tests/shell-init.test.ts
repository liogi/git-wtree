import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tmpDir, write, runCli, tmpRepo } from "./helpers/fixtures.ts";
import {
  detectShell,
  rcPathFor,
  readInstalledBlock,
  VERSION,
  BEGIN,
  END,
} from "../dist/lib/shellIntegration.js";

const MARKER = "# >>> git-wtree";

function rcWith(contents: string): string {
  return write(path.join(tmpDir(), "rc"), contents);
}

function countMarkers(rc: string): number {
  return readFileSync(rc, "utf-8")
    .split("\n")
    .filter((l) => l.startsWith(MARKER)).length;
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
  const repo = tmpRepo();

  test("adds a block and leaves existing content untouched", () => {
    const rc = rcWith("export PATH=/pre-existing\n");
    const r = runCli(["shell-init", "zsh", "--install", "--rc", rc], {
      cwd: repo,
    });

    assert.equal(r.code, 0);
    const after = readFileSync(rc, "utf-8");
    assert.match(after, /export PATH=\/pre-existing/);
    assert.equal(countMarkers(rc), 1);
    assert.match(after, new RegExp(END));
  });

  test("works on an rc that does not exist yet", () => {
    const rc = path.join(tmpDir(), "brand-new-rc");
    assert.equal(
      runCli(["shell-init", "zsh", "--install", "--rc", rc], { cwd: repo }).code,
      0,
    );
    assert.equal(countMarkers(rc), 1);
  });

  test("works on an rc with no trailing newline", () => {
    const rc = rcWith("export PATH=/x");
    runCli(["shell-init", "zsh", "--install", "--rc", rc], { cwd: repo });
    const after = readFileSync(rc, "utf-8");
    assert.match(after, /export PATH=\/x\n/);
    assert.equal(countMarkers(rc), 1);
  });

  test("is idempotent — three installs leave exactly one block", () => {
    const rc = rcWith("setopt AUTO_CD\n");
    for (let i = 0; i < 3; i++) {
      runCli(["shell-init", "zsh", "--install", "--rc", rc], { cwd: repo });
    }
    assert.equal(countMarkers(rc), 1);
    assert.match(readFileSync(rc, "utf-8"), /setopt AUTO_CD/);
  });

  test("stamps a version the reader can parse back", () => {
    const rc = rcWith("");
    runCli(["shell-init", "zsh", "--install", "--rc", rc], { cwd: repo });
    assert.deepEqual(readInstalledBlock(rc), { present: true, version: VERSION });
  });

  test("writes the fish function for fish, not the posix one", () => {
    const rc = rcWith("");
    runCli(["shell-init", "fish", "--install", "--rc", rc], { cwd: repo });
    const after = readFileSync(rc, "utf-8");
    assert.match(after, /^function gwt/m);
    assert.doesNotMatch(after, /unalias gwt/);
  });

  // Regression: a BEGIN with no END used to be reported as "no block found", so
  // install appended a SECOND block. readInstalledBlock reads the first marker,
  // so doctor then claimed the integration was stale forever and every reinstall
  // stacked one more block.
  test("a truncated block does not stack a second one", () => {
    const rc = rcWith(
      `export PATH=/mine\n\n${BEGIN} v0.1.0 (managed)\ngwt() { echo stale; }\n`,
    );
    const r = runCli(["shell-init", "zsh", "--install", "--rc", rc], {
      cwd: repo,
    });

    assert.equal(countMarkers(rc), 1, "exactly one BEGIN marker must remain");
    assert.equal(readInstalledBlock(rc).version, VERSION);
    assert.match(r.output, /no closing marker/i, "the user is told why");
    assert.match(readFileSync(rc, "utf-8"), /export PATH=\/mine/);
  });
});

describe("uninstall", () => {
  const repo = tmpRepo();

  test("restores the file to exactly what it was", () => {
    const before = "export PATH=/a\nalias l=ls\n";
    const rc = rcWith(before);
    runCli(["shell-init", "zsh", "--install", "--rc", rc], { cwd: repo });
    runCli(["shell-init", "zsh", "--uninstall", "--rc", rc], { cwd: repo });
    assert.equal(readFileSync(rc, "utf-8"), before);
  });

  test("is a no-op on an rc with no block", () => {
    const rc = rcWith("export PATH=/a\n");
    const r = runCli(["shell-init", "zsh", "--uninstall", "--rc", rc], {
      cwd: repo,
    });
    assert.equal(r.code, 0);
    assert.match(r.output, /No git-wtree block/);
    assert.equal(readFileSync(rc, "utf-8"), "export PATH=/a\n");
  });

  test("reports cleanly when the rc does not exist", () => {
    const r = runCli(
      ["shell-init", "zsh", "--uninstall", "--rc", path.join(tmpDir(), "nope")],
      { cwd: repo },
    );
    assert.equal(r.code, 0);
    assert.match(r.output, /Nothing to remove/);
  });
});

describe("readInstalledBlock", () => {
  test("reports absent for a missing file and for a file with no block", () => {
    assert.deepEqual(readInstalledBlock(path.join(tmpDir(), "missing")), {
      present: false,
      version: null,
    });
    assert.deepEqual(readInstalledBlock(rcWith("export PATH=/a\n")), {
      present: false,
      version: null,
    });
  });

  test("reports present with a null version for an unversioned block", () => {
    assert.deepEqual(readInstalledBlock(rcWith(`${BEGIN}\nx\n${END}\n`)), {
      present: true,
      version: null,
    });
  });
});
