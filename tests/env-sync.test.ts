import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { tmpDir, write } from "./helpers/fixtures.ts";
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

  test("skips the template variants that are meant to be committed", () => {
    const src = source({
      ".env": "real",
      ".env.local": "real too",
      ".env.example": "no",
      ".env.test": "no",
      ".env.sample": "no",
      ".env.template": "no",
      ".env.tpl": "no",
    });
    const names = planEnvSync(src, tmpDir("dest-")).map((e) => e.relPath).sort();
    assert.deepEqual(names, [".env", ".env.local"]);
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
