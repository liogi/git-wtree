import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmpDir, tmpRepo, runCli, homeWithConfig, git } from "./helpers/fixtures.ts";
import { shellQuote } from "../dist/lib/ide.js";

// The IDE command is a user template that has to reach a shell, so the quoting
// is the only thing standing between a branch name and code execution. Assert
// the round trip rather than the shape of the escaping: whatever we produce,
// a shell must hand back the exact bytes we started with.
const NASTY = [
  "plain",
  "with space",
  'double"quote',
  "single'quote",
  "both\"and'quote",
  "$HOME",
  "${HOME}",
  "$(id)",
  "`id`",
  "semi;colon",
  "pipe|char",
  "amp&&and",
  "new\nline",
  "tab\tchar",
  "back\\slash",
  "glob*?[a-z]",
  "~tilde",
  "#hash",
  "a'\"';id;'\"'b",
  "/tmp/repo-a\";id;\"b",
];

describe("shellQuote", () => {
  for (const value of NASTY) {
    test(`survives a shell round trip: ${JSON.stringify(value)}`, () => {
      const out = execFileSync("sh", ["-c", `printf %s ${shellQuote(value)}`], {
        encoding: "utf-8",
      });
      assert.equal(out, value);
    });
  }

  test("an injection attempt produces no side effect", () => {
    const canary = path.join(tmpDir(), "canary");
    const payload = `x";touch ${canary};"y`;
    execFileSync("sh", ["-c", `printf %s ${shellQuote(payload)} >/dev/null`]);
    assert.equal(existsSync(canary), false);
  });
});

describe("gwt open", () => {
  test("hands the IDE the worktree path verbatim, metacharacters included", () => {
    const repo = tmpRepo();
    const recorded = path.join(tmpDir(), "recorded");
    const home = homeWithConfig({
      ide: "recorder",
      ideCommand: `printf %s {path} > ${recorded}`,
    });

    // A refname may contain `"` and `;`; the worktree directory is named after it.
    const branch = 'a";id;"b';
    git(repo, "branch", branch);
    runCli(["add", branch], { cwd: repo, home });

    const r = runCli(["open", branch], { cwd: repo, home });
    assert.equal(r.code, 0);

    const expected = path.join(
      path.dirname(repo),
      `${path.basename(repo)}-${branch}`,
    );
    assert.equal(readFileSync(recorded, "utf-8"), expected);
  });

  test("without a configured IDE and without a terminal, it fails clearly", () => {
    const repo = tmpRepo();
    const r = runCli(["open", "main"], { cwd: repo, home: tmpDir("home-") });
    assert.equal(r.code, 1);
    assert.match(r.output, /needs a terminal/i);
    assert.doesNotMatch(r.output, /uv_tty_init/, "not a raw libuv crash");
  });
});
