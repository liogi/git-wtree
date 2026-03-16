import { select, text, isCancel, cancel, log } from "@clack/prompts";
import { execSync } from "child_process";
import { readConfig, updateConfig } from "./config.js";

interface KnownIde {
  label: string;
  value: string;
  command: string | null;
}

const KNOWN_IDES: KnownIde[] = [
  { label: "VS Code", value: "vscode", command: "code --new-window {path}" },
  { label: "Cursor", value: "cursor", command: "cursor --new-window {path}" },
  { label: "Zed", value: "zed", command: "zed {path}" },
  { label: "WebStorm", value: "webstorm", command: "webstorm {path}" },
  { label: "IntelliJ IDEA", value: "idea", command: "idea {path}" },
  { label: "PyCharm", value: "pycharm", command: "pycharm {path}" },
  { label: "GoLand", value: "goland", command: "goland {path}" },
  { label: "Vim", value: "vim", command: null },
  { label: "Neovim", value: "nvim", command: null },
  { label: "Sublime Text", value: "sublime", command: "subl {path}" },
  { label: "Other…", value: "other", command: null },
];

export async function runIdeWizard(): Promise<void> {
  const selected = await select({
    message: "Which IDE do you use?",
    options: KNOWN_IDES.map((ide) => ({ label: ide.label, value: ide.value })),
  });

  if (isCancel(selected)) {
    cancel("IDE setup cancelled");
    process.exit(0);
  }

  if (selected === "other") {
    const ideName = await text({
      message: "IDE name:",
      placeholder: "Sublime Text",
      validate: (v) => (v.trim() ? undefined : "Name is required"),
    });

    if (isCancel(ideName)) {
      cancel("IDE setup cancelled");
      process.exit(0);
    }

    const ideCommand = await text({
      message: "Command to open a folder (use {path} as placeholder):",
      placeholder: "subl {path}",
      validate: (v) =>
        v.trim()
          ? v.includes("{path}")
            ? undefined
            : "Command must include {path}"
          : "Command is required",
    });

    if (isCancel(ideCommand)) {
      cancel("IDE setup cancelled");
      process.exit(0);
    }

    updateConfig({ ide: ideName as string, ideCommand: ideCommand as string });
    log.success(`IDE configured: ${ideName as string}`);
    return;
  }

  const found = KNOWN_IDES.find((ide) => ide.value === selected);
  if (!found) return;

  if (!found.command) {
    updateConfig({ ide: selected as string, ideCommand: undefined });
    log.info(
      `IDE set to ${found.label}. Terminal-based IDEs won't be auto-opened.\nUse "cd $(wtree path <branch>)" to navigate to the worktree.`,
    );
    return;
  }

  updateConfig({ ide: selected as string, ideCommand: found.command });
  log.success(`IDE configured: ${found.label}`);
}

export function openInIde(worktreePath: string): void {
  const config = readConfig();

  if (!config.ideCommand) {
    log.info(`Worktree path: ${worktreePath}`);
    return;
  }

  const cmd = config.ideCommand.replace("{path}", `"${worktreePath}"`);
  execSync(cmd, { stdio: "ignore" });
}
