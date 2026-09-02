import { execFileSync } from "child_process";
import { intro, outro, log } from "@clack/prompts";
import pc from "picocolors";
import {
  VERSION,
  detectShell,
  rcPathFor,
  readInstalledBlock,
} from "../lib/shellIntegration.js";

// Health check for the install. Two different questions get answered here, and
// conflating them is what made the old version unhelpful:
//
//   1. Is the block written to the rc file?      → read the file
//   2. Is the block ACTIVE in the shell that     → read GWT_SHELL_INTEGRATION,
//      launched this command?                       which the block exports
//
// (2) is the one that matters — a block installed but never sourced, or shadowed
// by oh-my-zsh's `gwt` alias, looks identical to a missing one from the user's
// side. This used to be handed back as "run `type gwt` yourself".
export function commandDoctor(): void {
  intro("gwt doctor");

  try {
    log.success(
      execFileSync("git", ["--version"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    log.error("git not found on PATH");
  }

  log.success(`gitwtree v${VERSION}`);

  const shell = detectShell();
  const rc = rcPathFor(shell);
  const onDisk = readInstalledBlock(rc);
  const active = process.env.GWT_SHELL_INTEGRATION;

  if (!onDisk.present) {
    log.warn(
      `Shell integration not installed in ${rc}.\n   Run: gitwtree shell-init --install`,
    );
  } else if (onDisk.version && onDisk.version !== VERSION) {
    log.warn(
      `Shell integration in ${rc} is v${onDisk.version}, but gitwtree is v${VERSION}.\n   Run: gitwtree shell-init --install to update it.`,
    );
  } else {
    log.success(
      `Shell integration installed in ${rc}${onDisk.version ? ` (v${onDisk.version})` : ""}`,
    );
  }

  if (!active) {
    log.warn(
      onDisk.present
        ? `Installed, but not active in this shell — GWT_SHELL_INTEGRATION is unset.\n` +
            `   Either you haven't opened a new terminal since installing, or something\n` +
            `   (oh-my-zsh's git plugin aliases ${pc.cyan("gwt")}) is shadowing it.\n` +
            `   Open a new terminal; if it persists, check ${pc.cyan("type gwt")} — it must say "function".`
        : "Not active in this shell either — GWT_SHELL_INTEGRATION is unset.",
    );
  } else if (active !== VERSION) {
    log.warn(
      `Active in this shell, but it is v${active} while gitwtree is v${VERSION}.\n` +
        `   Run: gitwtree shell-init --install, then open a new terminal.`,
    );
  } else {
    log.success(`Active in this shell (v${active}) — \`gwt\` is the function.`);
  }

  outro("Done");
}
