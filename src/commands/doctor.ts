import { execFileSync } from "child_process";
import { intro, outro, log } from "@clack/prompts";
import pc from "picocolors";
import {
  VERSION,
  detectShell,
  rcPathFor,
  blockPresent,
  initFileState,
  wrapperRev,
} from "../lib/shellIntegration.js";

// Three things fail independently, and reporting them as one line is what made
// the old version unhelpful:
//
//   1. the loader is in the rc            → read the rc
//   2. the wrapper file exists and is current → read ~/.config/git-wtree
//   3. the wrapper is LIVE in this shell  → read GWT_SHELL_INTEGRATION
//
// (3) is the one that matters, and the one a binary was long assumed unable to
// see. The wrapper exports its own revision, and every process it launches
// inherits it.
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
  const loaded = blockPresent(rc);
  const wrapper = initFileState(shell);
  const expected = wrapperRev(shell);
  const active = process.env.GWT_SHELL_INTEGRATION;

  if (!loaded) {
    log.warn(
      `No git-wtree loader in ${rc}.\n   Run: gitwtree shell-init --install`,
    );
  } else {
    log.success(`Loader present in ${rc}`);
  }

  if (!wrapper.exists) {
    log.warn(
      `Wrapper missing at ${wrapper.path}.\n   Run: gitwtree shell-init --install`,
    );
  } else if (wrapper.stale) {
    // Should not happen: any command refreshes it. Worth saying if it does.
    log.warn(`Wrapper at ${wrapper.path} is out of date and could not refresh.`);
  } else {
    log.success(`Wrapper up to date at ${wrapper.path}`);
  }

  if (!active) {
    log.warn(
      loaded
        ? `Not active in this shell — GWT_SHELL_INTEGRATION is unset.\n` +
            `   Open a new terminal. If it persists, something is shadowing it\n` +
            `   (oh-my-zsh's git plugin aliases ${pc.cyan("gwt")}); check ${pc.cyan("type gwt")}.`
        : "Not active in this shell either — GWT_SHELL_INTEGRATION is unset.",
    );
  } else if (active !== expected) {
    log.warn(
      `This shell is running an older wrapper.\n   Open a new terminal — nothing to reinstall.`,
    );
  } else {
    log.success(`Active in this shell — \`gwt\` is the function.`);
  }

  outro("Done");
}
