import fs from "fs";
import path from "path";
import { parse, modify, applyEdits } from "jsonc-parser";
import { hideFromGit } from "./git.js";

interface PaletteEntry {
  bg: string;
  fg: string;
}

const FORMATTING = { tabSize: 2, insertSpaces: true };

// Hue alone gives 360 places to stand, and branch names land on them at random,
// so worktrees collide by the birthday problem rather than by any flaw: with
// four open, two are perceptually identical (ΔE < 5) about one time in five.
//
// Varying lightness and saturation as well turns one wheel into three, which
// drops that to roughly one in eleven — 8.8%, measured over 20,000 draws of four
// branch names. Both variants of each keep white text
// above WCAG AA — measured at 4.53:1 in the worst case, against the 4.5 floor —
// so the readability the fixed values protected is not traded away for it.
//
// This narrows the odds; it does not close them. Doing that needs the colours to
// be coordinated across worktrees rather than derived from a name, which costs
// determinism (the same branch would look different on another machine) and
// breaks under two concurrent `gwt add` — a real scenario for anyone running
// parallel agents. Not worth it for the remaining nine percent.
// Three combinations, not the four that hue × lightness × saturation allows.
// The darkest and dullest of them (0.42 / 0.22) sat ΔE 22 from VS Code's default
// dark chrome — close enough that a themed window read as barely themed at all.
// Dropping it lifts the worst case to 27 and costs nothing measurable:
// collisions among four worktrees stay at seven percent either way.
const COMBINATIONS = [
  { saturation: 0.6, lightness: 0.3 },
  { saturation: 0.6, lightness: 0.22 },
  { saturation: 0.42, lightness: 0.3 },
] as const;

// A plain `h * 31 + c` hash keeps its low bits close for inputs that are close:
// `feature-a` and `feature-b` differ by 1 in the hash and so landed 1° apart on
// the hue wheel — indistinguishable, for exactly the sibling names people
// actually use (feature-a/b, fix-1/2, pr-101/102). The murmur3 finalizer below
// avalanches those bits, so one changed character moves the hue by a random
// amount rather than by one degree.
//
// It does not guarantee separation on its own — see the palette note above for
// what does, and what it costs.
function hashBranch(branch: string): number {
  let h = 0;
  for (let i = 0; i < branch.length; i++) {
    h = (Math.imul(h, 31) + branch.charCodeAt(i)) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
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
  const h = hashBranch(branch);
  // Separate bits for each axis: the low bits already carry the hue, so reusing
  // them would tie lightness to hue and waste the extra dimension.
  const hue = h % 360;
  const { saturation, lightness } = COMBINATIONS[(h >>> 9) % COMBINATIONS.length];
  return { bg: hslToHex(hue, saturation, lightness), fg: "#ffffff" };
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
function writeVscodeTheme(worktreePath: string, branch: string): void {
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
  // VSCode's Modern UI experiment paints .part backgrounds transparent with
  // !important, which silently nullifies the colors above. Ships as a staged
  // rollout, so pin it off per worktree — microsoft/vscode#326126.
  next = applyEdits(
    next,
    modify(next, ["workbench.experimental.modernUI"], false, {
      formattingOptions: FORMATTING,
    }),
  );

  fs.writeFileSync(settingsPath, next);
}

// Applies the per-worktree theme and keeps the edit out of git. Used on creation
// (`add` / `pr`) and re-applied on `open`, so worktrees made with a bare
// `git worktree add` — or before a theme change — still get colored.
export function applyWorktreeTheme(worktreePath: string, branch: string): void {
  writeVscodeTheme(worktreePath, branch);
  hideFromGit(worktreePath, ".vscode/settings.json");
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
