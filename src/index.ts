#!/usr/bin/env node
import { readFileSync } from "fs";
import { Command } from "commander";
import { refreshInitFileIfInstalled } from "./lib/shellIntegration.js";
import { commandAdd } from "./commands/add.js";
import { commandRm } from "./commands/rm.js";
import { commandLs } from "./commands/ls.js";
import { commandOpen } from "./commands/open.js";
import { commandPath } from "./commands/path.js";
import { commandShellInit } from "./commands/shellInit.js";
import { commandDoctor } from "./commands/doctor.js";
import { commandPr } from "./commands/pr.js";
import { commandSyncEnv } from "./commands/syncEnv.js";
import { commandTrust } from "./commands/trust.js";
import { commandPrune } from "./commands/prune.js";
import {
  commandConfigIde,
  commandConfigScanDirs,
  commandConfigShow,
  commandConfigTheme,
  commandConfigStatusline,
  commandConfigSetup,
  commandConfigTeardown,
} from "./commands/config.js";

// An upgrade replaces the binary but not the wrapper the shell sourced. Refresh
// it here so `npm i -g git-wtree@latest` is the only step: the next terminal
// picks up the new wrapper with nothing else to run. Only touches a wrapper that
// already exists — installing is the user's choice, not a side effect.
refreshInitFileIfInstalled();

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
) as { version: string };

const program = new Command();

program
  .name("gitwtree")
  .description("Git worktree manager with .env syncing and IDE integration")
  .version(pkg.version)
  .addHelpText(
    "after",
    '\nAlias: gwt <command>\n\nExamples:\n  gwt add my-feature\n  gwt pr 1234\n  gwt open my-feature\n  gwt switch my-feature   (needs: gitwtree shell-init --install)\n  gwt rm my-feature --force\n  gwt sync-env --all --apply\n  gwt config setup "yarn install" "yarn build"\n  gwt trust',
  );

program
  .command("add <branch>")
  .description("Create a worktree, sync .env files, and run the setup hook")
  .option("--from <base>", "Base branch to create from (default: HEAD)")
  .option(
    "--force",
    "Reset to remote even when the branch has unpushed commits",
  )
  .option("--open", "Open the new worktree in your IDE")
  .action(
    (
      branch: string,
      options: { from?: string; force?: boolean; open?: boolean },
    ) =>
      commandAdd(branch, options.from, {
        force: options.force,
        open: options.open,
      }),
  );

program
  .command("rm [branch]")
  .description("Remove a worktree (omit to pick one)")
  .option("--force", "Remove even with uncommitted/unpushed changes")
  .action((branch: string | undefined, options: { force?: boolean }) =>
    commandRm(branch, options),
  );

program
  .command("pr [number]")
  .description("Create a worktree from a GitHub PR (omit number to pick one)")
  .option("--open", "Open the new worktree in your IDE")
  .action((number: string | undefined, options: { open?: boolean }) =>
    commandPr(number, options),
  );

program.command("ls").description("List all worktrees").action(commandLs);

program
  .command("open [branch]")
  .description("Open a worktree in your IDE (omit to pick one)")
  .action((branch: string | undefined) => commandOpen(branch));

program
  .command("switch [query]")
  .alias("sw")
  .description(
    "Switch (cd) to another worktree (requires the shell integration)",
  )
  .action(() => {
    console.error(
      "`gwt switch` needs the shell integration. Run:\n  gitwtree shell-init --install\nThen open a new terminal.",
    );
    process.exit(1);
  });

program
  .command("path [query]")
  .description(
    "Resolve a worktree's path (used by `gwt switch` via the shell wrapper)",
  )
  .option(
    "--out <file>",
    "Write the resolved path to this file instead of stdout",
  )
  .action((query: string | undefined, options: { out?: string }) =>
    commandPath(query, options.out),
  );

program
  .command("shell-init [shell]")
  .description(
    "Print — or --install — the gwt shell integration (zsh|bash|fish)",
  )
  .option("--install", "Write the integration block into your shell rc")
  .option("--uninstall", "Remove the integration block from your shell rc")
  .option("--rc <path>", "Target this rc file instead of the shell default")
  .action(
    (
      shell: string | undefined,
      options: { install?: boolean; uninstall?: boolean; rc?: string },
    ) => commandShellInit(shell, options),
  );

program
  .command("sync-env [query]")
  .description(
    "Re-copy .env files from the main worktree (dry-run unless --apply)",
  )
  .option("--apply", "Actually copy the files (default is a dry run)")
  .option("--all", "Sync every secondary worktree instead of picking one")
  .action(
    (query: string | undefined, options: { apply?: boolean; all?: boolean }) =>
      commandSyncEnv(query, options),
  );

program
  .command("prune")
  .description(
    "Remove worktrees whose branch has been merged (dry-run unless --apply)",
  )
  .option("--apply", "Actually remove them (default is a dry run)")
  .option("--force", "Include worktrees with uncommitted or unpushed work")
  .option("--base <ref>", "Compare against this ref instead of the main branch")
  .action((options: { apply?: boolean; force?: boolean; base?: string }) =>
    commandPrune(options),
  );

program
  .command("trust")
  .description(
    "Approve this repo's .gitwtree.json to run its setup/teardown commands",
  )
  .option("--revoke", "Withdraw approval for this repo")
  .action((options: { revoke?: boolean }) => commandTrust(options));

program
  .command("doctor")
  .description("Diagnose the git-wtree install (integration, versions)")
  .action(commandDoctor);

const configCmd = program
  .command("config")
  .description("Manage git-wtree configuration");

configCmd
  .command("show", { isDefault: true })
  .description("Show current configuration")
  .action(commandConfigShow);

configCmd
  .command("ide")
  .description("Configure your IDE")
  .action(commandConfigIde);

configCmd
  .command("scan-dirs [dirs]")
  .description(
    "Set directories to scan for .env files (comma-separated). Omit to show current value.",
  )
  .option("--reset", "Reset to auto recursive scan")
  .action((dirs: string | undefined, options: { reset?: boolean }) =>
    commandConfigScanDirs(dirs, options.reset),
  );

configCmd
  .command("theme [value]")
  .description(
    "Enable/disable per-worktree VS Code color + title (on/off). Omit to show current value.",
  )
  .action((value: string | undefined) => commandConfigTheme(value));

configCmd
  .command("statusline [value]")
  .description(
    "Enable/disable the Claude Code branch statusline (on/off). Omit to show current value.",
  )
  .action((value: string | undefined) => commandConfigStatusline(value));

configCmd
  .command("setup [commands...]")
  .description(
    "Set post-create commands. 'auto' = install if package.json; 'none' = nothing. Omit to show current value.",
  )
  .action((commands: string[]) => commandConfigSetup(commands));

configCmd
  .command("teardown [commands...]")
  .description(
    "Set pre-remove commands run in the worktree. 'none' = clear. Omit to show current value.",
  )
  .action((commands: string[]) => commandConfigTeardown(commands));

// Show help when called with no arguments
if (process.argv.length <= 2) {
  program.help();
}

program.parseAsync(process.argv).catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
