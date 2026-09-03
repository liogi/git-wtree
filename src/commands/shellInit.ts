import fs from "fs";
import os from "os";
import path from "path";
import {
  BEGIN,
  END,
  detectShell,
  rcPathFor,
  loaderFor,
  writeInitFile,
  initPathFor,
  type Shell,
} from "../lib/shellIntegration.js";

// The rc gets a loader, not the wrapper itself — the same shape nvm, bun and
// SDKMAN use. The wrapper lives in ~/.config/git-wtree/init.<shell>, which the
// binary owns and refreshes, so this block is written once and never changes
// again. It still runs nothing at shell startup: it reads a static file at a
// fixed path, which is what ADR 0001 actually required.
function buildBlock(shell: Shell): string {
  const header = `${BEGIN} (managed by \`gitwtree shell-init --install\` — do not edit)`;
  return `${header}\n${loaderFor(shell)}\n${END}`;
}

// Removes an existing git-wtree block (plus a single blank line above it, to
// avoid leaving gaps). Returns whether one was found, and whether the block was
// truncated.
//
// A BEGIN with no END means a half-written or hand-edited block. Returning
// "nothing found" there was a bug: install would then APPEND a second block,
// leaving a stale marker that made `doctor` report the wrong state forever and
// every reinstall add one more block. We drop the orphan marker line, which is
// ours, and leave everything after it alone, which is not.
function stripBlock(content: string): {
  content: string;
  found: boolean;
  truncated: boolean;
} {
  const lines = content.split("\n");
  const begin = lines.findIndex((l) => l.startsWith(BEGIN));
  if (begin === -1) return { content, found: false, truncated: false };

  let end = -1;
  for (let i = begin; i < lines.length; i++) {
    if (lines[i].startsWith(END)) {
      end = i;
      break;
    }
  }

  let start = begin;
  if (start > 0 && lines[start - 1].trim() === "") start -= 1;

  if (end === -1) {
    lines.splice(start, begin - start + 1);
    return { content: lines.join("\n"), found: true, truncated: true };
  }

  lines.splice(start, end - start + 1);
  return { content: lines.join("\n"), found: true, truncated: false };
}

function warnBashMacosIfNeeded(shell: Shell): void {
  if (shell !== "bash" || process.platform !== "darwin") return;
  const profile = path.join(os.homedir(), ".bash_profile");
  if (!fs.existsSync(profile)) return;
  if (/\.bashrc/.test(fs.readFileSync(profile, "utf-8"))) return;
  process.stdout.write(
    "⚠ macOS: ~/.bash_profile doesn't source ~/.bashrc, so login shells may skip it.\n" +
      "  Add to ~/.bash_profile:  [ -f ~/.bashrc ] && . ~/.bashrc\n",
  );
}

function install(shell: Shell, rcOverride?: string): void {
  const wrapper = writeInitFile(shell);
  const rc = rcOverride ?? rcPathFor(shell);
  const existing = fs.existsSync(rc) ? fs.readFileSync(rc, "utf-8") : "";
  const { content: stripped, found, truncated } = stripBlock(existing);

  let next = stripped;
  if (next.length > 0 && !next.endsWith("\n")) next += "\n";
  next += `${next.length > 0 ? "\n" : ""}${buildBlock(shell)}\n`;

  fs.mkdirSync(path.dirname(rc), { recursive: true });
  fs.writeFileSync(rc, next);

  if (truncated) {
    process.stdout.write(
      `⚠ ${rc} had a git-wtree block with no closing marker. Removed the marker;\n` +
        "  check for leftover lines from it below your other settings.\n",
    );
  }
  process.stdout.write(`Wrote the wrapper to ${wrapper}\n`);
  process.stdout.write(
    `${found ? "Updated" : "Added"} the git-wtree loader in ${rc}\n`,
  );
  warnBashMacosIfNeeded(shell);
  process.stdout.write(
    "Open a new terminal to apply. Future upgrades refresh the wrapper on their\n" +
      "own — you should not need to run this again.\n",
  );
}

function uninstall(shell: Shell, rcOverride?: string): void {
  const wrapper = initPathFor(shell);
  if (fs.existsSync(wrapper)) {
    fs.rmSync(wrapper, { force: true });
    process.stdout.write(`Removed ${wrapper}\n`);
  }

  const rc = rcOverride ?? rcPathFor(shell);
  if (!fs.existsSync(rc)) {
    process.stdout.write(`Nothing to remove: ${rc} not found.\n`);
    return;
  }
  const { content, found } = stripBlock(fs.readFileSync(rc, "utf-8"));
  if (!found) {
    process.stdout.write(`No git-wtree block found in ${rc}.\n`);
    return;
  }
  fs.writeFileSync(rc, content);
  process.stdout.write(`Removed the git-wtree loader from ${rc}.\n`);
}

export function commandShellInit(
  shell?: string,
  options: { install?: boolean; uninstall?: boolean; rc?: string } = {},
): void {
  const target = detectShell(shell);
  if (options.uninstall) {
    uninstall(target, options.rc);
    return;
  }
  if (options.install) {
    install(target, options.rc);
    return;
  }
  // Printing is for `gitwtree shell-init zsh >> ~/.zshrc`. The wrapper file it
  // points at is written here too, otherwise the loader would point at nothing
  // until the next command.
  writeInitFile(target);
  process.stdout.write(buildBlock(target) + "\n");
}
