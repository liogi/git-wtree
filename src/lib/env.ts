import fs from "fs";
import path from "path";
import { log } from "@clack/prompts";

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".nx",
  ".cache",
  ".next",
  ".turbo",
  "coverage",
]);

const ENV_PATTERN = /^\.env/;

const EXCLUDED_FILES = new Set([
  ".env.test",
  ".env.example",
  ".env.tpl",
  ".env.template",
  ".env.sample",
]);

function isEnvFile(name: string): boolean {
  return ENV_PATTERN.test(name) && !EXCLUDED_FILES.has(name);
}

function scanDir(
  dir: string,
  results: string[],
  matcher: (name: string) => boolean,
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name)) {
      scanDir(path.join(dir, entry.name), results, matcher);
    } else if (entry.isFile() && matcher(entry.name)) {
      results.push(path.join(dir, entry.name));
    }
  }
}

function findFiles(
  root: string,
  matcher: (name: string) => boolean,
  scanDirs?: string[] | null,
): string[] {
  const files: string[] = [];

  if (scanDirs && scanDirs.length > 0) {
    for (const dir of scanDirs) {
      const fullDir = path.join(root, dir);
      if (fs.existsSync(fullDir)) {
        scanDir(fullDir, files, matcher);
      }
    }
  } else {
    scanDir(root, files, matcher);
  }

  return files;
}

export type EnvSyncStatus = "new" | "overwrite" | "skipped";

export interface EnvSyncEntry {
  relPath: string;
  status: EnvSyncStatus;
}

// Builds the list of .env* files to copy from source to dest, classifying each:
// "overwrite" (dest already has the file), "new" (absent), or "skipped" (the
// file's parent directory doesn't exist in the destination worktree).
export function planEnvSync(
  sourceRoot: string,
  destRoot: string,
  scanDirs?: string[] | null,
): EnvSyncEntry[] {
  const files = findFiles(sourceRoot, isEnvFile, scanDirs);
  return files.map((src) => {
    const relPath = path.relative(sourceRoot, src);
    const dest = path.join(destRoot, relPath);
    if (!fs.existsSync(path.dirname(dest))) {
      return { relPath, status: "skipped" };
    }
    return { relPath, status: fs.existsSync(dest) ? "overwrite" : "new" };
  });
}

// Applies a plan, copying every non-skipped entry. Returns the number copied.
export function applyEnvSync(
  sourceRoot: string,
  destRoot: string,
  plan: EnvSyncEntry[],
): number {
  let copied = 0;
  for (const entry of plan) {
    if (entry.status === "skipped") continue;
    fs.copyFileSync(
      path.join(sourceRoot, entry.relPath),
      path.join(destRoot, entry.relPath),
    );
    copied++;
  }
  return copied;
}

export function copyEnvFiles(
  sourceRoot: string,
  destRoot: string,
  scanDirs?: string[] | null,
): void {
  const plan = planEnvSync(sourceRoot, destRoot, scanDirs);
  const copied = applyEnvSync(sourceRoot, destRoot, plan);

  if (copied > 0) {
    log.success(`Copied ${copied} .env file${copied !== 1 ? "s" : ""}`);
  } else {
    log.info("No .env files found to copy");
  }
}
