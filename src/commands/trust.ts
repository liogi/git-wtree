import { intro, outro, confirm, log, isCancel, cancel } from "@clack/prompts";
import pc from "picocolors";
import {
  readRepoConfigState,
  trustRepoConfig,
  revokeRepoConfigTrust,
  REPO_CONFIG_FILE,
} from "../lib/repoConfig.js";

function listCommands(label: string, commands: string[] | "auto"): string {
  if (commands === "auto") return `  ${label}: auto (detect the package manager)`;
  if (commands.length === 0) return `  ${label}: (none)`;
  return commands.map((c) => `  ${label}: ${pc.yellow(c)}`).join("\n");
}

export async function commandTrust(
  options: { revoke?: boolean } = {},
): Promise<void> {
  intro("gwt trust");

  const state = readRepoConfigState();

  if (!state.repoRoot) {
    log.error("Not inside a git repository.");
    process.exit(1);
  }
  if (state.parseError) {
    log.error(`${REPO_CONFIG_FILE} is invalid: ${state.parseError}`);
    process.exit(1);
  }

  if (options.revoke) {
    const removed = revokeRepoConfigTrust(state);
    log[removed ? "success" : "info"](
      removed
        ? `Trust revoked for ${state.repoRoot}`
        : `${state.repoRoot} was not trusted.`,
    );
    outro("Done");
    return;
  }

  if (!state.file) {
    log.info(
      `No ${REPO_CONFIG_FILE} in ${state.repoRoot} — nothing to trust.`,
    );
    outro("Done");
    return;
  }

  // scanDirs is inert data; only setup/teardown ever need approval.
  if (!state.hasExecutableKeys) {
    log.info(
      `${REPO_CONFIG_FILE} declares no commands — it applies without approval.`,
    );
    outro("Done");
    return;
  }

  if (state.trusted) {
    log.success(`${REPO_CONFIG_FILE} is already trusted (unchanged since).`);
    outro("Done");
    return;
  }

  const lines: string[] = [];
  if (state.file.setup !== undefined)
    lines.push(listCommands("setup   ", state.file.setup));
  if (state.file.teardown !== undefined)
    lines.push(listCommands("teardown", state.file.teardown));

  log.warn(
    `${state.filePath}\nwants git-wtree to run these on your machine:\n\n${lines.join("\n")}`,
  );

  if (!process.stdin.isTTY) {
    log.error("Run this in a terminal to approve.");
    process.exit(1);
  }

  const ok = await confirm({ message: "Trust this file?" });
  if (isCancel(ok) || !ok) {
    cancel("Not trusted — the commands will not run.");
    process.exit(0);
  }

  trustRepoConfig(state);
  log.success("Trusted. Editing the file will require approval again.");
  outro("Done");
}
