import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { tmpDir, tmpRepo, git, write } from "./helpers/fixtures.ts";
import { planEnvSync, applyEnvSync } from "../dist/lib/env.js";

function source(files: Record<string, string>): string {
  const dir = tmpDir("src-");
  for (const [rel, body] of Object.entries(files)) write(path.join(dir, rel), body);
  return dir;
}

function statusOf(plan: { relPath: string; status: string }[], rel: string) {
  return plan.find((e) => e.relPath === rel)?.status;
}

describe("planEnvSync", () => {
  test("classifies new, overwrite and skipped", () => {
    const src = source({ ".env": "A=1", "apps/api/.env": "B=2", "gone/.env": "C=3" });
    const dest = tmpDir("dest-");
    write(path.join(dest, ".env"), "old");
    mkdirSync(path.join(dest, "apps", "api"), { recursive: true });

    const plan = planEnvSync(src, dest);
    assert.equal(statusOf(plan, ".env"), "overwrite");
    assert.equal(statusOf(plan, path.join("apps", "api", ".env")), "new");
    // The destination has no `gone/` directory, so there is nowhere to put it.
    assert.equal(statusOf(plan, path.join("gone", ".env")), "skipped");
  });

  test("never descends into build and dependency directories", () => {
    const src = source({
      ".env": "A=1",
      "node_modules/pkg/.env": "NO=1",
      "dist/.env": "NO=2",
      ".next/.env": "NO=3",
      "coverage/.env": "NO=4",
    });
    const plan = planEnvSync(src, tmpDir("dest-"));
    assert.deepEqual(
      plan.map((e) => e.relPath),
      [".env"],
    );
  });

  // The property is "a committed file is never copied", not "these five names are
  // never copied". Asserting the list is what let `.env.development.tpl` through:
  // it is a template by every reader's judgement and by git's, and the exact-name
  // check had no opinion about it.
  test("skips templates and fixtures whatever environment they name", () => {
    const src = source({
      ".env": "real",
      ".env.local": "real too",
      ".env.development": "real as well",
      ".env.example": "no",
      ".env.test": "no",
      ".env.sample": "no",
      ".env.template": "no",
      ".env.tpl": "no",
      ".env.development.tpl": "no",
      ".env.production.tpl": "no",
      ".env.development.local.tpl": "no",
      ".env.development.example": "no",
    });
    const names = planEnvSync(src, tmpDir("dest-")).map((e) => e.relPath).sort();
    assert.deepEqual(names, [".env", ".env.development", ".env.local"]);
  });

  // The suffix list is a guess about intent; this is the rule. A repository that
  // versions `.env.defaults` — no template suffix anywhere — must still not have
  // it overwritten, or `git status` reports a change the user never made.
  test("a file git tracks in the destination is never copied", () => {
    const src = source({ ".env": "from main", ".env.defaults": "from main" });
    const dest = tmpRepo("dest");
    write(path.join(dest, ".env.defaults"), "from the branch");
    git(dest, "add", ".env.defaults");
    git(dest, "commit", "-q", "-m", "defaults");

    const plan = planEnvSync(src, dest);
    assert.equal(statusOf(plan, ".env.defaults"), "tracked");
    assert.equal(statusOf(plan, ".env"), "new");

    assert.equal(applyEnvSync(src, dest, plan), 1);
    assert.equal(
      readFileSync(path.join(dest, ".env.defaults"), "utf8"),
      "from the branch",
    );
  });

  test("an untracked file of the same name is copied", () => {
    const src = source({ ".env.defaults": "from main" });
    const dest = tmpRepo("dest");
    write(path.join(dest, ".env.defaults"), "local");

    const plan = planEnvSync(src, dest);
    assert.equal(statusOf(plan, ".env.defaults"), "overwrite");
    assert.equal(applyEnvSync(src, dest, plan), 1);
  });

  test("scanDirs restricts the scan, and a missing one is ignored", () => {
    const src = source({
      ".env": "root",
      "apps/api/.env": "api",
      "apps/web/.env": "web",
    });
    const plan = planEnvSync(src, tmpDir("dest-"), ["apps/api", "does/not/exist"]);
    assert.deepEqual(
      plan.map((e) => e.relPath),
      [path.join("apps", "api", ".env")],
    );
  });
});

describe("applyEnvSync", () => {
  test("copies contents and returns how many it wrote", () => {
    const src = source({ ".env": "SECRET=1", "apps/api/.env": "API=2" });
    const dest = tmpDir("dest-");
    mkdirSync(path.join(dest, "apps", "api"), { recursive: true });

    const plan = planEnvSync(src, dest);
    assert.equal(applyEnvSync(src, dest, plan), 2);
    assert.equal(readFileSync(path.join(dest, ".env"), "utf-8"), "SECRET=1");
    assert.equal(
      readFileSync(path.join(dest, "apps", "api", ".env"), "utf-8"),
      "API=2",
    );
  });

  test("never writes a skipped entry, and does not create its directory", () => {
    const src = source({ "gone/.env": "C=3" });
    const dest = tmpDir("dest-");
    const plan = planEnvSync(src, dest);

    assert.equal(applyEnvSync(src, dest, plan), 0);
    assert.equal(existsSync(path.join(dest, "gone")), false);
  });
});
