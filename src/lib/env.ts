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

const LOCAL_FILE_PATTERN = /\.local\./;

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

function copyFiles(
  sourceRoot: string,
  destRoot: string,
  files: string[],
): number {
  let copied = 0;
  for (const src of files) {
    const relative = path.relative(sourceRoot, src);
    const dest = path.join(destRoot, relative);
    const destDir = path.dirname(dest);

    if (!fs.existsSync(destDir)) continue;

    fs.copyFileSync(src, dest);
    copied++;
  }
  return copied;
}

export function copyEnvFiles(
  sourceRoot: string,
  destRoot: string,
  scanDirs?: string[] | null,
): void {
  const files = findFiles(
    sourceRoot,
    (name) => ENV_PATTERN.test(name) && !EXCLUDED_FILES.has(name),
    scanDirs,
  );
  const copied = copyFiles(sourceRoot, destRoot, files);

  if (copied > 0) {
    log.success(`Copied ${copied} .env file${copied !== 1 ? "s" : ""}`);
  } else {
    log.info("No .env files found to copy");
  }
}

export function copyLocalFiles(sourceRoot: string, destRoot: string): void {
  const files = findFiles(sourceRoot, (name) => LOCAL_FILE_PATTERN.test(name));
  const copied = copyFiles(sourceRoot, destRoot, files);

  if (copied > 0) {
    log.success(`Copied ${copied} local file${copied !== 1 ? "s" : ""}`);
  }
}
