import fs from "fs";
import path from "path";
import { parse, modify, applyEdits } from "jsonc-parser";

interface PaletteEntry {
  bg: string;
  fg: string;
}

// Curated palette: distinct, readable title bars. Foreground picked for contrast.
const PALETTE: PaletteEntry[] = [
  { bg: "#1e6f3e", fg: "#ffffff" }, // green
  { bg: "#0b6b8f", fg: "#ffffff" }, // teal-blue
  { bg: "#7b2d8e", fg: "#ffffff" }, // purple
  { bg: "#b23a48", fg: "#ffffff" }, // red
  { bg: "#c2620f", fg: "#ffffff" }, // orange
  { bg: "#8a6d00", fg: "#ffffff" }, // gold
  { bg: "#2d4f9e", fg: "#ffffff" }, // indigo
  { bg: "#0f7a6c", fg: "#ffffff" }, // emerald
  { bg: "#9e2d6f", fg: "#ffffff" }, // magenta
  { bg: "#4a5a1f", fg: "#ffffff" }, // olive
  { bg: "#3a3f8f", fg: "#ffffff" }, // royal
  { bg: "#a23e0f", fg: "#ffffff" }, // rust
  { bg: "#155e75", fg: "#ffffff" }, // cyan-dark
  { bg: "#6d28a0", fg: "#ffffff" }, // violet
];

const FORMATTING = { tabSize: 2, insertSpaces: true };

function hashBranch(branch: string): number {
  let h = 0;
  for (let i = 0; i < branch.length; i++) {
    h = (h * 31 + branch.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function pickColor(branch: string): PaletteEntry {
  return PALETTE[hashBranch(branch) % PALETTE.length];
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
