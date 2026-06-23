import fs from "fs";
import path from "path";
import { parse, modify, applyEdits } from "jsonc-parser";

interface PaletteEntry {
  bg: string;
  fg: string;
}

const FORMATTING = { tabSize: 2, insertSpaces: true };

// Fixed saturation/lightness keep every generated color dark enough for white
// text to stay readable, while the hue varies across the full 360° wheel.
const SATURATION = 0.6;
// 0.30 keeps white-on-color ≥ 4.5:1 (WCAG AA) across the whole hue wheel.
const LIGHTNESS = 0.3;

function hashBranch(branch: string): number {
  let h = 0;
  for (let i = 0; i < branch.length; i++) {
    h = (h * 31 + branch.charCodeAt(i)) >>> 0;
  }
  return h;
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Deterministic per-branch color: the hue is derived from a hash of the branch
// name (full 360° range → ~no collisions), with fixed S/L so white text reads.
export function pickColor(branch: string): PaletteEntry {
  const hue = hashBranch(branch) % 360;
  return { bg: hslToHex(hue, SATURATION, LIGHTNESS), fg: "#ffffff" };
}

function readJsonc(filePath: string): {
  content: string;
  data: Record<string, unknown>;
} {
  let content = "";
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, "utf-8");
  }
  if (content.trim() === "") content = "{}";
  const data = (parse(content) as Record<string, unknown> | undefined) ?? {};
  return { content, data };
}

// Writes title bar / activity bar colors and a worktree-aware window title into
// the worktree's .vscode/settings.json, preserving any existing settings & comments.
export function writeVscodeTheme(worktreePath: string, branch: string): void {
  const { bg, fg } = pickColor(branch);
  const settingsPath = path.join(worktreePath, ".vscode", "settings.json");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

  const { content, data } = readJsonc(settingsPath);

  const existingColors =
    (data["workbench.colorCustomizations"] as
      | Record<string, string>
      | undefined) ?? {};
  const mergedColors = {
    ...existingColors,
    "titleBar.activeBackground": bg,
    "titleBar.activeForeground": fg,
    "titleBar.inactiveBackground": bg,
    "titleBar.inactiveForeground": fg,
    "activityBar.background": bg,
    "activityBar.foreground": fg,
  };

  let next = applyEdits(
    content,
    modify(content, ["workbench.colorCustomizations"], mergedColors, {
      formattingOptions: FORMATTING,
    }),
  );
  next = applyEdits(
    next,
    modify(
      next,
      ["window.title"],
      "${activeRepositoryBranchName} — ${rootName}",
      {
        formattingOptions: FORMATTING,
      },
    ),
  );

  fs.writeFileSync(settingsPath, next);
}

// Configures a Claude Code statusline showing the current branch, written to the
// worktree's .claude/settings.local.json (gitignored by convention).
export function writeClaudeStatusline(worktreePath: string): void {
  const settingsPath = path.join(
    worktreePath,
    ".claude",
    "settings.local.json",
  );
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

  const { content } = readJsonc(settingsPath);

  const statusLine = {
    type: "command",
    command: "printf '🌳 %s' \"$(git branch --show-current 2>/dev/null)\"",
  };

  const next = applyEdits(
    content,
    modify(content, ["statusLine"], statusLine, {
      formattingOptions: FORMATTING,
    }),
  );

  fs.writeFileSync(settingsPath, next);
}
