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

  // The previous version of this test asserted the colours were *different* —
  // exact hex inequality. `feature-a` and `feature-b` passed it while sitting
  // 1° apart on the hue wheel, which is the same colour to a human. Measuring
  // distinctness means measuring distance.
  function hueOf(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    if (delta === 0) return 0;
    const h =
      max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return (Math.round(h * 60) + 360) % 360;
  }

  // CIE76: perceptual distance in Lab. ΔE below ~5 reads as the same colour.
  function deltaE(hexA: string, hexB: string): number {
    const toLab = (hex: string): [number, number, number] => {
      const lin = (c: number) =>
        c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      const [r, g, b] = [1, 3, 5].map((i) =>
        lin(parseInt(hex.slice(i, i + 2), 16) / 255),
      );
      const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
      const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
      const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
      const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
      return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
    };
    const [l1, a1, b1] = toLab(hexA);
    const [l2, a2, b2] = toLab(hexB);
    return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
  }

  function hueGap(a: string, b: string): number {
    const d = Math.abs(hueOf(pickColor(a).bg) - hueOf(pickColor(b).bg));
    return Math.min(d, 360 - d);
  }

  // The property that broke was statistical, so the test is too. A hash without
  // avalanche puts every sibling pair ~1° apart, every time; this catches that
  // regression where a floor on a handful of hand-picked pairs would not.
  //
  // Deliberately not asserting a floor: hues are uniform over the wheel, so some
  // pair always lands close by chance — `release/1.0.0` and `release/1.0.1` sit
  // 27° apart today. That is the birthday problem, not a defect, and tuning a
  // threshold until it passes would only hide it.
  // Hue alone left two of four worktrees perceptually identical one time in
  // five. Lightness and saturation each add a second value, turning one wheel
  // into four. Asserted through CIE76 ΔE rather than hue degrees, because
  // degrees are not perception: 27° apart is invisible in one part of the wheel
  // and obvious in another.
  test("four worktrees rarely collide", () => {
    const words = ["feat", "fix", "chore", "docs", "perf", "test", "spike"];
    const tails = ["login", "auth", "parser", "cache", "api", "ui", "deps"];

    let collisions = 0;
    const runs = 400;
    for (let run = 0; run < runs; run++) {
      const names = new Set<string>();
      while (names.size < 4) {
        names.add(
          `${words[run % words.length]}/${tails[(run * 3 + names.size) % tails.length]}-${run}${names.size}`,
        );
      }
      const colours = [...names].map((n) => pickColor(n).bg);
      let worst = Infinity;
      for (let i = 0; i < colours.length; i++) {
        for (let j = i + 1; j < colours.length; j++) {
          worst = Math.min(worst, deltaE(colours[i], colours[j]));
        }
      }
      if (worst < 5) collisions++;
    }

    const rate = collisions / runs;
    // Measured at ~7% with the four-wheel palette, ~20% with hue alone.
    assert.ok(rate < 0.12, `${(rate * 100).toFixed(0)}% collided, expected under 12%`);
  });

  // Telling worktrees apart from each other is not enough: a themed window has
  // to look themed. Every colour is dark, because white text has to stay
  // readable on it, and VS Code's default chrome is dark too — so the two can
  // drift close. One combination did, and read as an unthemed window.
  test("every colour is visibly different from the default dark chrome", () => {
    const DEFAULT_CHROME = "#181818";
    let worst = Infinity;
    let worstBranch = "";
    for (let i = 0; i < 2000; i++) {
      const branch = `branch/${i}`;
      const d = deltaE(pickColor(branch).bg, DEFAULT_CHROME);
      if (d < worst) {
        worst = d;
        worstBranch = branch;
      }
    }
    // Measured at 27 with three combinations, 22 with the four-way palette.
    assert.ok(worst >= 25, `${worstBranch} is only ΔE ${worst.toFixed(0)} from the default`);
  });

  test("the palette really uses more than one wheel", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const { bg } = pickColor(`branch-${i}`);
      // Lightness and saturation both change the maximum channel value; two
      // distinct maxima mean the extra axes are live rather than dead constants.
      const max = Math.max(
        ...[1, 3, 5].map((k) => parseInt(bg.slice(k, k + 2), 16)),
      );
      seen.add(String(max));
    }
    assert.ok(seen.size >= 3, `only ${seen.size} distinct brightness levels`);
  });

  test("a one-character change moves the colour a lot, on average", () => {
    // Avalanche is a statistical property; assert it as one rather than on a
    // single lucky pair.
    const gaps = Array.from({ length: 200 }, (_, i) =>
      hueGap(`branch-${i}a`, `branch-${i}b`),
    );
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    assert.ok(mean > 70, `mean gap ${mean.toFixed(0)}°, expected well above 70`);
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
