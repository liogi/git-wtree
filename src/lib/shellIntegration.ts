import fs from "fs";
import os from "os";
import path from "path";

export type Shell = "zsh" | "bash" | "fish";

export const BEGIN = "# >>> git-wtree >>>";
export const END = "# <<< git-wtree <<<";

export const VERSION = ((): string => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
    ) as { version: string };
    return pkg.version;
  } catch {
    return "0";
  }
})();

export function detectShell(explicit?: string): Shell {
  const raw = (
    explicit ?? path.basename(process.env.SHELL ?? "zsh")
  ).toLowerCase();
  if (raw.includes("fish")) return "fish";
  if (raw.includes("bash")) return "bash";
  return "zsh";
}

export function rcPathFor(shell: Shell): string {
  const home = os.homedir();
  if (shell === "fish")
    return path.join(home, ".config", "fish", "config.fish");
  if (shell === "bash") return path.join(home, ".bashrc");
  return path.join(home, ".zshrc");
}

// Reads the installed integration block's version from an rc file (null if absent
// or unversioned). Lets `doctor` report staleness against the running binary.
export function readInstalledBlock(rcPath: string): {
  present: boolean;
  version: string | null;
} {
  if (!fs.existsSync(rcPath)) return { present: false, version: null };
  const beginLine = fs
    .readFileSync(rcPath, "utf-8")
    .split("\n")
    .find((l) => l.startsWith(BEGIN));
  if (!beginLine) return { present: false, version: null };
  const match = beginLine.match(/v(\d+\.\d+\.\d+)/);
  return { present: true, version: match ? match[1] : null };
}
