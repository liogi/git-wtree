import { execFileSync } from "child_process";
import { intro, outro, log } from "@clack/prompts";
import {
  VERSION,
  detectShell,
  rcPathFor,
  readInstalledBlock,
} from "../lib/shellIntegration.js";

// Health check for the install. Reports what the binary can verify — git,
// version, and the installed shell-integration block (present + version) — and
// guides for what it cannot see: a binary can't inspect the parent shell, so it
// can't tell whether `gwt` currently resolves to the function or the oh-my-zsh
// alias. The user checks that with `type gwt`.
export function commandDoctor(): void {
  intro("gwt doctor");

  try {
    const gitVersion = execFileSync("git", ["--version"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    log.success(gitVersion);
  } catch {
    log.error("git not found on PATH");
  }

  log.success(`gitwtree v${VERSION}`);

  const shell = detectShell();
  const rc = rcPathFor(shell);
  const { present, version } = readInstalledBlock(rc);

  if (!present) {
    log.warn(
      `Shell integration not found in ${rc}.\n   Run: gitwtree shell-init --install`,
    );
  } else if (version && version !== VERSION) {
    log.warn(
      `Shell integration is v${version} in ${rc}, but gitwtree is v${VERSION}.\n   Run: gitwtree shell-init --install to update it.`,
    );
  } else {
    log.success(
      `Shell integration installed in ${rc}${version ? ` (v${version})` : ""}`,
    );
  }

  log.info(
    "A binary can't inspect the current shell — check `gwt` yourself:\n" +
      '   run `type gwt` → "function" is good; "alias" (oh-my-zsh) means the\n' +
      "   integration isn't active — install it and open a new shell.",
  );

  outro("Done");
}
