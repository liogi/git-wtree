import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { tmpDir, write } from "./helpers/fixtures.ts";
import { detectPackageManager, hasScript } from "../dist/lib/packageManager.js";
import { resolveSetupCommands } from "../dist/lib/setup.js";

function project(files: Record<string, string>): string {
  const dir = tmpDir("proj-");
  for (const [rel, body] of Object.entries(files)) write(path.join(dir, rel), body);
  return dir;
}

describe("detectPackageManager", () => {
  test("picks the manager from the lockfile", () => {
    assert.equal(detectPackageManager(project({ "bun.lockb": "" })), "bun");
    assert.equal(detectPackageManager(project({ "pnpm-lock.yaml": "" })), "pnpm");
    assert.equal(detectPackageManager(project({ "yarn.lock": "" })), "yarn");
  });

  test("falls back to npm when there is no lockfile it knows", () => {
    assert.equal(detectPackageManager(project({})), "npm");
    assert.equal(detectPackageManager(project({ "package-lock.json": "" })), "npm");
  });

  test("prefers bun, then pnpm, then yarn when several are present", () => {
    const all = project({ "bun.lockb": "", "pnpm-lock.yaml": "", "yarn.lock": "" });
    assert.equal(detectPackageManager(all), "bun");
  });
});

describe("hasScript", () => {
  const dir = project({
    "package.json": JSON.stringify({ scripts: { build: "tsc" } }),
  });

  test("finds a declared script and misses an absent one", () => {
    assert.equal(hasScript(dir, "build"), true);
    assert.equal(hasScript(dir, "prepare"), false);
  });

  test("is false rather than throwing without a package.json", () => {
    assert.equal(hasScript(project({}), "build"), false);
  });

  test("is false rather than throwing on malformed JSON", () => {
    assert.equal(hasScript(project({ "package.json": "{ nope" }), "build"), false);
  });
});

describe("resolveSetupCommands", () => {
  test("explicit commands are used as given", () => {
    assert.deepEqual(resolveSetupCommands(project({}), ["a", "b"]), ["a", "b"]);
  });

  test("an explicit empty list means do nothing", () => {
    assert.deepEqual(resolveSetupCommands(project({ "package.json": "{}" }), []), []);
  });

  test("auto does nothing when the repo is not a Node project", () => {
    assert.deepEqual(resolveSetupCommands(project({}), "auto"), []);
    assert.deepEqual(resolveSetupCommands(project({}), undefined), []);
  });

  test("auto installs with the detected manager", () => {
    const dir = project({ "package.json": "{}", "pnpm-lock.yaml": "" });
    assert.deepEqual(resolveSetupCommands(dir, "auto"), ["pnpm install"]);
  });

  test("auto also runs prepare when that script exists", () => {
    const dir = project({
      "package.json": JSON.stringify({ scripts: { prepare: "husky" } }),
      "yarn.lock": "",
    });
    assert.deepEqual(resolveSetupCommands(dir, "auto"), [
      "yarn install",
      "yarn run prepare",
    ]);
  });
});
