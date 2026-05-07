#!/usr/bin/env node
import { Command } from "commander";
import { commandAdd } from "./commands/add.js";
import { commandRm } from "./commands/rm.js";
import { commandLs } from "./commands/ls.js";
import { commandOpen } from "./commands/open.js";
import {
  commandConfigIde,
  commandConfigScanDirs,
  commandConfigShow,
} from "./commands/config.js";

const program = new Command();

program
  .name("gitwtree")
  .description("Git worktree manager with .env syncing and IDE integration")
  .version("0.1.6")
  .addHelpText(
    "after",
    "\nAlias: gwt <command>\n\nExamples:\n  gwt add my-feature\n  gwt open my-feature\n  gwt rm my-feature\n  gwt config ide",
  );

program
  .command("add <branch>")
  .description("Create a worktree, sync .env files, and install dependencies")
  .option("--from <base>", "Base branch to create from (default: HEAD)")
  .action((branch: string, options: { from?: string }) =>
    commandAdd(branch, options.from),
  );

program
  .command("rm <branch>")
  .description("Remove a worktree")
  .action(commandRm);

program.command("ls").description("List all worktrees").action(commandLs);

program
  .command("open <branch>")
  .description("Open a worktree in your IDE")
  .action(commandOpen);

const configCmd = program
  .command("config")
  .description("Manage git-wtree configuration")
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

// Show help when called with no arguments
if (process.argv.length <= 2) {
  program.help();
}

program.parseAsync(process.argv).catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
