import { execSync } from "child_process";
import fs from "fs";
import path from "path";

type PackageManager = "yarn" | "npm" | "pnpm" | "bun";

export function detectPackageManager(root: string): PackageManager {
  if (fs.existsSync(path.join(root, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  return "npm";
}

export function installDeps(root: string): void {
  const pm = detectPackageManager(root);
  const cmd = `${pm} install`;
  execSync(cmd, { cwd: root, stdio: "inherit" });
}
