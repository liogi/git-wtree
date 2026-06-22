import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { log } from "@clack/prompts";
import { detectPackageManager, hasScript } from "./packageManager.js";
import type { WtreeConfig } from "./config.js";

function hasPackageJson(root: string): boolean {
  return fs.existsSync(path.join(root, "package.json"));
}

// Resolves the commands to run after a worktree is created.
// "auto" (default): install (+ prepare if the script exists) when a package.json
// is present; nothing otherwise — so non-Node repos stay untouched.
export function resolveSetupCommands(
  worktreePath: string,
  config: WtreeConfig,
): string[] {
  if (Array.isArray(config.setup)) return config.setup;

  if (!hasPackageJson(worktreePath)) return [];

  const pm = detectPackageManager(worktreePath);
  const commands = [`${pm} install`];
  if (hasScript(worktreePath, "prepare")) commands.push(`${pm} run prepare`);
  return commands;
}

// Runs commands sequentially in the worktree, stopping at the first failure.
// Returns true if all succeeded. Callers decide whether a failure is fatal.
export function runCommands(
  worktreePath: string,
  commands: string[],
  context: string,
): boolean {
  for (const command of commands) {
    log.step(`${context}: ${command}`);
    try {
      execSync(command, { cwd: worktreePath, stdio: "inherit" });
    } catch (e) {
      log.warn(`Command failed (${command}): ${(e as Error).message}`);
      return false;
    }
  }
  return true;
}
