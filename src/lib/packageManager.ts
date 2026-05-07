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

export function hasScript(root: string, scriptName: string): boolean {
  const pkgPath = path.join(root, "package.json");
  if (!fs.existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      scripts?: Record<string, string>;
    };
    return Boolean(pkg.scripts?.[scriptName]);
  } catch {
    return false;
  }
}

export function runScript(cwd: string, scriptName: string): void {
  const pm = detectPackageManager(cwd);
  execSync(`${pm} run ${scriptName}`, { cwd, stdio: "inherit" });
}
