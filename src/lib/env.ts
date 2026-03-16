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

function scanDir(dir: string, results: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name)) {
      scanDir(path.join(dir, entry.name), results);
    } else if (
      entry.isFile() &&
      ENV_PATTERN.test(entry.name) &&
      !EXCLUDED_FILES.has(entry.name)
    ) {
      results.push(path.join(dir, entry.name));
    }
  }
}

function findEnvFiles(root: string, scanDirs?: string[] | null): string[] {
  const files: string[] = [];

  if (scanDirs && scanDirs.length > 0) {
    for (const dir of scanDirs) {
      const fullDir = path.join(root, dir);
      if (fs.existsSync(fullDir)) {
        scanDir(fullDir, files);
      }
    }
  } else {
    scanDir(root, files);
  }

  return files;
}

export function copyEnvFiles(
  sourceRoot: string,
  destRoot: string,
  scanDirs?: string[] | null,
): void {
  const files = findEnvFiles(sourceRoot, scanDirs);

  let copied = 0;
  for (const src of files) {
    const relative = path.relative(sourceRoot, src);
    const dest = path.join(destRoot, relative);
    const destDir = path.dirname(dest);

    if (!fs.existsSync(destDir)) continue;

    fs.copyFileSync(src, dest);
    copied++;
  }

  if (copied > 0) {
    log.success(`Copied ${copied} .env file${copied !== 1 ? "s" : ""}`);
  } else {
    log.info("No .env files found to copy");
  }
}
