#!/usr/bin/env node
import { Command } from "commander";
import { commandAdd } from "./commands/add.js";
import { commandRm } from "./commands/rm.js";
import { commandLs } from "./commands/ls.js";
import { commandOpen } from "./commands/open.js";
import { commandPath } from "./commands/path.js";
import { commandShellInit } from "./commands/shellInit.js";
import { commandPr } from "./commands/pr.js";
import {
  commandConfigIde,
  commandConfigScanDirs,
  commandConfigShow,
  commandConfigTheme,
  commandConfigStatusline,
  commandConfigSetup,
  commandConfigTeardown,
} from "./commands/config.js";

const program = new Command();

program
  .name("gitwtree")
  .description("Git worktree manager with .env syncing and IDE integration")
  .version("0.1.6")
  .addHelpText(
    "after",
    '\nAlias: gwt <command>\n\nExamples:\n  gwt add my-feature\n  gwt pr 1234\n  gwt open my-feature\n  gwt switch my-feature   (needs: eval "$(gwt shell-init zsh)")\n  gwt rm my-feature --force\n  gwt config setup "yarn install" "yarn build"',
  );

program
  .command("add <branch>")
  .description("Create a worktree, sync .env files, and run the setup hook")
  .option("--from <base>", "Base branch to create from (default: HEAD)")
  .action((branch: string, options: { from?: string }) =>
    commandAdd(branch, options.from),
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
  .action((number: string | undefined) => commandPr(number));

program.command("ls").description("List all worktrees").action(commandLs);

program
  .command("open [branch]")
  .description("Open a worktree in your IDE (omit to pick one)")
  .action((branch: string | undefined) => commandOpen(branch));

program
  .command("switch [query]")
  .alias("sw")
  .description("Switch (cd) to another worktree (requires the shell wrapper)")
  .action(() => {
    console.error(
      '`gwt switch` needs the shell wrapper. Add this to your shell rc:\n  eval "$(gwt shell-init zsh)"   # or bash / fish\nThen restart your shell.',
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
  .description("Print the shell function for `gwt switch` (zsh|bash|fish)")
  .action((shell: string | undefined) => commandShellInit(shell));

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
