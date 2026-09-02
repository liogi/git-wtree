import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  tmpDir,
  tmpRepo,
  write,
  runCli,
  homeWithConfig,
} from "./helpers/fixtures.ts";

// The trust store lives under $HOME, and the CLI reads it at startup, so every
// case gets its own home. That is also why these go through the binary rather
// than importing the module: os.homedir() is captured at module load.
function repoWithConfig(contents: unknown): string {
  const repo = tmpRepo();
  write(
    path.join(repo, ".gitwtree.json"),
    typeof contents === "string" ? contents : JSON.stringify(contents, null, 2),
  );
  return repo;
}

describe("resolution and provenance", () => {
  test("with no file, everything comes from the defaults", () => {
    const r = runCli(["config"], { cwd: tmpRepo() });
    assert.equal(r.code, 0);
    assert.match(r.stdout, /scan-dirs:\s+auto \[default\]/);
    assert.match(r.stdout, /setup:\s+auto \[default\]/);
    assert.match(r.stdout, /teardown:\s+none \[default\]/);
  });

  test("legacy global keys are still read, and tagged as global", () => {
    const home = homeWithConfig({
      setup: ["legacy-install"],
      scanDirs: ["legacy/dir"],
    });
    const r = runCli(["config"], { cwd: tmpRepo(), home });
    assert.match(r.stdout, /scan-dirs:\s+legacy\/dir \[global\]/);
    assert.match(r.stdout, /setup:\s+legacy-install \[global\]/);
  });

  test("the repo file overrides the global one key by key", () => {
    const home = homeWithConfig({
      setup: ["legacy-install"],
      scanDirs: ["legacy/dir"],
    });
    const repo = repoWithConfig({ setup: ["repo-install"] });
    runCli(["trust"], { cwd: repo, home }); // no TTY: stays untrusted
    const r = runCli(["config"], { cwd: repo, home });
    // scanDirs is untouched by the repo file, so the global value survives.
    assert.match(r.stdout, /scan-dirs:\s+legacy\/dir \[global\]/);
  });
});

describe("trust", () => {
  test("a file with only scanDirs needs no approval", () => {
    const repo = repoWithConfig({ scanDirs: ["apps/api"] });
    const home = tmpDir("home-");

    const t = runCli(["trust"], { cwd: repo, home });
    assert.match(t.output, /declares no commands/);

    const c = runCli(["config"], { cwd: repo, home });
    assert.match(c.stdout, /scan-dirs:\s+apps\/api \[\.gitwtree\.json\]/);
  });

  test("writing through `config setup` creates the file and trusts it", () => {
    const repo = tmpRepo();
    const home = tmpDir("home-");

    const w = runCli(["config", "setup", "echo hi"], { cwd: repo, home });
    assert.equal(w.code, 0);
    assert.ok(existsSync(path.join(repo, ".gitwtree.json")));

    const c = runCli(["config"], { cwd: repo, home });
    assert.match(c.stdout, /trusted/);
    assert.match(c.stdout, /setup:\s+echo hi \[\.gitwtree\.json\]/);
  });

  test("editing the file afterwards revokes trust", () => {
    const repo = tmpRepo();
    const home = tmpDir("home-");
    runCli(["config", "setup", "echo hi"], { cwd: repo, home });

    const file = path.join(repo, ".gitwtree.json");
    const edited = JSON.parse(readFileSync(file, "utf-8")) as {
      setup: string[];
    };
    edited.setup = ["echo something-else"];
    writeFileSync(file, JSON.stringify(edited, null, 2));

    const c = runCli(["config"], { cwd: repo, home });
    assert.match(c.stdout, /UNTRUSTED/);
    // …and the withheld key falls back rather than applying.
    assert.match(c.stdout, /setup:\s+auto \[default\]/);
  });

  test("--revoke withdraws approval", () => {
    const repo = tmpRepo();
    const home = tmpDir("home-");
    runCli(["config", "setup", "echo hi"], { cwd: repo, home });

    const r = runCli(["trust", "--revoke"], { cwd: repo, home });
    assert.match(r.output, /Trust revoked/);
    assert.match(runCli(["config"], { cwd: repo, home }).stdout, /UNTRUSTED/);
  });

  test("outside a terminal, trust lists the commands and refuses", () => {
    const repo = repoWithConfig({ setup: ["rm -rf /"] });
    const r = runCli(["trust"], { cwd: repo, home: tmpDir("home-") });
    assert.equal(r.code, 1);
    assert.match(r.output, /rm -rf \//, "shows what it would run");
    assert.match(r.output, /terminal/i);
  });

  test("invalid JSON is reported, not crashed on", () => {
    const repo = repoWithConfig("{ not json");
    const r = runCli(["trust"], { cwd: repo, home: tmpDir("home-") });
    assert.equal(r.code, 1);
    assert.match(r.output, /invalid/i);
  });
});

describe("untrusted commands never run", () => {
  test("gwt add skips setup from an unapproved file", () => {
    const canary = path.join(tmpDir(), "canary");
    const repo = repoWithConfig({ setup: [`touch ${canary}`] });

    const r = runCli(["add", "feature"], { cwd: repo, home: tmpDir("home-") });

    assert.equal(existsSync(canary), false, "the command must not run");
    assert.match(r.output, /not trusted/i, "and the user is told");
    assert.equal(r.code, 0, "the worktree is still created");
  });

  test("scanDirs still applies while the commands are withheld", () => {
    const canary = path.join(tmpDir(), "canary2");
    const repo = repoWithConfig({
      scanDirs: ["apps/api"],
      setup: [`touch ${canary}`],
    });
    const r = runCli(["config"], { cwd: repo, home: tmpDir("home-") });
    assert.match(r.stdout, /scan-dirs:\s+apps\/api \[\.gitwtree\.json\]/);
    assert.match(r.stdout, /setup:\s+auto \[default\]/);
    assert.equal(existsSync(canary), false);
  });
});

describe("the file is read from the main worktree", () => {
  test("a secondary worktree's own .gitwtree.json is ignored", () => {
    const repo = repoWithConfig({ scanDirs: ["from-main"] });
    const home = tmpDir("home-");
    runCli(["add", "feature"], { cwd: repo, home });

    const secondary = path.join(path.dirname(repo), `${path.basename(repo)}-feature`);
    write(
      path.join(secondary, ".gitwtree.json"),
      JSON.stringify({ scanDirs: ["FORK-CONTROLLED"] }),
    );

    const r = runCli(["config"], { cwd: secondary, home });
    assert.match(r.stdout, /from-main/);
    assert.doesNotMatch(r.stdout, /FORK-CONTROLLED/);
  });
});
