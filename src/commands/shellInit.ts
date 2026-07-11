import fs from "fs";
import os from "os";
import path from "path";
import {
  BEGIN,
  END,
  VERSION,
  detectShell,
  rcPathFor,
  type Shell,
} from "../lib/shellIntegration.js";

// zsh / bash function. `gwt switch` lets the binary render its picker on the
// terminal and hands the chosen path back through a temp file, then cd's into it
// (a binary can't change the parent shell's cwd on its own).
//
// The leading `unalias` clears oh-my-zsh's git-plugin aliases (gwt → git worktree)
// so the function can define cleanly and win over them; harmless otherwise. The
// function body is wrapped in an inner `eval` so it is parsed only AFTER the
// unalias runs — zsh expands aliases at parse time, and a single outer eval would
// parse the whole block (alias still active) before the unalias executes.
// Crucially, nothing here runs `gitwtree` at source-time: the only call is
// `command gitwtree` inside the body, at run-time. See docs/adr/0001.
const POSIX = `unalias gwt gwta gwtls gwtmv gwtrm 2>/dev/null
eval 'gwt() {
  case "$1" in
    switch|sw)
      local _gwt_out _gwt_dir
      _gwt_out="$(mktemp)" || return
      command gitwtree path --out "$_gwt_out" "\${@:2}"
      _gwt_dir="$(cat "$_gwt_out" 2>/dev/null)"
      rm -f "$_gwt_out"
      [ -n "$_gwt_dir" ] && cd "$_gwt_dir"
      ;;
    *)
      command gitwtree "$@"
      ;;
  esac
}'`;

const FISH = `function gwt
  if test "$argv[1]" = switch -o "$argv[1]" = sw
    set -l _gwt_out (mktemp)
    command gitwtree path --out "$_gwt_out" $argv[2..-1]
    set -l _gwt_dir (cat "$_gwt_out" 2>/dev/null)
    rm -f "$_gwt_out"
    test -n "$_gwt_dir"; and cd "$_gwt_dir"
  else
    command gitwtree $argv
  end
end`;

function snippetFor(shell: Shell): string {
  return shell === "fish" ? FISH : POSIX;
}

function buildBlock(shell: Shell): string {
  const header = `${BEGIN} v${VERSION} (managed by \`gitwtree shell-init --install\` — do not edit)`;
  return `${header}\n${snippetFor(shell)}\n${END}`;
}

// Removes an existing git-wtree block (plus a single blank line above it, to
// avoid leaving gaps). Returns whether one was found.
function stripBlock(content: string): { content: string; found: boolean } {
  const lines = content.split("\n");
  const begin = lines.findIndex((l) => l.startsWith(BEGIN));
  if (begin === -1) return { content, found: false };
  let end = -1;
  for (let i = begin; i < lines.length; i++) {
    if (lines[i].startsWith(END)) {
      end = i;
      break;
    }
  }
  if (end === -1) return { content, found: false };

  let start = begin;
  if (start > 0 && lines[start - 1].trim() === "") start -= 1;
  lines.splice(start, end - start + 1);
  return { content: lines.join("\n"), found: true };
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
  const rc = rcOverride ?? rcPathFor(shell);
  const existing = fs.existsSync(rc) ? fs.readFileSync(rc, "utf-8") : "";
  const { content: stripped, found } = stripBlock(existing);

  let next = stripped;
  if (next.length > 0 && !next.endsWith("\n")) next += "\n";
  next += `${next.length > 0 ? "\n" : ""}${buildBlock(shell)}\n`;

  fs.mkdirSync(path.dirname(rc), { recursive: true });
  fs.writeFileSync(rc, next);

  process.stdout.write(
    `${found ? "Updated" : "Added"} git-wtree shell integration in ${rc}\n`,
  );
  warnBashMacosIfNeeded(shell);
  process.stdout.write("Open a new terminal to apply.\n");
}

function uninstall(shell: Shell, rcOverride?: string): void {
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
  process.stdout.write(`Removed git-wtree shell integration from ${rc}.\n`);
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
  process.stdout.write(snippetFor(target) + "\n");
}
