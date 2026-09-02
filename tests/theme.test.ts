import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "jsonc-parser";
import { tmpRepo, write, git } from "./helpers/fixtures.ts";
import { pickColor, applyWorktreeTheme, writeClaudeStatusline } from "../dist/lib/ideTheme.js";

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

const BRANCHES = [
  "main", "develop", "feat/login", "fix/off-by-one", "chore/deps",
  "release/1.2.3", "a", "zz", "codex/very-long-branch-name-here",
  "renovate/typescript-5.x", "hotfix", "spike", "wip", "user/name/thing",
  ...Array.from({ length: 200 }, (_, i) => `generated-branch-${i}`),
];

describe("pickColor", () => {
  test("is deterministic", () => {
    for (const b of ["main", "feat/x", "chore/deps"]) {
      assert.deepEqual(pickColor(b), pickColor(b));
    }
  });

  test("returns a well-formed hex background with white text", () => {
    const { bg, fg } = pickColor("main");
    assert.match(bg, /^#[0-9a-f]{6}$/);
    assert.equal(fg, "#ffffff");
  });

  // The code fixes lightness at 0.30 and claims that keeps white text at
  // WCAG AA across the whole hue wheel. Nothing checked it until now.
  test("white on the generated colour clears WCAG AA for every branch", () => {
    for (const branch of BRANCHES) {
      const { bg } = pickColor(branch);
      const ratio = contrastWithWhite(bg);
      assert.ok(
        ratio >= 4.5,
        `${branch} → ${bg} has contrast ${ratio.toFixed(2)}, below 4.5`,
      );
    }
  });

  // What matters is not "214 branches get 214 colours" — nobody has 214
  // worktrees open, and with 360 hues collisions are expected at that scale.
  // What matters is that the handful of worktrees open at once, whose names are
  // usually variations on each other, are told apart.
  test("families of similar branch names get distinct colours", () => {
    const families: Record<string, string[]> = {
      "feat/thing-N": Array.from({ length: 12 }, (_, i) => `feat/thing-${i + 1}`),
      "fix/bug-N": Array.from({ length: 12 }, (_, i) => `fix/bug-${i + 1}`),
      "pr-N": Array.from({ length: 12 }, (_, i) => `pr-${100 + i}`),
      assorted: [
        "main", "develop", "feat/login", "fix/parser", "chore/deps",
        "release/1.2.3", "hotfix", "spike", "wip", "docs/readme",
        "perf/cache", "test/e2e",
      ],
    };

    for (const [name, branches] of Object.entries(families)) {
      const distinct = new Set(branches.map((b) => pickColor(b).bg));
      assert.equal(
        distinct.size,
        branches.length,
        `${name}: ${distinct.size} colours for ${branches.length} branches`,
      );
    }
  });
});

describe("applyWorktreeTheme", () => {
  test("writes the colours, the title and the modernUI pin", () => {
    const repo = tmpRepo();
    applyWorktreeTheme(repo, "feat/login");

    const settings = parse(
      readFileSync(path.join(repo, ".vscode", "settings.json"), "utf-8"),
    ) as Record<string, unknown>;
    const colors = settings["workbench.colorCustomizations"] as Record<string, string>;

    assert.equal(colors["titleBar.activeBackground"], pickColor("feat/login").bg);
    assert.equal(colors["activityBar.foreground"], "#ffffff");
    assert.match(String(settings["window.title"]), /activeRepositoryBranchName/);
    // microsoft/vscode#326126 — without this the colours are silently dropped.
    assert.equal(settings["workbench.experimental.modernUI"], false);
  });

  test("merges into existing settings without dropping keys or comments", () => {
    const repo = tmpRepo();
    write(
      path.join(repo, ".vscode", "settings.json"),
      `{
  // a comment the user wrote
  "editor.tabSize": 4,
  "workbench.colorCustomizations": { "statusBar.background": "#123456" }
}
`,
    );

    applyWorktreeTheme(repo, "main");

    const raw = readFileSync(path.join(repo, ".vscode", "settings.json"), "utf-8");
    assert.match(raw, /a comment the user wrote/, "comments survive");

    const settings = parse(raw) as Record<string, unknown>;
    assert.equal(settings["editor.tabSize"], 4, "unrelated keys survive");
    const colors = settings["workbench.colorCustomizations"] as Record<string, string>;
    assert.equal(colors["statusBar.background"], "#123456", "their colours survive");
    assert.equal(colors["titleBar.activeBackground"], pickColor("main").bg);
  });

  test("keeps the file out of git status", () => {
    const repo = tmpRepo();
    applyWorktreeTheme(repo, "main");
    assert.equal(git(repo, "status", "--porcelain"), "");
  });
});

describe("writeClaudeStatusline", () => {
  test("adds statusLine without discarding existing settings", () => {
    const repo = tmpRepo();
    write(
      path.join(repo, ".claude", "settings.local.json"),
      JSON.stringify({ permissions: { allow: ["Bash"] } }, null, 2),
    );

    writeClaudeStatusline(repo);

    const settings = parse(
      readFileSync(path.join(repo, ".claude", "settings.local.json"), "utf-8"),
    ) as Record<string, unknown>;
    assert.ok(settings.permissions, "existing settings survive");
    assert.equal((settings.statusLine as { type: string }).type, "command");
  });
});
